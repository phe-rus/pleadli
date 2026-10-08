//! Orchestra backups, the apps' half (docs/platform/ORCHESTRA-BACKUP.md).
//!
//! A computer holds only the institution's backup *public* key: it can lock a
//! backup but never open one, so a stolen laptop reads nothing of the others.
//! Opening needs the recovery phrase, typed at restore time. Storage secrets
//! arrive sealed to this computer's own seal key by an administrator's
//! browser (www/src/lib/seal.ts); both sides agree on tests/seal-vectors.json.

use std::io::{self, Read, Write};

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit as _};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::ChaCha20Poly1305;
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SEAL_V1: u8 = 1;
const MAGIC: &[u8; 7] = b"PLDBK1\n";
const NONCE_LEN: usize = 7;
const CHUNK: usize = 64 * 1024;
const TAG: usize = 16;
/// The context a backup's data key is sealed under.
pub const BACKUP_CONTEXT: &str = "pleadli/backup/v1";

#[derive(Debug)]
pub enum BackupError {
    Io(io::Error),
    /// The phrase was mistyped (its checksum does not match).
    Phrase,
    /// Wrong key, wrong context, or damaged: these are not told apart.
    Unreadable,
    /// The file is a backup, but this key does not open it.
    WrongKey,
}

impl From<io::Error> for BackupError {
    fn from(e: io::Error) -> Self {
        BackupError::Io(e)
    }
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackupError::Io(e) => write!(f, "{e}"),
            BackupError::Phrase => write!(f, "the recovery phrase is not right; check each group"),
            BackupError::Unreadable => write!(f, "the backup could not be opened with this key"),
            BackupError::WrongKey => write!(f, "this backup was locked with another recovery phrase"),
        }
    }
}

fn unbase32(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let (mut bits, mut value) = (0u32, 0u32);
    for c in s.bytes() {
        let v = ALPHABET.iter().position(|&a| a == c)? as u32;
        value = (value << 5) | v;
        bits += 5;
        if bits >= 8 {
            out.push((value >> (bits - 8)) as u8);
            bits -= 8;
        }
    }
    Some(out)
}

/// The 16 bytes behind a typed recovery phrase. Case, spaces and dashes are
/// ignored; O reads as 0, I and L as 1.
pub fn read_recovery_phrase(typed: &str) -> Result<[u8; 16], BackupError> {
    let clean: String = typed
        .to_ascii_uppercase()
        .chars()
        .map(|c| match c {
            'O' => '0',
            'I' | 'L' => '1',
            c => c,
        })
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if clean.len() != 32 {
        return Err(BackupError::Phrase);
    }
    let all = unbase32(&clean).ok_or(BackupError::Phrase)?;
    let entropy: [u8; 16] = all[..16].try_into().map_err(|_| BackupError::Phrase)?;
    if Sha256::digest(entropy)[..4] != all[16..20] {
        return Err(BackupError::Phrase);
    }
    Ok(entropy)
}

/// The institution's backup key, from the phrase's 16 bytes.
pub fn institution_key(entropy: &[u8; 16]) -> StaticSecret {
    let mut secret = [0u8; 32];
    Hkdf::<Sha256>::new(Some(b"pleadli/backup-key/v1"), entropy)
        .expand(b"", &mut secret)
        .expect("32 bytes is a valid HKDF length");
    StaticSecret::from(secret)
}

/// How a key is shown to people: the first 8 bytes of its SHA-256, in groups of 4.
pub fn fingerprint(public: &[u8; 32]) -> String {
    let hex: String = Sha256::digest(public)[..8].iter().map(|b| format!("{b:02x}")).collect();
    hex.as_bytes().chunks(4).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join(" ")
}

pub fn encode_key(public: &PublicKey) -> String {
    URL_SAFE_NO_PAD.encode(public.as_bytes())
}

pub fn decode_key(text: &str) -> Result<PublicKey, BackupError> {
    let bytes: [u8; 32] = URL_SAFE_NO_PAD.decode(text).ok().and_then(|b| b.try_into().ok()).ok_or(BackupError::Unreadable)?;
    Ok(PublicKey::from(bytes))
}

/// A new seal key for this computer. The app keeps the secret in its keystore
/// and sends the public half with `activate` and `heartbeat`.
pub fn new_seal_key() -> StaticSecret {
    StaticSecret::random_from_rng(OsRng)
}

