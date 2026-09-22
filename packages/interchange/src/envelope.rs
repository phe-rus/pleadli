//! The package: one file that any carrier can move.
//!
//! ```text
//! "PLXPKG01" | header length (u32) | header (JSON) | signature (64 bytes) | body
//! ```
//!
//! The **header** says who sent it, who it is for, what kind of message it is
//! and its unique id, and carries the hash of the body. The **signature** covers
//! the magic and the header, so it covers the body through its hash: nothing in
//! the file can be changed without the signature failing. The **body** is
//! sealed to the addressee (an ephemeral X25519 key against the addressee's
//! static key, then ChaCha20-Poly1305), so only the addressee can read it. A
//! few messages (an invitation to pair) carry only public information and are
//! signed but not sealed.
//!
//! Receiving is two steps, because the receiver must know *who claims to have
//! sent it* before it can know which key to trust: `peek` reads the header
//! without believing it, the receiver looks up the key it has pinned for that
//! sender, and `open` then verifies and decrypts with that key. A package from
//! anyone the receiver has not pinned, or addressed to someone else, is refused.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use ed25519_dalek::{Signature, Signer, Verifier};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::identity::{ephemeral, hex, shared_secret, unhex32, Identity, IdentityKind, PublicIdentity};

const MAGIC: &[u8; 8] = b"PLXPKG01";
const MAX_HEADER: usize = 16 * 1024;
const MAX_BODY: usize = 512 * 1024 * 1024;
const MAX_JSON: usize = 32 * 1024 * 1024;
const MAX_FILES: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Party {
    pub id: String,
    pub name: String,
    pub kind: IdentityKind,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Header {
    pub v: u8,
    /// `referral`, `receipt`, `decision_notice`, `pairing_invite`, ...
    pub kind: String,
    /// The package's own id. A receiver refuses one it has already seen.
    pub id: String,
    pub from: Party,
    /// The addressee's id. `None` only for the public pairing messages.
    pub to: Option<String>,
    pub created_at: i64,
    /// Counts the packages this sender has addressed to this receiver, so a
    /// receiver can see that one is missing. It never makes a package invalid.
    pub seq: u64,
    pub in_reply_to: Option<String>,
    pub sealed: bool,
    pub epk: Option<String>,
    pub nonce: Option<String>,
    pub body_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyFile {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub sha256: String,
    #[serde(skip)]
    pub bytes: Vec<u8>,
}

/// What a package carries: the message as JSON, and any files that go with it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Body {
    pub json: serde_json::Value,
    pub files: Vec<BodyFile>,
}

impl Body {
    pub fn new(json: serde_json::Value) -> Body {
        Body { json, files: Vec::new() }
    }

    pub fn with_file(mut self, id: &str, name: &str, mime: &str, bytes: Vec<u8>) -> Body {
        self.files.push(BodyFile { id: id.to_string(), name: name.to_string(), mime: mime.to_string(), sha256: sha256_hex(&bytes), bytes });
        self
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum PackageError {
    /// Not a package, or cut short.
    BadFormat,
    /// Addressed to someone else, or not sealed for anyone.
    NotForThisRecipient,
    /// The signature does not match the sender the receiver has pinned.
    BadSignature,
    /// The body does not match its hash, or will not decrypt.
    Tampered,
    TooLarge,
    Unsupported(u8),
}

impl std::fmt::Display for PackageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PackageError::BadFormat => write!(f, "This is not a package, or it is incomplete."),
            PackageError::NotForThisRecipient => write!(f, "This package is addressed to someone else."),
            PackageError::BadSignature => write!(f, "The signature does not match the sender this office trusts."),
            PackageError::Tampered => write!(f, "The package has been altered, or is damaged."),
            PackageError::TooLarge => write!(f, "The package is too large."),
            PackageError::Unsupported(v) => write!(f, "This package is from a newer version (v{v})."),
        }
    }
}

impl std::error::Error for PackageError {}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

// ---- the body's own encoding ----------------------------------------

fn encode_body(body: &Body) -> Result<Vec<u8>, PackageError> {
    let json = serde_json::to_vec(&body.json).map_err(|_| PackageError::BadFormat)?;
    let mut out = Vec::with_capacity(json.len() + body.files.iter().map(|f| f.bytes.len() + 256).sum::<usize>() + 16);
    out.extend_from_slice(&(json.len() as u32).to_be_bytes());
    out.extend_from_slice(&json);
    out.extend_from_slice(&(body.files.len() as u32).to_be_bytes());
    for file in &body.files {
        let meta = serde_json::to_vec(file).map_err(|_| PackageError::BadFormat)?;
        out.extend_from_slice(&(meta.len() as u32).to_be_bytes());
        out.extend_from_slice(&meta);
        out.extend_from_slice(&(file.bytes.len() as u64).to_be_bytes());
        out.extend_from_slice(&file.bytes);
    }
    if out.len() > MAX_BODY {
        return Err(PackageError::TooLarge);
    }
    Ok(out)
}

