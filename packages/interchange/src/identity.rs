//! Who a station or an office is, and how it is recognised.

use curve25519_dalek::montgomery::MontgomeryPoint;
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdentityKind {
    PoliceStation,
    DppOffice,
}

/// What can be shared: enough to verify a signature and to seal a package for
/// this identity. Keys are 32 bytes, carried as hex.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIdentity {
    pub id: String,
    pub kind: IdentityKind,
    /// "Wandegeya Police Station", "Wandegeya DPP Office": what people call it.
    pub name: String,
    /// The area it handles, in words.
    pub jurisdiction: Option<String>,
    pub verifying_key: String,
    pub encryption_key: String,
}

/// The secret side. Whoever holds this is the station or the office, so it is
/// kept only inside the application's encrypted store and is never written into
/// a package.
#[derive(Clone)]
pub struct Identity {
    pub public: PublicIdentity,
    signing: SigningKey,
    encryption_secret: [u8; 32],
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn unhex32(text: &str) -> Option<[u8; 32]> {
    if text.len() != 64 || !text.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

impl Identity {
    pub fn generate(kind: IdentityKind, name: &str, jurisdiction: Option<&str>) -> Identity {
        let signing = SigningKey::generate(&mut OsRng);
        let mut secret = [0u8; 32];
        OsRng.fill_bytes(&mut secret);
        Identity::from_parts(uuid::Uuid::new_v4().to_string(), kind, name, jurisdiction, signing, secret)
    }

    fn from_parts(id: String, kind: IdentityKind, name: &str, jurisdiction: Option<&str>, signing: SigningKey, encryption_secret: [u8; 32]) -> Identity {
        let public = PublicIdentity {
            id,
            kind,
            name: name.trim().to_string(),
            jurisdiction: jurisdiction.map(|j| j.trim().to_string()).filter(|j| !j.is_empty()),
            verifying_key: hex(signing.verifying_key().as_bytes()),
            encryption_key: hex(&MontgomeryPoint::mul_base_clamped(encryption_secret).0),
        };
        Identity { public, signing, encryption_secret }
    }

    /// Rebuilds an identity from what was stored.
    pub fn restore(public: PublicIdentity, signing_secret: [u8; 32], encryption_secret: [u8; 32]) -> Option<Identity> {
        let restored = Identity::from_parts(public.id.clone(), public.kind, &public.name, public.jurisdiction.as_deref(), SigningKey::from_bytes(&signing_secret), encryption_secret);
        // The stored public keys must be the ones these secrets make.
        (restored.public.verifying_key == public.verifying_key && restored.public.encryption_key == public.encryption_key).then_some(restored)
    }

    pub fn signing_secret(&self) -> [u8; 32] {
        self.signing.to_bytes()
    }

    pub fn encryption_secret(&self) -> [u8; 32] {
        self.encryption_secret
    }

    pub(crate) fn signing(&self) -> &SigningKey {
        &self.signing
    }

    pub(crate) fn shared_with(&self, peer_public: &[u8; 32]) -> [u8; 32] {
        MontgomeryPoint(*peer_public).mul_clamped(self.encryption_secret).0
    }
}

impl PublicIdentity {
    pub fn verifying(&self) -> Option<VerifyingKey> {
        VerifyingKey::from_bytes(&unhex32(&self.verifying_key)?).ok()
    }

    pub fn encryption_bytes(&self) -> Option<[u8; 32]> {
        unhex32(&self.encryption_key)
    }

    /// The short code two people compare, by voice or in person, to be sure the
    /// keys they hold are each other's. It covers both keys and the name, so a
    /// key swapped for another, or a name changed, gives a different code.
    /// Twenty hex digits in five groups.
    pub fn fingerprint(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(b"pleadli/fingerprint/v1");
        hasher.update(self.id.as_bytes());
        hasher.update(self.verifying_key.as_bytes());
        hasher.update(self.encryption_key.as_bytes());
        hasher.update(self.name.as_bytes());
        let digest = hasher.finalize();
        let text = hex(&digest[..10]).to_uppercase();
        text.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join("-")
    }
}

/// A fresh ephemeral key pair for one package, returned as (secret, public).
pub(crate) fn ephemeral() -> ([u8; 32], [u8; 32]) {
    let mut secret = [0u8; 32];
    OsRng.fill_bytes(&mut secret);
    (secret, MontgomeryPoint::mul_base_clamped(secret).0)
}

pub(crate) fn shared_secret(secret: &[u8; 32], peer_public: &[u8; 32]) -> [u8; 32] {
    MontgomeryPoint(*peer_public).mul_clamped(*secret).0
}
