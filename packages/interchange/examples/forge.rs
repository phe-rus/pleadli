//! Test tool: damages a genuine package in one chosen way, so a receiver's
//! integrity checks can be exercised with packages that reach them (a package
//! whose id the receiver already holds is stopped earlier, by replay detection,
//! and proves nothing about integrity). Never ships; for acceptance runs only.
//!
//!   forge <mode> <in.pxpkg> <out.pxpkg> [new-id]
//!
//! Modes that leave the header alone (they keep the genuine id, so run them on a
//! package the receiver has NOT yet taken in):
//!   body       flip one bit in the encrypted body
//!   signature  flip one bit in the signature
//!   truncate   cut the last 16 bytes off the body
//!   append     add 16 bytes after the body
//!   meta-sha   change the body hash stated in the (signed) header
//!   meta-to    change the addressee stated in the (signed) header
//! Modes that rebuild the header with a new id and re-sign it with a key that is
//! NOT the sender's (the best a forger without the key can do):
//!   resign         the genuine body, a consistent header, signed by a stranger
//!   resign-body    a damaged body, a consistent header, signed by a stranger

use ed25519_dalek::Signer;
use pleadli_interchange::identity::{hex, Identity, IdentityKind};
use sha2::{Digest, Sha256};
use std::{env, fs, process::exit};

const MAGIC: &[u8; 8] = b"PLXPKG01";

fn split(bytes: &[u8]) -> (Vec<u8>, Vec<u8>, [u8; 64], Vec<u8>) {
    assert_eq!(&bytes[..8], MAGIC, "not a package");
    let hl = u32::from_be_bytes(bytes[8..12].try_into().unwrap()) as usize;
    let header = bytes[12..12 + hl].to_vec();
    let sig: [u8; 64] = bytes[12 + hl..12 + hl + 64].try_into().unwrap();
    (bytes[..8].to_vec(), header, sig, bytes[12 + hl + 64..].to_vec())
}

fn join(header: &[u8], sig: &[u8], body: &[u8]) -> Vec<u8> {
    let mut out = MAGIC.to_vec();
    out.extend_from_slice(&(header.len() as u32).to_be_bytes());
    out.extend_from_slice(header);
    out.extend_from_slice(sig);
    out.extend_from_slice(body);
    out
}

/// Swaps the value of a JSON string field for another of the same length, so the header keeps its size.
fn swap_field(header: &[u8], key: &str) -> Vec<u8> {
    let text = String::from_utf8(header.to_vec()).unwrap();
    let marker = format!("\"{key}\":\"");
    let at = text.find(&marker).unwrap_or_else(|| panic!("no field {key}")) + marker.len();
    let mut chars: Vec<char> = text.chars().collect();
    // the first character of the value, changed to a different hex digit
    let ix = text[..at].chars().count();
    chars[ix] = if chars[ix] == '0' { '1' } else { '0' };
    chars.into_iter().collect::<String>().into_bytes()
}

fn main() {
    let a: Vec<String> = env::args().collect();
    if a.len() < 4 {
        eprintln!("usage: forge <mode> <in> <out> [new-id]");
        exit(2);
    }
    let (mode, input, output) = (a[1].as_str(), &a[2], &a[3]);
    let bytes = fs::read(input).expect("read input");
    let (_, header, sig, body) = split(&bytes);
    let out = match mode {
        "body" => {
            let mut b = body.clone();
            let i = b.len() / 2;
            b[i] ^= 1;
            join(&header, &sig, &b)
        }
        "signature" => {
            let mut s = sig;
            s[7] ^= 1;
            join(&header, &s, &body)
        }
        "truncate" => join(&header, &sig, &body[..body.len() - 16]),
        "append" => {
            let mut b = body.clone();
            b.extend_from_slice(&[0xAB; 16]);
            join(&header, &sig, &b)
        }
        "meta-sha" => join(&swap_field(&header, "bodySha256"), &sig, &body),
        "meta-to" => join(&swap_field(&header, "to"), &sig, &body),
        "resign" | "resign-body" => {
            let mut b = body.clone();
            if mode == "resign-body" {
                let i = b.len() / 2;
                b[i] ^= 1;
            }
            let mut h: serde_json::Value = serde_json::from_slice(&header).unwrap();
            h["id"] = serde_json::Value::String(a.get(4).cloned().expect("resign needs a new id"));
            h["bodySha256"] = serde_json::Value::String(hex(&Sha256::digest(&b)));
            let header = serde_json::to_vec(&h).unwrap();
            let stranger = Identity::generate(IdentityKind::PoliceStation, "Stranger", None);
            let signature = ed25519_dalek::SigningKey::from_bytes(&stranger.signing_secret()).sign(&[MAGIC.as_slice(), &header].concat());
            join(&header, &signature.to_bytes(), &b)
        }
        other => {
            eprintln!("unknown mode {other}");
            exit(2);
        }
    };
    fs::write(output, out).expect("write output");
}
