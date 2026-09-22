//! How a station comes to be trusted by exactly one DPP office, and that office
//! by the station, before anything is sent.
//!
//! 1. **Invitation.** The office decides which station it handles and issues an
//!    invitation *for that station*: signed by the office, single use, with an
//!    expiry and a random nonce. This is the office "giving the station the
//!    connection". A station cannot enrol itself with an office.
//! 2. **Response.** The station reads the invitation, sees which office is
//!    offering (its name and fingerprint), and, if it means to connect, answers
//!    with its own identity, signed by the station and carrying the nonce, so the
//!    answer can only be to that invitation.
//! 3. **Confirmation.** The office reads the response and sees which station
//!    answered. Nothing is trusted yet. A person at the office reads the
//!    station's fingerprint aloud to the station (or compares it in person) and,
//!    only if it matches, marks the station trusted. The office then sends a
//!    signed, sealed confirmation, so the station knows the office trusts it and
//!    holds the office's keys pinned.
//!
//! Both sides now hold the other's keys, and every later package is checked
//! against them. Either can end the connection; the office can revoke a station
//! at any time, after which its packages are refused.

use serde::{Deserialize, Serialize};

use crate::envelope::{open, open_public, peek, seal, sign_public, Body, Header, PackageError};
use crate::identity::{hex, Identity, PublicIdentity};

