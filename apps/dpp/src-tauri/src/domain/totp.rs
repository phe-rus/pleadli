//! Authenticator codes for full protection (RFC 6238: 30-second steps, six
//! digits, HMAC-SHA1), the scheme every common authenticator app speaks.
//! The key is shown once, as a QR code and as text, and then kept only in the
//! encrypted database.

use hmac::{Hmac, Mac};
use qrcode::render::svg;
use qrcode::QrCode;
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use sha1::Sha1;

const STEP_SECONDS: i64 = 30;
const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrolment {
    pub secret: String,
    pub uri: String,
    pub svg: String,
}

pub fn base32(bytes: &[u8]) -> String {
    let mut out = String::new();
    let (mut buffer, mut bits) = (0u32, 0u32);
    for &b in bytes {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            out.push(ALPHABET[((buffer >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

pub fn unbase32(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let (mut buffer, mut bits) = (0u32, 0u32);
    for c in text.chars().filter(|c| !c.is_whitespace() && *c != '=') {
        let v = ALPHABET.iter().position(|&a| a as char == c.to_ascii_uppercase())? as u32;
        buffer = (buffer << 5) | v;
        bits += 5;
        if bits >= 8 {
            out.push((buffer >> (bits - 8)) as u8);
            bits -= 8;
        }
    }
    Some(out)
}

fn percent(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// A fresh key for one person, with what their phone needs to scan.
pub fn enrol(issuer: &str, account: &str) -> Result<Enrolment, String> {
    let mut key = [0u8; 20];
    OsRng.fill_bytes(&mut key);
    let secret = base32(&key);
    let label = percent(&format!("{issuer}:{account}"));
    let uri = format!("otpauth://totp/{label}?secret={secret}&issuer={}&algorithm=SHA1&digits=6&period=30", percent(issuer));
    let svg = QrCode::new(uri.as_bytes()).map_err(|e| e.to_string())?.render::<svg::Color>().quiet_zone(false).min_dimensions(200, 200).build();
    Ok(Enrolment { secret, uri, svg })
}

fn code_at(key: &[u8], counter: u64) -> u32 {
    let mut mac = <Hmac<Sha1> as Mac>::new_from_slice(key).expect("HMAC takes any key length");
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;
    let value = u32::from_be_bytes([digest[offset] & 0x7f, digest[offset + 1], digest[offset + 2], digest[offset + 3]]);
    value % 1_000_000
}

/// Whether `code` is right for this key now, allowing one step either side
/// for a phone whose clock is slightly off.
pub fn verify_at(secret: &str, code: &str, unix_seconds: i64) -> bool {
    let Some(key) = unbase32(secret) else { return false };
    let Ok(given) = code.trim().parse::<u32>() else { return false };
    if code.trim().len() != 6 {
        return false;
    }
    let counter = unix_seconds.div_euclid(STEP_SECONDS);
    (-1..=1).any(|d| counter + d >= 0 && code_at(&key, (counter + d) as u64) == given)
}

pub fn verify(secret: &str, code: &str) -> bool {
    verify_at(secret, code, chrono::Utc::now().timestamp())
}

/// The code a phone would show now: for tests that play the phone.
#[cfg(test)]
pub fn current_code(secret: &str) -> String {
    let counter = chrono::Utc::now().timestamp().div_euclid(STEP_SECONDS) as u64;
    format!("{:06}", code_at(&unbase32(secret).unwrap(), counter))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_rfc_6238_sha1_vectors() {
        // RFC 6238 appendix B, key "12345678901234567890", last six digits.
        let secret = base32(b"12345678901234567890");
        assert!(verify_at(&secret, "287082", 59));
        assert!(verify_at(&secret, "081804", 1111111109));
        assert!(verify_at(&secret, "050471", 1111111111));
        assert!(verify_at(&secret, "005924", 1234567890));
        assert!(!verify_at(&secret, "005925", 1234567890));
        assert!(!verify_at(&secret, "5924", 1234567890));
    }

    #[test]
    fn base32_round_trips_and_enrolment_scans() {
        let bytes = [0u8, 1, 2, 250, 255, 17, 99];
        assert_eq!(unbase32(&base32(&bytes)).unwrap(), bytes);
        let e = enrol("Pleadli DPP", "A. Prosecutor").unwrap();
        assert!(e.uri.starts_with("otpauth://totp/Pleadli%20DPP%3AA.%20Prosecutor?secret="));
        assert!(e.svg.contains("<svg"));
    }
}