fn seal_cipher(shared: &[u8; 32], ephemeral: &[u8; 32], recipient: &[u8; 32]) -> Aes256Gcm {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(ephemeral);
    salt[32..].copy_from_slice(recipient);
    let mut key = [0u8; 32];
    Hkdf::<Sha256>::new(Some(&salt), shared).expand(b"pleadli/seal/v1", &mut key).expect("32 bytes is a valid HKDF length");
    Aes256Gcm::new(&key.into())
}

fn seal_with(recipient: &PublicKey, plain: &[u8], context: &str, ephemeral: StaticSecret, nonce: [u8; 12]) -> String {
    let e = PublicKey::from(&ephemeral);
    let shared = ephemeral.diffie_hellman(recipient);
    let cipher = seal_cipher(shared.as_bytes(), e.as_bytes(), recipient.as_bytes());
    let sealed = cipher.encrypt(&nonce.into(), Payload { msg: plain, aad: context.as_bytes() }).expect("AES-GCM sealing does not fail");
    let mut out = Vec::with_capacity(45 + sealed.len());
    out.push(SEAL_V1);
    out.extend_from_slice(e.as_bytes());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    URL_SAFE_NO_PAD.encode(out)
}

/// Seal v1: only `recipient`'s secret opens it, and only under `context`.
pub fn seal(recipient: &PublicKey, plain: &[u8], context: &str) -> String {
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    seal_with(recipient, plain, context, StaticSecret::random_from_rng(OsRng), nonce)
}

pub fn open_seal(secret: &StaticSecret, sealed: &str, context: &str) -> Result<Vec<u8>, BackupError> {
    let bytes = URL_SAFE_NO_PAD.decode(sealed).map_err(|_| BackupError::Unreadable)?;
    if bytes.len() < 45 + 16 || bytes[0] != SEAL_V1 {
        return Err(BackupError::Unreadable);
    }
    let e: [u8; 32] = bytes[1..33].try_into().map_err(|_| BackupError::Unreadable)?;
    let nonce: [u8; 12] = bytes[33..45].try_into().map_err(|_| BackupError::Unreadable)?;
    let recipient = PublicKey::from(secret);
    let shared = secret.diffie_hellman(&PublicKey::from(e));
    seal_cipher(shared.as_bytes(), &e, recipient.as_bytes())
        .decrypt(&nonce.into(), Payload { msg: &bytes[45..], aad: context.as_bytes() })
        .map_err(|_| BackupError::Unreadable)
}

/// The context a storage secret is sealed under for one computer.
pub fn storage_context(storage_id: &str, computer_id: &str) -> String {
    format!("pleadli/storage/{storage_id}/{computer_id}")
}

/// What a backup file says about itself, readable without the phrase.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Header {
    pub v: u32,
    pub application: String,
    pub computer: String,
    pub created_at: i64,
    pub key_fingerprint: String,
    /// The data key, sealed to the institution key under `BACKUP_CONTEXT`.
    pub key: String,
}

/// Fills `buf` as far as the reader allows; fewer bytes only at the end.
fn read_full(reader: &mut impl Read, buf: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..])? {
            0 => break,
            n => filled += n,
        }
    }
    Ok(filled)
}

/// Writes a backup file as its contents arrive, locked to the institution key.
/// Each 64 KiB is sealed once more has arrived, so the last chunk is known;
/// `finish` seals the last one. Dropped without `finish`, the file is
/// incomplete and refused when read.
pub struct BackupWriter<W: Write> {
    out: W,
    enc: Option<EncryptorBE32<ChaCha20Poly1305>>,
    aad: Vec<u8>,
    pending: Vec<u8>,
    written: u64,
}

impl<W: Write> BackupWriter<W> {
    pub fn new(institution: &PublicKey, application: &str, computer: &str, mut out: W) -> Result<Self, BackupError> {
        let mut data_key = [0u8; 32];
        OsRng.fill_bytes(&mut data_key);
        let header = Header {
            v: 1,
            application: application.to_string(),
            computer: computer.to_string(),
            created_at: chrono::Utc::now().timestamp_millis(),
            key_fingerprint: fingerprint(institution.as_bytes()),
            key: seal(institution, &data_key, BACKUP_CONTEXT),
        };
        let json = serde_json::to_vec(&header).map_err(|e| BackupError::Io(io::Error::other(e)))?;
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        out.write_all(MAGIC)?;
        out.write_all(&(json.len() as u32).to_be_bytes())?;
        out.write_all(&json)?;
        out.write_all(&nonce)?;
        let written = (MAGIC.len() + 4 + json.len() + NONCE_LEN) as u64;
        // The header is bound into every chunk, so it cannot be swapped.
        Ok(BackupWriter { out, enc: Some(EncryptorBE32::from_aead(ChaCha20Poly1305::new(&data_key.into()), &nonce.into())), aad: json, pending: Vec::with_capacity(CHUNK * 2), written })
    }

