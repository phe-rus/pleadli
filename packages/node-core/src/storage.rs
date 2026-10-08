//! Where a backup goes once `backup::write_backup` has locked it
//! (docs/platform/ORCHESTRA-BACKUP.md): a folder or drive, S3-compatible
//! storage, or an SFTP server. The institution owns the storage; Pleadli never
//! sees it. Settings come plain from `backup/config`, the secret sealed to this
//! computer, and the file is already encrypted before any of this runs, so the
//! storage itself learns nothing but sizes and times.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use x25519_dalek::StaticSecret;

use crate::backup::{open_seal, storage_context};

/// The file name ending every backup carries.
pub const EXTENSION: &str = "pleadli-backup";
const CONNECT: Duration = Duration::from_secs(30);

/// Told apart so each app can say it in its own words.
#[derive(Debug)]
pub enum StorageError {
    /// An administrator has not yet given this computer access to the storage.
    NotApproved,
    /// The settings or the opened secret are not what this kind of storage needs.
    Settings(String),
    /// The SFTP server showed a key other than the one the administrator pinned.
    /// Carries the key it showed, so someone can compare it with the server's.
    HostKey { expected: String, seen: String },
    /// The storage refused the user name, password, key or access key.
    Denied(String),
    /// Could not reach the storage, or it broke off.
    Network(String),
    /// The storage answered with an error.
    Refused { status: u16, message: String },
    Io(std::io::Error),
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::NotApproved => write!(f, "this computer has not been given access to the storage"),
            StorageError::Settings(m) => write!(f, "storage settings: {m}"),
            StorageError::HostKey { expected, seen } => write!(f, "the server's key is {seen}, not {expected}"),
            StorageError::Denied(m) => write!(f, "the storage refused the sign-in: {m}"),
            StorageError::Network(m) => write!(f, "could not reach the storage: {m}"),
            StorageError::Refused { status, message } => write!(f, "the storage answered {status}: {message}"),
            StorageError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        StorageError::Io(e)
    }
}

/// One entry of `backup/config`'s `storage` list.
#[derive(Debug, Clone, Deserialize)]
pub struct StorageEntry {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub settings: Value,
    #[serde(default)]
    pub approved: bool,
    pub sealed: Option<String>,
}

#[derive(Debug, Clone)]
pub enum SftpAuth {
    Password(String),
    /// An OpenSSH or PEM private key, unencrypted.
    Key(String),
}

/// A storage this computer may write to, with its secret opened.
#[derive(Clone)]
pub enum Target {
    Folder { path: PathBuf },
    S3 { endpoint: String, region: String, bucket: String, prefix: String, access_key_id: String, secret_access_key: String },
    Sftp { host: String, port: u16, username: String, path: String, host_key: String, auth: SftpAuth },
}

fn setting(settings: &Value, name: &str) -> String {
    settings.get(name).and_then(Value::as_str).unwrap_or("").trim().to_string()
}

fn required(settings: &Value, name: &str) -> Result<String, StorageError> {
    let v = setting(settings, name);
    if v.is_empty() {
        return Err(StorageError::Settings(format!("{name} is missing")));
    }
    Ok(v)
}

impl Target {
    /// Opens the entry's secret with this computer's seal key. The seal names
    /// the storage and the computer, so one sealed for another fails here.
    pub fn open(entry: &StorageEntry, seal_key: &StaticSecret, computer_id: &str) -> Result<Target, StorageError> {
        if !entry.approved {
            return Err(StorageError::NotApproved);
        }
        let secret = match &entry.sealed {
            Some(sealed) => {
                let plain = open_seal(seal_key, sealed, &storage_context(&entry.id, computer_id))
                    .map_err(|_| StorageError::Settings("the sealed secret does not open on this computer".into()))?;
                serde_json::from_slice::<Value>(&plain).map_err(|_| StorageError::Settings("the secret is not readable".into()))?
            }
            None => Value::Null,
        };
        let s = &entry.settings;
        match entry.kind.as_str() {
            "folder" => Ok(Target::Folder { path: PathBuf::from(required(s, "path")?) }),
            "s3" => Ok(Target::S3 {
                endpoint: required(s, "endpoint")?.trim_end_matches('/').to_string(),
                region: setting(s, "region"),
                bucket: required(s, "bucket")?,
                prefix: setting(s, "prefix").trim_matches('/').to_string(),
                access_key_id: required(&secret, "accessKeyId").map_err(|_| StorageError::NotApproved)?,
                secret_access_key: required(&secret, "secretAccessKey").map_err(|_| StorageError::NotApproved)?,
            }),
            "sftp" => {
                let auth = match (setting(&secret, "privateKey"), secret.get("password").and_then(Value::as_str)) {
                    (key, _) if !key.is_empty() => SftpAuth::Key(key),
                    (_, Some(pw)) if !pw.is_empty() => SftpAuth::Password(pw.to_string()),
                    _ => return Err(StorageError::NotApproved),
                };
                let port = s.get("port").and_then(Value::as_u64).unwrap_or(22);
                Ok(Target::Sftp {
                    host: required(s, "host")?,
                    port: u16::try_from(port).map_err(|_| StorageError::Settings("port".into()))?,
                    username: required(s, "username")?,
                    path: setting(s, "path").trim_end_matches('/').to_string(),
                    host_key: required(s, "hostKey")?,
                    auth,
                })
            }
            other => Err(StorageError::Settings(format!("unknown kind {other}"))),
        }
    }