struct Cursor<'a>(&'a [u8]);

impl<'a> Cursor<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], PackageError> {
        if self.0.len() < n {
            return Err(PackageError::BadFormat);
        }
        let (head, rest) = self.0.split_at(n);
        self.0 = rest;
        Ok(head)
    }
    fn u32(&mut self) -> Result<usize, PackageError> {
        Ok(u32::from_be_bytes(self.take(4)?.try_into().unwrap()) as usize)
    }
    fn u64(&mut self) -> Result<usize, PackageError> {
        usize::try_from(u64::from_be_bytes(self.take(8)?.try_into().unwrap())).map_err(|_| PackageError::TooLarge)
    }
}

fn decode_body(plain: &[u8]) -> Result<Body, PackageError> {
    let mut c = Cursor(plain);
    let json_len = c.u32()?;
    if json_len > MAX_JSON {
        return Err(PackageError::TooLarge);
    }
    let json = serde_json::from_slice(c.take(json_len)?).map_err(|_| PackageError::BadFormat)?;
    let count = c.u32()?;
    if count > MAX_FILES {
        return Err(PackageError::TooLarge);
    }
    let mut files = Vec::with_capacity(count);
    for _ in 0..count {
        let meta_len = c.u32()?;
        if meta_len > 4096 {
            return Err(PackageError::BadFormat);
        }
        let mut file: BodyFile = serde_json::from_slice(c.take(meta_len)?).map_err(|_| PackageError::BadFormat)?;
        let len = c.u64()?;
        file.bytes = c.take(len)?.to_vec();
        // A file must be the file its description says it is.
        if sha256_hex(&file.bytes) != file.sha256 {
            return Err(PackageError::Tampered);
        }
        files.push(file);
    }
    Ok(Body { json, files })
}

// ---- sealing ---------------------------------------------------------

fn seal_key(shared: &[u8; 32], epk: &[u8; 32], recipient_enc: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"pleadli/interchange/seal/v1");
    hasher.update(shared);
    hasher.update(epk);
    hasher.update(recipient_enc);
    hasher.finalize().into()
}

fn aad(id: &str, kind: &str, from: &str, to: &str) -> Vec<u8> {
    format!("{id}|{kind}|{from}|{to}").into_bytes()
}

fn assemble(sender: &Identity, header: &Header, body: &[u8]) -> Result<Vec<u8>, PackageError> {
    let header_bytes = serde_json::to_vec(header).map_err(|_| PackageError::BadFormat)?;
    let signature = sender.signing().sign(&[MAGIC.as_slice(), &header_bytes].concat());
    let mut out = Vec::with_capacity(MAGIC.len() + 4 + header_bytes.len() + 64 + body.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&(header_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(&header_bytes);
    out.extend_from_slice(&signature.to_bytes());
    out.extend_from_slice(body);
    Ok(out)
}

fn party(identity: &Identity) -> Party {
    Party { id: identity.public.id.clone(), name: identity.public.name.clone(), kind: identity.public.kind, fingerprint: identity.public.fingerprint() }
}

/// Signs and seals a package for `recipient`. Returns the file and its header.
pub fn seal(sender: &Identity, recipient: &PublicIdentity, kind: &str, seq: u64, in_reply_to: Option<&str>, body: &Body) -> Result<(Vec<u8>, Header), PackageError> {
    let recipient_enc = recipient.encryption_bytes().ok_or(PackageError::BadFormat)?;
    let (esk, epk) = ephemeral();
    let key = seal_key(&shared_secret(&esk, &recipient_enc), &epk, &recipient_enc);
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let id = uuid::Uuid::new_v4().to_string();
    let ciphertext = ChaCha20Poly1305::new((&key).into())
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: &encode_body(body)?, aad: &aad(&id, kind, &sender.public.id, &recipient.id) })
        .map_err(|_| PackageError::Tampered)?;
    let header = Header {
        v: 1,
        kind: kind.to_string(),
        id,
        from: party(sender),
        to: Some(recipient.id.clone()),
        created_at: now_ms(),
        seq,
        in_reply_to: in_reply_to.map(str::to_string),
        sealed: true,
        epk: Some(hex(&epk)),
        nonce: Some(hex(&nonce)),
        body_sha256: sha256_hex(&ciphertext),
    };
    Ok((assemble(sender, &header, &ciphertext)?, header))
}