    fn seal_full(&mut self) -> io::Result<()> {
        while self.pending.len() > CHUNK {
            let chunk: Vec<u8> = self.pending.drain(..CHUNK).collect();
            let enc = self.enc.as_mut().ok_or_else(|| io::Error::other("backup already finished"))?;
            let sealed = enc.encrypt_next(chacha20poly1305::aead::Payload { msg: &chunk, aad: &self.aad }).map_err(|_| io::Error::other("sealing failed"))?;
            self.out.write_all(&sealed)?;
            self.written += sealed.len() as u64;
        }
        Ok(())
    }

    /// Seals the last chunk. Returns the output and the bytes written in all.
    pub fn finish(mut self) -> Result<(W, u64), BackupError> {
        let enc = self.enc.take().ok_or(BackupError::Unreadable)?;
        let sealed = enc.encrypt_last(chacha20poly1305::aead::Payload { msg: &self.pending, aad: &self.aad }).map_err(|_| BackupError::Unreadable)?;
        self.out.write_all(&sealed)?;
        self.out.flush()?;
        Ok((self.out, self.written + sealed.len() as u64))
    }
}

impl<W: Write> Write for BackupWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(buf);
        self.seal_full()?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Encrypts everything `plain` yields into a backup file on `out`, locked to
/// the institution key. Returns the number of bytes written.
pub fn write_backup(institution: &PublicKey, application: &str, computer: &str, plain: &mut impl Read, out: &mut impl Write) -> Result<u64, BackupError> {
    let mut writer = BackupWriter::new(institution, application, computer, out)?;
    io::copy(plain, &mut writer)?;
    Ok(writer.finish()?.1)
}

/// Reads only the header of a backup file.
pub fn read_header(file: &mut impl Read) -> Result<(Header, Vec<u8>), BackupError> {
    let mut magic = [0u8; MAGIC.len()];
    file.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(BackupError::Unreadable);
    }
    let mut len = [0u8; 4];
    file.read_exact(&mut len)?;
    let len = u32::from_be_bytes(len) as usize;
    if len > 64 * 1024 {
        return Err(BackupError::Unreadable);
    }
    let mut json = vec![0u8; len];
    file.read_exact(&mut json)?;
    let header: Header = serde_json::from_slice(&json).map_err(|_| BackupError::Unreadable)?;
    Ok((header, json))
}

/// Reads a backup file's contents with the institution key from the recovery
/// phrase. Every chunk is checked before any of it is given out, and a file
/// cut short fails at the end instead of looking complete: a reader must read
/// to the end (`Read` returns 0) before trusting what it has.
pub struct BackupReader<R: Read> {
    input: R,
    header: Header,
    aad: Vec<u8>,
    dec: Option<DecryptorBE32<ChaCha20Poly1305>>,
    ahead: Vec<u8>,
    plain: Vec<u8>,
    at: usize,
}

impl<R: Read> BackupReader<R> {
    pub fn open(institution: &StaticSecret, mut input: R) -> Result<Self, BackupError> {
        let (header, aad) = read_header(&mut input)?;
        let data_key: [u8; 32] = open_seal(institution, &header.key, BACKUP_CONTEXT).map_err(|_| BackupError::WrongKey)?.try_into().map_err(|_| BackupError::Unreadable)?;
        let mut nonce = [0u8; NONCE_LEN];
        input.read_exact(&mut nonce)?;
        let mut ahead = vec![0u8; CHUNK + TAG];
        let n = read_full(&mut input, &mut ahead)?;
        ahead.truncate(n);
        Ok(BackupReader { input, header, aad, dec: Some(DecryptorBE32::from_aead(ChaCha20Poly1305::new(&data_key.into()), &nonce.into())), ahead, plain: Vec::new(), at: 0 })
    }

    pub fn header(&self) -> &Header {
        &self.header
    }

    /// Opens the next chunk; false once the last one has been opened.
    fn next_chunk(&mut self) -> Result<bool, BackupError> {
        let Some(mut dec) = self.dec.take() else { return Ok(false) };
        if self.ahead.len() < TAG {
            return Err(BackupError::Unreadable);
        }
        let frame = std::mem::take(&mut self.ahead);
        let mut next = vec![0u8; CHUNK + TAG];
        let n = read_full(&mut self.input, &mut next)?;
        next.truncate(n);
        let payload = chacha20poly1305::aead::Payload { msg: &frame, aad: &self.aad };
        self.plain = if n == 0 {
            dec.decrypt_last(payload).map_err(|_| BackupError::Unreadable)?
        } else {
            let plain = dec.decrypt_next(payload).map_err(|_| BackupError::Unreadable)?;
            self.dec = Some(dec);
            plain
        };
        self.ahead = next;
        self.at = 0;
        Ok(true)
    }
}