pub const KIND_INVITE: &str = "pairing_invite";
pub const KIND_RESPONSE: &str = "pairing_response";
pub const KIND_CONFIRMATION: &str = "pairing_confirmation";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairingInvite {
    pub invite_id: String,
    pub office: PublicIdentity,
    /// The station this invitation was issued to, as the office knows it.
    pub intended_station: String,
    pub expires_at: i64,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairingResponse {
    pub invite_id: String,
    pub invite_nonce: String,
    pub station: PublicIdentity,
    /// The officer in charge, as the station gives it, for the office's records.
    pub officer_in_charge: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairingConfirmation {
    pub invite_id: String,
    pub station_id: String,
    /// `trusted` or `declined`.
    pub outcome: String,
    pub reason: Option<String>,
}

pub fn random_nonce() -> String {
    let mut bytes = [0u8; 16];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut bytes);
    hex(&bytes)
}

/// The office issues an invitation for one station.
pub fn make_invite(office: &Identity, intended_station: &str, expires_at: i64) -> Result<(Vec<u8>, PairingInvite), PackageError> {
    let invite = PairingInvite { invite_id: uuid::Uuid::new_v4().to_string(), office: office.public.clone(), intended_station: intended_station.trim().to_string(), expires_at, nonce: random_nonce() };
    let (bytes, _) = sign_public(office, KIND_INVITE, None, &Body::new(serde_json::to_value(&invite).map_err(|_| PackageError::BadFormat)?))?;
    Ok((bytes, invite))
}

/// The station reads an invitation. The signature proves it is whole and from
/// the holder of the key inside it; only the fingerprint, read aloud, proves who
/// that is.
pub fn read_invite(bytes: &[u8]) -> Result<PairingInvite, PackageError> {
    let peeked = peek(bytes)?;
    let invite: PairingInvite = serde_json::from_value(peeked.public_body()?.json).map_err(|_| PackageError::BadFormat)?;
    if peeked.header.kind != KIND_INVITE || peeked.header.from.id != invite.office.id {
        return Err(PackageError::BadFormat);
    }
    open_public(peeked, &invite.office)?;
    Ok(invite)
}

/// The station answers an invitation with its own identity.
pub fn make_response(station: &Identity, invite: &PairingInvite, officer_in_charge: Option<&str>) -> Result<Vec<u8>, PackageError> {
    let response = PairingResponse { invite_id: invite.invite_id.clone(), invite_nonce: invite.nonce.clone(), station: station.public.clone(), officer_in_charge: officer_in_charge.map(str::to_string) };
    Ok(sign_public(station, KIND_RESPONSE, Some(&invite.invite_id), &Body::new(serde_json::to_value(&response).map_err(|_| PackageError::BadFormat)?))?.0)
}

/// The office reads a response. It is only a claim until a person confirms the
/// fingerprint.
pub fn read_response(bytes: &[u8]) -> Result<PairingResponse, PackageError> {
    let peeked = peek(bytes)?;
    let response: PairingResponse = serde_json::from_value(peeked.public_body()?.json).map_err(|_| PackageError::BadFormat)?;
    if peeked.header.kind != KIND_RESPONSE || peeked.header.from.id != response.station.id {
        return Err(PackageError::BadFormat);
    }
    open_public(peeked, &response.station)?;
    Ok(response)
}

/// The office tells the station what it decided, sealed to the station.
pub fn make_confirmation(office: &Identity, station: &PublicIdentity, invite_id: &str, outcome: &str, reason: Option<&str>) -> Result<Vec<u8>, PackageError> {
    let confirmation = PairingConfirmation { invite_id: invite_id.to_string(), station_id: station.id.clone(), outcome: outcome.to_string(), reason: reason.map(str::to_string) };
    Ok(seal(office, station, KIND_CONFIRMATION, 0, Some(invite_id), &Body::new(serde_json::to_value(&confirmation).map_err(|_| PackageError::BadFormat)?))?.0)
}

/// The station reads the office's confirmation, against the office key it
/// pinned from the invitation.
pub fn read_confirmation(station: &Identity, office: &PublicIdentity, bytes: &[u8]) -> Result<(Header, PairingConfirmation), PackageError> {
    let opened = open(station, peek(bytes)?, office)?;
    let confirmation: PairingConfirmation = serde_json::from_value(opened.body.json).map_err(|_| PackageError::BadFormat)?;
    if opened.header.kind != KIND_CONFIRMATION || confirmation.station_id != station.public.id {
        return Err(PackageError::BadFormat);
    }
    Ok((opened.header, confirmation))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::IdentityKind;

    #[test]
    fn the_three_step_handshake_leaves_both_sides_holding_each_others_keys() {
        let office = Identity::generate(IdentityKind::DppOffice, "Wandegeya DPP Office", Some("Kampala Central"));
        let station = Identity::generate(IdentityKind::PoliceStation, "Wandegeya Police Station", Some("Wandegeya"));

        let (invite_file, issued) = make_invite(&office, "Wandegeya Police Station", i64::MAX).unwrap();
        // The station sees which office is offering and what to read aloud.
        let invite = read_invite(&invite_file).unwrap();
        assert_eq!(invite, issued);
        assert_eq!(invite.office.fingerprint(), office.public.fingerprint());

        let response_file = make_response(&station, &invite, Some("OC A. Officer")).unwrap();
        let response = read_response(&response_file).unwrap();
        assert_eq!(response.invite_nonce, issued.nonce, "the answer is bound to that invitation");
        assert_eq!(response.station.fingerprint(), station.public.fingerprint());

        let confirmation_file = make_confirmation(&office, &response.station, &issued.invite_id, "trusted", None).unwrap();
        let (_, confirmation) = read_confirmation(&station, &invite.office, &confirmation_file).unwrap();
        assert_eq!(confirmation.outcome, "trusted");

        // A confirmation sealed to one station is useless to another.
        let other_station = Identity::generate(IdentityKind::PoliceStation, "Kira Road Police Station", None);
        assert!(read_confirmation(&other_station, &invite.office, &confirmation_file).is_err());
    }

    #[test]
    fn an_altered_invitation_or_response_is_refused() {
        let office = Identity::generate(IdentityKind::DppOffice, "Office", None);
        let (mut invite_file, _) = make_invite(&office, "Station", i64::MAX).unwrap();
        let last = invite_file.len() - 3;
        invite_file[last] ^= 1;
        assert!(read_invite(&invite_file).is_err());
        assert!(read_response(b"nonsense").is_err());
    }
}