/// Signs a package that carries only public information (an invitation to
/// pair). Anyone can read it; only the signature ties it to its sender.
pub fn sign_public(sender: &Identity, kind: &str, in_reply_to: Option<&str>, body: &Body) -> Result<(Vec<u8>, Header), PackageError> {
    let plain = encode_body(body)?;
    let header = Header {
        v: 1,
        kind: kind.to_string(),
        id: uuid::Uuid::new_v4().to_string(),
        from: party(sender),
        to: None,
        created_at: now_ms(),
        seq: 0,
        in_reply_to: in_reply_to.map(str::to_string),
        sealed: false,
        epk: None,
        nonce: None,
        body_sha256: sha256_hex(&plain),
    };
    Ok((assemble(sender, &header, &plain)?, header))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

// ---- receiving -------------------------------------------------------

/// A header read from a file, not yet believed.
pub struct Peeked {
    pub header: Header,
    header_bytes: Vec<u8>,
    signature: [u8; 64],
    body: Vec<u8>,
}

/// Reads the header of a package without trusting it, to find out who claims to
/// have sent it. Nothing in the result is authentic until `open`.
pub fn peek(bytes: &[u8]) -> Result<Peeked, PackageError> {
    let mut c = Cursor(bytes);
    if c.take(MAGIC.len())? != MAGIC {
        return Err(PackageError::BadFormat);
    }
    let header_len = c.u32()?;
    if header_len > MAX_HEADER {
        return Err(PackageError::BadFormat);
    }
    let header_bytes = c.take(header_len)?.to_vec();
    let header: Header = serde_json::from_slice(&header_bytes).map_err(|_| PackageError::BadFormat)?;
    if header.v != 1 {
        return Err(PackageError::Unsupported(header.v));
    }
    let signature: [u8; 64] = c.take(64)?.try_into().unwrap();
    Ok(Peeked { header, header_bytes, signature, body: c.0.to_vec() })
}

#[derive(Debug)]
pub struct Opened {
    pub header: Header,
    pub body: Body,
}

impl Peeked {
    fn verify(&self, sender: &PublicIdentity) -> Result<(), PackageError> {
        if self.header.from.id != sender.id {
            return Err(PackageError::BadSignature);
        }
        let key = sender.verifying().ok_or(PackageError::BadSignature)?;
        key.verify(&[MAGIC.as_slice(), &self.header_bytes].concat(), &Signature::from_bytes(&self.signature)).map_err(|_| PackageError::BadSignature)?;
        if sha256_hex(&self.body) != self.header.body_sha256 {
            return Err(PackageError::Tampered);
        }
        Ok(())
    }
}

/// Verifies against the key the receiver has pinned for the sender, and opens.
pub fn open(recipient: &Identity, peeked: Peeked, sender: &PublicIdentity) -> Result<Opened, PackageError> {
    peeked.verify(sender)?;
    let header = &peeked.header;
    if !header.sealed || header.to.as_deref() != Some(recipient.public.id.as_str()) {
        return Err(PackageError::NotForThisRecipient);
    }
    let epk = header.epk.as_deref().and_then(unhex32).ok_or(PackageError::BadFormat)?;
    let nonce = header.nonce.as_deref().and_then(|n| (n.len() == 24).then_some(n)).ok_or(PackageError::BadFormat)?;
    let nonce: Vec<u8> = (0..12).map(|i| u8::from_str_radix(&nonce[i * 2..i * 2 + 2], 16)).collect::<Result<_, _>>().map_err(|_| PackageError::BadFormat)?;
    let key = seal_key(&recipient.shared_with(&epk), &epk, &unhex32(&recipient.public.encryption_key).ok_or(PackageError::BadFormat)?);
    let plain = ChaCha20Poly1305::new((&key).into())
        .decrypt(Nonce::from_slice(&nonce), Payload { msg: &peeked.body, aad: &aad(&header.id, &header.kind, &header.from.id, &recipient.public.id) })
        .map_err(|_| PackageError::Tampered)?;
    Ok(Opened { header: peeked.header, body: decode_body(&plain)? })
}

/// For the public pairing messages: the sender's own identity is inside, so the
/// signature is checked against that. This proves the message is whole and is
/// from whoever holds that key. It does **not** prove who that is: that is
/// what comparing the fingerprint aloud is for.
pub fn open_public(peeked: Peeked, claimed: &PublicIdentity) -> Result<Opened, PackageError> {
    peeked.verify(claimed)?;
    if peeked.header.sealed {
        return Err(PackageError::BadFormat);
    }
    let body = decode_body(&peeked.body)?;
    Ok(Opened { header: peeked.header, body })
}

impl Peeked {
    /// The unauthenticated body of a public message, so the identity that must
    /// verify it can be read out of it. Not to be believed before `open_public`.
    pub fn public_body(&self) -> Result<Body, PackageError> {
        if self.header.sealed {
            return Err(PackageError::BadFormat);
        }
        decode_body(&self.body)
    }
}

/// Kept so callers can name the public case: see `open_public`.
pub use open_public as sign_open;

#[cfg(test)]
mod tests {
    use super::*;

    fn pair() -> (Identity, Identity) {
        (Identity::generate(IdentityKind::PoliceStation, "Wandegeya Police Station", Some("Wandegeya")), Identity::generate(IdentityKind::DppOffice, "Wandegeya DPP Office", Some("Kampala")))
    }

    fn body() -> Body {
        Body::new(serde_json::json!({ "hello": "world" })).with_file("f1", "statement.pdf", "application/pdf", b"%PDF statement bytes".to_vec())
    }

    #[test]
    fn a_sealed_package_opens_only_for_its_addressee_and_only_from_the_pinned_sender() {
        let (police, dpp) = pair();
        let (bytes, header) = seal(&police, &dpp.public, "referral", 1, None, &body()).unwrap();
        assert!(!bytes.windows(5).any(|w| w == b"world"), "the body is not readable in the file");

        let opened = open(&dpp, peek(&bytes).unwrap(), &police.public).unwrap();
        assert_eq!(opened.header.id, header.id);
        assert_eq!(opened.body.json["hello"], "world");
        assert_eq!(opened.body.files[0].bytes, b"%PDF statement bytes");

        // Another office cannot open it, even if it trusts the sender.
        let other_dpp = Identity::generate(IdentityKind::DppOffice, "Nakawa DPP Office", None);
        assert_eq!(open(&other_dpp, peek(&bytes).unwrap(), &police.public).unwrap_err(), PackageError::NotForThisRecipient);

        // A different station's key is not the sender's key.
        let other_police = Identity::generate(IdentityKind::PoliceStation, "Kira Road Police Station", None);
        assert_eq!(open(&dpp, peek(&bytes).unwrap(), &other_police.public).unwrap_err(), PackageError::BadSignature);

        // A sender claiming another sender's id, signing with its own key.
        let mut impostor = Identity::generate(IdentityKind::PoliceStation, "Impostor", None);
        impostor.public.id = police.public.id.clone();
        let (forged, _) = seal(&impostor, &dpp.public, "referral", 1, None, &body()).unwrap();
        assert_eq!(open(&dpp, peek(&forged).unwrap(), &police.public).unwrap_err(), PackageError::BadSignature);
    }

    #[test]
    fn any_change_to_the_file_is_detected() {
        let (police, dpp) = pair();
        let (bytes, _) = seal(&police, &dpp.public, "referral", 1, None, &body()).unwrap();
        for at in [12, bytes.len() / 2, bytes.len() - 1] {
            let mut altered = bytes.clone();
            altered[at] ^= 1;
            let result = peek(&altered).and_then(|p| open(&dpp, p, &police.public));
            assert!(result.is_err(), "a change at byte {at} was accepted");
        }
        assert!(peek(&bytes[..bytes.len() - 5]).and_then(|p| open(&dpp, p, &police.public)).is_err());
        assert!(peek(b"not a package").is_err());
    }

    #[test]
    fn a_public_message_is_signed_but_readable_and_ties_to_its_own_key() {
        let (_, dpp) = pair();
        let (bytes, _) = sign_public(&dpp, "pairing_invite", None, &Body::new(serde_json::json!({ "office": "x" }))).unwrap();
        let peeked = peek(&bytes).unwrap();
        assert_eq!(peeked.public_body().unwrap().json["office"], "x");
        assert!(open_public(peek(&bytes).unwrap(), &dpp.public).is_ok());
        let stranger = Identity::generate(IdentityKind::DppOffice, "Stranger", None);
        assert_eq!(open_public(peek(&bytes).unwrap(), &stranger.public).unwrap_err(), PackageError::BadSignature);
    }

    #[test]
    fn the_fingerprint_changes_with_the_keys_and_the_name() {
        let (police, _) = pair();
        let same = police.public.clone();
        assert_eq!(same.fingerprint(), police.public.fingerprint());
        let mut renamed = police.public.clone();
        renamed.name = "Wandegeya Police Post".into();
        assert_ne!(renamed.fingerprint(), police.public.fingerprint());
        assert_eq!(police.public.fingerprint().len(), 24);
        let restored = Identity::restore(police.public.clone(), police.signing_secret(), police.encryption_secret()).unwrap();
        assert_eq!(restored.public, police.public);
        assert!(Identity::restore(police.public.clone(), [1u8; 32], police.encryption_secret()).is_none());
    }
}