impl<R: Read> Read for BackupReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        while self.at >= self.plain.len() {
            match self.next_chunk() {
                Ok(true) => {}
                Ok(false) => return Ok(0),
                Err(BackupError::Io(e)) => return Err(e),
                Err(_) => return Err(io::Error::new(io::ErrorKind::InvalidData, "the backup could not be opened with this key, or is damaged")),
            }
        }
        let n = buf.len().min(self.plain.len() - self.at);
        buf[..n].copy_from_slice(&self.plain[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}

/// Decrypts a backup file with the institution key from the recovery phrase.
pub fn read_backup(institution: &StaticSecret, file: &mut impl Read, out: &mut impl Write) -> Result<Header, BackupError> {
    let mut reader = BackupReader::open(institution, file)?;
    io::copy(&mut reader, out).map_err(|e| if e.kind() == io::ErrorKind::InvalidData { BackupError::Unreadable } else { BackupError::Io(e) })?;
    out.flush()?;
    Ok(reader.header)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vectors() -> serde_json::Value {
        serde_json::from_str(include_str!("../tests/seal-vectors.json")).unwrap()
    }

    fn b64(v: &serde_json::Value) -> Vec<u8> {
        URL_SAFE_NO_PAD.decode(v.as_str().unwrap()).unwrap()
    }

    #[test]
    fn agrees_with_the_browser() {
        let v = vectors();
        let entropy = read_recovery_phrase(v["phrase"].as_str().unwrap()).unwrap();
        assert_eq!(entropy.to_vec(), b64(&v["entropy"]));
        // Typed loosely, it still reads; mistyped, it does not.
        let loose = v["phrase"].as_str().unwrap().to_lowercase().replace('0', "o").replace('-', " ");
        assert_eq!(read_recovery_phrase(&loose).unwrap(), entropy);
        assert!(matches!(read_recovery_phrase(v["mistyped"].as_str().unwrap()), Err(BackupError::Phrase)));

        let secret = institution_key(&entropy);
        let public = PublicKey::from(&secret);
        assert_eq!(public.as_bytes().to_vec(), b64(&v["institutionPublicKey"]));
        assert_eq!(fingerprint(public.as_bytes()), v["fingerprint"].as_str().unwrap());

        let s = &v["seal"];
        let ephemeral: [u8; 32] = b64(&s["ephemeral"]).try_into().unwrap();
        let nonce: [u8; 12] = b64(&s["nonce"]).try_into().unwrap();
        let context = s["context"].as_str().unwrap();
        let plain = s["plaintext"].as_str().unwrap().as_bytes();
        assert_eq!(seal_with(&public, plain, context, StaticSecret::from(ephemeral), nonce), s["sealed"].as_str().unwrap());
        assert_eq!(open_seal(&secret, s["sealed"].as_str().unwrap(), context).unwrap(), plain);
        assert!(open_seal(&secret, s["sealed"].as_str().unwrap(), &storage_context("st1", "pc2")).is_err());
    }

    #[test]
    fn a_backup_opens_with_the_phrase_only() {
        let secret = institution_key(&[7u8; 16]);
        let public = PublicKey::from(&secret);
        // Several chunks and a ragged end, and the exact-chunk edge.
        for size in [0usize, 10, CHUNK, CHUNK * 3 + 17] {
            let data: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
            let mut file = Vec::new();
            let written = write_backup(&public, "police", "pc1", &mut &data[..], &mut file).unwrap();
            assert_eq!(written as usize, file.len());
            let mut back = Vec::new();
            let header = read_backup(&secret, &mut &file[..], &mut back).unwrap();
            assert_eq!(back, data, "size {size}");
            assert_eq!(header.computer, "pc1");
            assert_eq!(header.key_fingerprint, fingerprint(public.as_bytes()));
        }
        let mut file = Vec::new();
        write_backup(&public, "police", "pc1", &mut &b"cells"[..], &mut file).unwrap();
        let other = institution_key(&[8u8; 16]);
        assert!(read_backup(&other, &mut &file[..], &mut Vec::new()).is_err());
        // A changed byte anywhere after the header is caught.
        let last = file.len() - 1;
        file[last] ^= 1;
        assert!(read_backup(&secret, &mut &file[..], &mut Vec::new()).is_err());
    }
}