    /// Copies the local backup file to `name` (from `object_name`) inside this
    /// storage. A half-sent file is never left under the final name.
    pub async fn upload(&self, local: &Path, name: &str) -> Result<u64, StorageError> {
        match self {
            Target::Folder { path } => to_folder(path, local, name).await,
            Target::S3 { .. } => to_s3(self, local, name).await,
            Target::Sftp { .. } => to_sftp(self, local, name).await,
        }
    }

    /// Writes and removes a small file, to show settings work before the first backup.
    pub async fn check(&self, application: &str, computer: &str) -> Result<(), StorageError> {
        let local = std::env::temp_dir().join(format!("pleadli-check-{}", uuid::Uuid::new_v4()));
        tokio::fs::write(&local, b"Pleadli storage check. Safe to delete.\n").await?;
        let name = format!("{}/{}/.pleadli-check", segment(application), segment(computer));
        let result = self.upload(&local, &name).await;
        let _ = tokio::fs::remove_file(&local).await;
        result?;
        match self {
            Target::Folder { path } => {
                let _ = tokio::fs::remove_file(path.join(&name)).await;
            }
            // A probe left on S3 or SFTP is harmless and overwritten next time.
            _ => {}
        }
        Ok(())
    }
}

/// Keeps a path segment to letters, digits, `.`, `_` and `-`, so an address or
/// id can never climb out of the storage's own folder.
fn segment(s: &str) -> String {
    let clean: String = s.chars().map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '-' }).collect();
    if clean.is_empty() || clean.chars().all(|c| c == '.') {
        "-".into()
    } else {
        clean
    }
}

/// `<institution address>/<application>/<computer id>/<UTC time>.pleadli-backup`,
/// relative to the storage's own folder or prefix.
pub fn object_name(institution_address: &str, application: &str, computer: &str, at: chrono::DateTime<chrono::Utc>) -> String {
    format!(
        "{}/{}/{}/{}.{EXTENSION}",
        segment(institution_address),
        segment(application),
        segment(computer),
        at.format("%Y%m%dT%H%M%SZ")
    )
}

async fn to_folder(root: &Path, local: &Path, name: &str) -> Result<u64, StorageError> {
    if !tokio::fs::try_exists(root).await.unwrap_or(false) {
        // A drive not plugged in or a share not reachable: say so, do not create it.
        return Err(StorageError::Network(format!("{} is not there", root.display())));
    }
    let dest = root.join(name);
    if let Some(dir) = dest.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let partial = dest.with_extension("partial");
    let size = tokio::fs::copy(local, &partial).await?;
    tokio::fs::rename(&partial, &dest).await?;
    Ok(size)
}

// ---- S3 (Signature Version 4, path-style, one PUT: up to 5 GB) ----

type HmacSha256 = Hmac<Sha256>;

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC takes any key length");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// S3's URI encoding: everything but `A-Z a-z 0-9 - _ . ~` (and `/` in a path).
fn uri_encode(s: &str, keep_slash: bool) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') || (keep_slash && b == b'/') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// The `Authorization` header for a request signing `host`,
/// `x-amz-content-sha256` and `x-amz-date`, with no query string.
#[allow(clippy::too_many_arguments)]
fn sigv4(method: &str, path: &str, host: &str, payload_hash: &str, amz_date: &str, region: &str, key_id: &str, secret: &str) -> String {
    let date = &amz_date[..8];
    let canonical = format!(
        "{method}\n{path}\n\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n\nhost;x-amz-content-sha256;x-amz-date\n{payload_hash}"
    );
    let scope = format!("{date}/{region}/s3/aws4_request");
    let to_sign = format!("AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}", hex(&Sha256::digest(canonical.as_bytes())));
    let k = hmac(format!("AWS4{secret}").as_bytes(), date);
    let k = hmac(&k, region);
    let k = hmac(&k, "s3");
    let k = hmac(&k, "aws4_request");
    let signature = hex(&hmac(&k, &to_sign));
    format!("AWS4-HMAC-SHA256 Credential={key_id}/{scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={signature}")
}

