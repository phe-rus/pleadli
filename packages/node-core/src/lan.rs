//! A node's own TLS identity and the pinned client that trusts it, for a
//! Pleadli application serving other computers on a local network (moved here
//! from Prisons' `domain/tls.rs` for Lawyers' firm office, L6; Prisons still
//! carries its own copy until its HTTP client moves to this crate's version).
//!
//! A local network has no certificate authority and no reliable DNS. The node
//! therefore makes a self-signed certificate once, and a computer that joins
//! is shown its SHA-256 fingerprint and pins it. From then on it trusts exactly
//! that certificate and nothing else, whatever address the node has today.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine as _;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, SignatureScheme};
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct NodeCert {
    pub cert_pem: String,
    pub key_pem: String,
    /// SHA-256 of the certificate, upper-case hex in pairs joined by `:`.
    pub fingerprint: String,
}

fn tls_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("tls")
}

/// Installs the process-wide crypto provider (ring). Safe to call repeatedly.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn pem_to_der(pem: &str) -> Option<Vec<u8>> {
    let body: String = pem.lines().filter(|l| !l.starts_with("-----")).collect();
    base64::engine::general_purpose::STANDARD.decode(body.trim()).ok()
}

/// Formats a fingerprint for display and comparison: `AB:CD:...`.
pub fn fingerprint_of(der: &[u8]) -> String {
    let digest = Sha256::digest(der);
    digest.iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(":")
}

/// What a person types or pastes is compared without regard to case or
/// separators.
pub fn normalise_fingerprint(text: &str) -> String {
    text.chars().filter(|c| c.is_ascii_hexdigit()).collect::<String>().to_ascii_uppercase()
}

pub fn load_or_create(data_dir: &Path, common_name: &str) -> io::Result<NodeCert> {
    let dir = tls_dir(data_dir);
    let cert_path = dir.join("cert.pem");
    let key_path = dir.join("key.pem");
    if !(cert_path.exists() && key_path.exists()) {
        return generate(data_dir, common_name);
    }
    let cert_pem = fs::read_to_string(&cert_path)?;
    let key_pem = fs::read_to_string(&key_path)?;
    let der = pem_to_der(&cert_pem).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "unreadable certificate"))?;
    Ok(NodeCert { fingerprint: fingerprint_of(&der), cert_pem, key_pem })
}

/// Makes a new identity. Every enrolled workstation must be told the new
/// fingerprint, so this is an explicit administrator action, not automatic.
pub fn generate(data_dir: &Path, common_name: &str) -> io::Result<NodeCert> {
    let dir = tls_dir(data_dir);
    fs::create_dir_all(&dir)?;

    let names = vec!["pleadli-node".to_string(), "localhost".to_string()];
    let mut params = rcgen::CertificateParams::new(names).map_err(io::Error::other)?;
    params.distinguished_name.push(rcgen::DnType::CommonName, common_name);
    use chrono::Datelike as _;
    let today = chrono::Utc::now();
    params.not_before = rcgen::date_time_ymd(today.year() - 1, 1, 1);
    params.not_after = rcgen::date_time_ymd(today.year() + 10, 12, 28);
    let key_pair = rcgen::KeyPair::generate().map_err(io::Error::other)?;
    let cert = params.self_signed(&key_pair).map_err(io::Error::other)?;

    let cert_pem = cert.pem();
    let key_pem = key_pair.serialize_pem();
    fs::write(dir.join("cert.pem"), &cert_pem)?;
    let key_path = dir.join("key.pem");
    fs::write(&key_path, &key_pem)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(NodeCert { fingerprint: fingerprint_of(cert.der()), cert_pem, key_pem })
}

#[derive(Debug)]
struct Pinned {
    fingerprint: String,
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for Pinned {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        if normalise_fingerprint(&fingerprint_of(end_entity.as_ref())) == self.fingerprint {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General("the node's certificate does not match the fingerprint it was enrolled with".into()))
        }
    }

    fn verify_tls12_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn verify_tls13_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

/// Sees which certificate a server presents and accepts it, so a person can be
/// shown its fingerprint and decide. It proves nothing about the server and is
/// used for exactly one thing: the identity probe. Nothing a node must keep
/// secret is ever sent through a client built on it.
#[derive(Debug)]
struct Capture {
    seen: Arc<Mutex<Option<String>>>,
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for Capture {
    fn verify_server_cert(&self, end_entity: &CertificateDer<'_>, _: &[CertificateDer<'_>], _: &ServerName<'_>, _: &[u8], _: UnixTime) -> Result<ServerCertVerified, rustls::Error> {
        *self.seen.lock().unwrap() = Some(fingerprint_of(end_entity.as_ref()));
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn verify_tls13_signature(&self, message: &[u8], cert: &CertificateDer<'_>, dss: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

/// A client that records the certificate the server presents. Read the
/// fingerprint from the returned cell after a request has completed.
pub fn capture_client(timeout: Duration) -> Result<(reqwest::Client, Arc<Mutex<Option<String>>>), String> {
    install_crypto_provider();
    let seen = Arc::new(Mutex::new(None));
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(Capture { seen: seen.clone(), provider }))
        .with_no_client_auth();
    let client = reqwest::Client::builder().use_preconfigured_tls(config).timeout(timeout).build().map_err(|e| e.to_string())?;
    Ok((client, seen))
}

/// An HTTP client that talks to one node and trusts only its pinned
/// certificate.
pub fn pinned_client(fingerprint: &str, timeout: Duration) -> Result<reqwest::Client, String> {
    install_crypto_provider();
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(Pinned { fingerprint: normalise_fingerprint(fingerprint), provider }))
        .with_no_client_auth();
    reqwest::Client::builder().use_preconfigured_tls(config).timeout(timeout).build().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_identity_reloads_with_the_same_fingerprint() {
        let dir = std::env::temp_dir().join(format!("pleadli-tls-test-{}", uuid::Uuid::new_v4()));
        let made = load_or_create(&dir, "test").unwrap();
        let again = load_or_create(&dir, "test").unwrap();
        assert_eq!(made.fingerprint, again.fingerprint);
        assert_eq!(made.fingerprint.split(':').count(), 32);
        let other = generate(&dir, "test").unwrap();
        assert_ne!(made.fingerprint, other.fingerprint, "regenerating makes a new identity");
    }

    #[test]
    fn fingerprints_compare_without_case_or_separators() {
        assert_eq!(normalise_fingerprint("ab:CD ef"), "ABCDEF");
        assert_eq!(normalise_fingerprint("ABCDEF"), "ABCDEF");
    }
}