async fn file_sha256(local: &Path) -> Result<(String, u64), StorageError> {
    let mut file = tokio::fs::File::open(local).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut size = 0u64;
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        size += n as u64;
    }
    Ok((hex(&hasher.finalize()), size))
}

async fn to_s3(target: &Target, local: &Path, name: &str) -> Result<u64, StorageError> {
    let Target::S3 { endpoint, region, bucket, prefix, access_key_id, secret_access_key } = target else { unreachable!() };
    // Without a region, us-east-1: what AWS expects by default, and what R2
    // and MinIO accept in place of their own.
    let region = if region.is_empty() { "us-east-1" } else { region.as_str() };
    let base = reqwest::Url::parse(endpoint).map_err(|_| StorageError::Settings("endpoint".into()))?;
    let host = match (base.host_str(), base.port()) {
        (Some(h), Some(p)) => format!("{h}:{p}"),
        (Some(h), None) => h.to_string(),
        _ => return Err(StorageError::Settings("endpoint".into())),
    };
    let key = if prefix.is_empty() { name.to_string() } else { format!("{prefix}/{name}") };
    let path = format!("{}/{}/{}", base.path().trim_end_matches('/'), uri_encode(bucket, false), uri_encode(&key, true));
    let url = format!("{}://{host}{path}", base.scheme());

    let (payload_hash, size) = file_sha256(local).await?;
    let amz_date = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let auth = sigv4("PUT", &path, &host, &payload_hash, &amz_date, region, access_key_id, secret_access_key);

    let client = reqwest::Client::builder().connect_timeout(CONNECT).read_timeout(Duration::from_secs(300)).build().map_err(|e| StorageError::Network(e.to_string()))?;
    let body = reqwest::Body::from(tokio::fs::File::open(local).await?);
    let res = client
        .put(&url)
        .header("authorization", auth)
        .header("x-amz-content-sha256", &payload_hash)
        .header("x-amz-date", &amz_date)
        .header("content-length", size)
        .header("content-type", "application/octet-stream")
        .body(body)
        .send()
        .await
        .map_err(|e| StorageError::Network(e.to_string()))?;
    let status = res.status().as_u16();
    if res.status().is_success() {
        return Ok(size);
    }
    let text = res.text().await.unwrap_or_default();
    // S3 errors are XML: <Code>...</Code><Message>...</Message>.
    let pick = |tag: &str| text.split(&format!("<{tag}>")).nth(1).and_then(|r| r.split(&format!("</{tag}>")).next()).map(str::to_string);
    let message = match (pick("Code"), pick("Message")) {
        (Some(c), Some(m)) => format!("{c}: {m}"),
        (Some(c), None) => c,
        _ => text.chars().take(200).collect(),
    };
    if matches!(status, 401 | 403) {
        return Err(StorageError::Denied(message));
    }
    Err(StorageError::Refused { status, message })
}

// ---- SFTP (host key pinned to the administrator's SHA256 fingerprint) ----

struct Pinned {
    expected: String,
    seen: Arc<std::sync::Mutex<Option<String>>>,
}

impl russh::client::Handler for Pinned {
    type Error = russh::Error;

    async fn check_server_key(&mut self, server: &russh::keys::PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        use russh::keys::{HashAlg, PublicKeyOrCertificate};
        let fingerprint = match server {
            PublicKeyOrCertificate::PublicKey { key, .. } => key.fingerprint(HashAlg::Sha256).to_string(),
            PublicKeyOrCertificate::Certificate(cert) => cert.public_key().fingerprint(HashAlg::Sha256).to_string(),
        };
        let ok = same_fingerprint(&fingerprint, &self.expected);
        *self.seen.lock().unwrap() = Some(fingerprint);
        Ok(ok)
    }
}

/// `SHA256:abc...` as `ssh-keygen -lf` prints it; the `SHA256:` and trailing
/// `=` are optional when typed.
fn same_fingerprint(seen: &str, typed: &str) -> bool {
    let norm = |s: &str| s.trim().trim_start_matches("SHA256:").trim_end_matches('=').to_string();
    !norm(typed).is_empty() && norm(seen) == norm(typed)
}

fn ssh(e: russh::Error) -> StorageError {
    StorageError::Network(e.to_string())
}

fn sftp_err(e: russh_sftp::client::error::Error) -> StorageError {
    match e {
        russh_sftp::client::error::Error::Status(s) => StorageError::Refused { status: s.status_code as u16, message: s.error_message },
        other => StorageError::Network(other.to_string()),
    }
}

async fn to_sftp(target: &Target, local: &Path, name: &str) -> Result<u64, StorageError> {
    let Target::Sftp { host, port, username, path, host_key, auth } = target else { unreachable!() };
    let seen = Arc::new(std::sync::Mutex::new(None));
    let handler = Pinned { expected: host_key.clone(), seen: seen.clone() };
    let config = Arc::new(russh::client::Config { inactivity_timeout: Some(Duration::from_secs(120)), ..Default::default() });
    let connected = tokio::time::timeout(CONNECT, russh::client::connect(config, (host.as_str(), *port), handler))
        .await
        .map_err(|_| StorageError::Network(format!("{host}:{port} did not answer")))?;
    let mut session = match connected {
        Ok(s) => s,
        Err(e) => {
            if let Some(seen) = seen.lock().unwrap().clone() {
                if !same_fingerprint(&seen, host_key) {
                    return Err(StorageError::HostKey { expected: host_key.clone(), seen });
                }
            }
            return Err(ssh(e));
        }
    };

    let signed_in = match auth {
        SftpAuth::Password(pw) => session.authenticate_password(username, pw).await.map_err(ssh)?,
        SftpAuth::Key(pem) => {
            let key = russh::keys::decode_secret_key(pem, None).map_err(|e| StorageError::Settings(format!("private key: {e}")))?;
            let hash = session.best_supported_rsa_hash().await.map_err(ssh)?.flatten();
            session
                .authenticate_publickey(username, russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                .await
                .map_err(ssh)?
        }
    };
    if !signed_in.success() {
        return Err(StorageError::Denied(format!("{username}@{host}")));
    }

    let channel = session.channel_open_session().await.map_err(ssh)?;
    channel.request_subsystem(true, "sftp").await.map_err(ssh)?;
    let sftp = russh_sftp::client::SftpSession::new(channel.into_stream()).await.map_err(sftp_err)?;

    let full = if path.is_empty() { name.to_string() } else { format!("{path}/{name}") };
    let (dir, _) = full.rsplit_once('/').unwrap_or(("", &full));
    let mut walked = String::new();
    for (i, part) in dir.split('/').enumerate() {
        if part.is_empty() {
            if i == 0 {
                walked.push('/');
            }
            continue;
        }
        if !walked.is_empty() && !walked.ends_with('/') {
            walked.push('/');
        }
        walked.push_str(part);
        if !sftp.try_exists(walked.clone()).await.map_err(sftp_err)? {
            sftp.create_dir(walked.clone()).await.map_err(sftp_err)?;
        }
    }

    let partial = format!("{full}.partial");
    let mut source = tokio::fs::File::open(local).await?;
    let mut remote = sftp.create(partial.clone()).await.map_err(sftp_err)?;
    let size = tokio::io::copy(&mut source, &mut remote).await.map_err(|e| StorageError::Network(e.to_string()))?;
    remote.shutdown().await.map_err(|e| StorageError::Network(e.to_string()))?;
    // A check file is rewritten each time; a backup name is new each time.
    if sftp.try_exists(full.clone()).await.map_err(sftp_err)? {
        sftp.remove_file(full.clone()).await.map_err(sftp_err)?;
    }
    sftp.rename(partial, full).await.map_err(sftp_err)?;
    let _ = sftp.close().await;
    let _ = session.disconnect(russh::Disconnect::ByApplication, "", "en").await;
    Ok(size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_stay_inside_the_storage() {
        let at = chrono::DateTime::parse_from_rfc3339("2026-10-08T14:22:33Z").unwrap().with_timezone(&chrono::Utc);
        assert_eq!(object_name("ug.police.albertine.kagadi", "police", "pc-1", at), "ug.police.albertine.kagadi/police/pc-1/20261008T142233Z.pleadli-backup");
        assert_eq!(object_name("../..", "a/b", "", at), "..-../a-b/-/20261008T142233Z.pleadli-backup");
        assert_eq!(segment(".."), "-");
    }

    #[test]
    fn fingerprints_compare_loosely() {
        let seen = "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8";
        assert!(same_fingerprint(seen, " nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8= "));
        assert!(!same_fingerprint(seen, "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY9"));
        assert!(!same_fingerprint(seen, ""));
    }

    /// Checked against AWS's own signer (@smithy/signature-v4) for the same
    /// request: a path-style PUT with a space in the key and a port.
    #[test]
    fn signs_like_aws() {
        let empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let path = format!("/records/{}", uri_encode("pleadli/ug.x/police/pc 1/2026.pleadli-backup", true));
        let auth = sigv4("PUT", &path, "minio.example.org:9000", empty, "20261008T142233Z", "auto", "AKID", "SECRET/KEY");
        assert_eq!(
            auth,
            "AWS4-HMAC-SHA256 Credential=AKID/20261008/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=f4196dff549c37078e0b8178fa8e072baea9425b75deef466545ca3bef36dfef"
        );
    }

    #[test]
    fn opens_only_what_was_sealed_for_it() {
        let me = crate::backup::new_seal_key();
        let mine = x25519_dalek::PublicKey::from(&me);
        let secret = br#"{"accessKeyId":"AK","secretAccessKey":"SK"}"#;
        let entry = |sealed: Option<String>, approved: bool| StorageEntry {
            id: "st1".into(),
            label: "Office".into(),
            kind: "s3".into(),
            settings: serde_json::json!({"endpoint": "https://s3.example.org/", "region": "", "bucket": "records", "prefix": "/pleadli/"}),
            approved,
            sealed,
        };
        let ok = Target::open(&entry(Some(crate::backup::seal(&mine, secret, &storage_context("st1", "pc1"))), true), &me, "pc1").unwrap();
        let Target::S3 { endpoint, prefix, secret_access_key, .. } = ok else { panic!() };
        assert_eq!((endpoint.as_str(), prefix.as_str(), secret_access_key.as_str()), ("https://s3.example.org", "pleadli", "SK"));
        // Sealed for another computer: refused.
        let other = crate::backup::seal(&mine, secret, &storage_context("st1", "pc2"));
        assert!(Target::open(&entry(Some(other), true), &me, "pc1").is_err());
        assert!(matches!(Target::open(&entry(None, false), &me, "pc1"), Err(StorageError::NotApproved)));
    }

    #[tokio::test]
    async fn a_folder_gets_the_whole_file() {
        let root = std::env::temp_dir().join(format!("pleadli-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let local = root.join("local.bin");
        std::fs::write(&local, vec![9u8; 100_000]).unwrap();
        let target = Target::Folder { path: root.join("drive") };
        assert!(matches!(target.upload(&local, "a/b.pleadli-backup").await, Err(StorageError::Network(_))));
        std::fs::create_dir_all(root.join("drive")).unwrap();
        assert_eq!(target.upload(&local, "a/b.pleadli-backup").await.unwrap(), 100_000);
        assert_eq!(std::fs::read(root.join("drive/a/b.pleadli-backup")).unwrap().len(), 100_000);
        assert!(!root.join("drive/a/b.partial").exists());
        target.check("police", "pc1").await.unwrap();
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// A real SFTP server, run by hand: PLEADLI_SFTP_TEST="host port user keyfile SHA256:..."
    /// then `cargo test --features storage -- --ignored sftp`.
    #[tokio::test]
    #[ignore]
    async fn sftp_to_a_real_server() {
        let spec = std::env::var("PLEADLI_SFTP_TEST").expect("PLEADLI_SFTP_TEST");
        let p: Vec<&str> = spec.split_whitespace().collect();
        let target = |host_key: &str| Target::Sftp {
            host: p[0].into(),
            port: p[1].parse().unwrap(),
            username: p[2].into(),
            path: std::env::temp_dir().join("pleadli-sftp-test").display().to_string(),
            host_key: host_key.into(),
            auth: SftpAuth::Key(std::fs::read_to_string(p[3]).unwrap()),
        };
        let local = std::env::temp_dir().join("pleadli-sftp-local.bin");
        std::fs::write(&local, (0..300_000u32).map(|i| (i % 251) as u8).collect::<Vec<_>>()).unwrap();
        let wrong = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        assert!(matches!(target(wrong).upload(&local, "x/y.pleadli-backup").await, Err(StorageError::HostKey { .. })));
        assert_eq!(target(p[4]).upload(&local, "ug.x/police/pc1/a.pleadli-backup").await.unwrap(), 300_000);
        let landed = std::env::temp_dir().join("pleadli-sftp-test/ug.x/police/pc1/a.pleadli-backup");
        assert_eq!(std::fs::read(landed).unwrap(), std::fs::read(&local).unwrap());
        target(p[4]).check("police", "pc1").await.unwrap();
    }
}
