# Police to DPP interchange

Built 2026-09-21 (DPP Stage 8). This file is the contract both applications implement. The code is `packages/interchange` (Rust, used by both) and, on the DPP side, `apps/dpp/src-tauri/src/domain/interchange.rs` and `referral_intake.rs`. `cargo run --example police_sim` in the crate is a working stand-in for a station.

## What exists today

**Police to DPP: nothing moves.** A Police "referral" (`apps/police/src-tauri/src/domain/referrals.rs`) is a local record: a case, a free-text `destination_name`, a date, an officer and a status the officer sets by hand (`pending`, `accepted`, `rejected`). No material leaves Police. DPP had no way to receive any, so a file was retyped.

**DPP to Police: nothing moves.** DPP records decisions, directions, issued documents and a court number. The station learns of them by phone or paper, then edits its own referral status.

**What Police holds that a prosecutor needs** (all in the case): people and their roles, statements, exhibits, charge sheets (offence, section, particulars, accused, officer, station), attachments (scans, photographs), the station's identity and jurisdiction.

**What DPP holds that the station needs back**: an acknowledgement and the office's own file reference; each decision with its reasons; the directions on a return for further investigation; issued documents (charge sheet, directions letter, written reasons for declining); the court case number.

## Who may talk to whom

A station does not send "to a DPP". It sends to **the one office that handles it**, and only after that office has given it the connection and a person there has confirmed who it is. Both sides therefore know each other before anything moves.

1. **Invitation (office to station).** The office names the station it handles and issues an invitation for that station: signed by the office, single use, with a random nonce and an expiry. A station cannot enrol itself. The office needs an identity first (a name, the area it handles, a signing key and an encryption key that never leave its computer).
2. **Answer (station to office).** The station reads the invitation and sees which office is offering (name, area, fingerprint). If it means to connect, it answers with its own identity, signed with its own key and carrying the invitation's nonce, so the answer can only be to that invitation. From now on the station lists that office as a place it can send to. The invitation is how a DPP office comes to be "listed on the Police side".
3. **Confirmation (person at the office).** The answer is only a claim: anyone holding the file could have made one. The office shows the station's fingerprint (twenty hex digits). A person phones or meets the station, has them read *their* fingerprint out, and **types** it. Typing is the comparison: it must match, or the station is not trusted. The office also reads its own fingerprint to the station, who checks it against what the invitation showed.
4. **Trusted (office to station).** The office marks the station trusted and prepares a signed, sealed confirmation, so the station knows the office trusts it and holds the office's keys pinned.

The office can revoke a station at any time, with a reason; it can decline an answer. After that its packages are refused. One station has at most one live connection to an office. A station may be connected to several offices; each referral goes to exactly one.

## The package

One file, `.pxpkg`: `PLXPKG01`, header (JSON), signature (Ed25519), body.

- **Header**: kind, package id, sender (id, name, fingerprint), addressee id, time, sequence number, what it replies to, hash of the body, and the ephemeral key and nonce used to seal it.
- **Signature** covers the magic and the header, so it covers the body through its hash. Nothing in the file can change without it failing.
- **Body** is sealed to the addressee (ephemeral X25519 against the addressee's static key, then ChaCha20-Poly1305). It holds the message as JSON and any files, each with its SHA-256, checked on opening. Pairing messages carry only public information and are signed but not sealed.

A package is transport independent: a USB stick, an e-mail attachment, a download, a local network or a tunnel all move the same bytes. The application does not care how it arrived; it decides by what is inside.

**Receiving is two steps.** `peek` reads the header without believing it, to learn who claims to have sent it. The receiver looks up the key it pinned for that sender. `open` verifies with that key and decrypts. A package from anyone not pinned, or addressed to someone else, is refused and nothing is kept.

## Messages

| Kind | From | To | Contains |
|---|---|---|---|
| `pairing_invite` | office | station | office identity, intended station, expiry, nonce (public, signed) |
| `pairing_response` | station | office | station identity, officer in charge, the invitation's id and nonce (public, signed) |
| `pairing_confirmation` | office | station | trusted, declined or revoked, and why |
| `referral` | station | office | police reference, station, officer, summary, people with roles, statements, exhibits, proposed charges, files, and `resubmissionOf` when it answers a return |
| `receipt` | office | station | accepted or rejected, the office's file key and registration number, the reason if rejected |
| `decision_notice` | office | station | the decision and its reasons, the counts it covers, directions on a return, issued documents as text, the court case number |

## What DPP does with a package

1. **Refuse** if it is not from a station this office trusts, not addressed to this office, has a bad signature, is dated in the future, was already received, or is not a kind an office receives. Every refusal is audited with the claimed sender and the reason, never the content.
2. **Hold** if it passes. The content sits in `incoming_packages`, its files sealed in the vault, **apart from the records**. Nothing is a file, a person or a statement yet.
3. **Show** it to the prosecutor: who signed it (name and fingerprint), when, package number, hash, a gap warning if earlier numbers never arrived, a warning if the station names itself differently than it was confirmed as, people whose national ID matches someone already held (to reuse or add new), and exactly what accepting would create.
4. **Accept or reject** by a person. Accepting creates the file (or, for a resubmission, adds the material to the file it names and moves it back into review), people, statements, exhibits, proposed charges and attached files in one transaction, and queues a receipt. Rejecting needs a reason, keeps no record, destroys the sealed files, and queues a receipt carrying the reason.
5. **Send back** only what the prosecutor exports: receipts, decision notices, confirmations. A decision notice is prepared from a decision on a file that arrived through a connection, and only issued documents go in it.

A resubmission must name a file this station referred, and that file must be waiting with the station. It is never a new file.

## Security properties

| Threat | Defence |
|---|---|
| A station nobody invited sends a referral | refused: no connection, nothing kept |
| A station answers an invitation nobody issued, or twice | refused: the invitation must exist, be open, be unexpired, carry its nonce |
| Someone answers as a station they are not | the office types the fingerprint the real station reads out; a wrong one is refused and audited |
| A trusted station's key is copied or its packages forged | signature checked against the key pinned at confirmation; a different key with the same id is refused |
| A package meant for another office is presented here | sealed to one office's key; also refused by addressee |
| A package is replayed | package id is unique, even after rejection |
| A package is altered in transit | signature over the header, hash of the body, authenticated encryption, per-file hashes |
| A station is compromised or closed | the office revokes it with a reason; further packages are refused and nothing more is sent to it |
| A referral is trusted because it is signed | signed only proves who sent it; nothing becomes a record until a person accepts it |
| Keys leave the machine | secrets live only in the encrypted database and are never in a package |

Not defended: a station's own key stolen and used before the office revokes it; a person who confirms a fingerprint without really comparing it; the carrier reading a package's existence (not its content).

## What the Police side must implement

- A station identity (keys generated once, kept in the app's encrypted store; the name is part of the fingerprint).
- A list of **DPP offices**, filled by importing invitations, showing each office's name, area and fingerprint. The referral form's destination becomes a choice from this list instead of free text, and a station may have more than one.
- Answering an invitation, and reading the office's confirmation with the office key pinned from the invitation.
- Building a `referral` from a case (people and roles, statements, exhibits, charge sheets, attachments), sealed to the chosen office, with a per-office sequence number.
- Reading `receipt` and `decision_notice` packages from the office it trusts: set the referral's status (accepted, rejected), keep the office's file key to quote in a resubmission, and show directions, documents and the court number on the case.
- Reading its own fingerprint aloud to an office, and comparing the office's.

`packages/interchange/examples/police_sim.rs` does each of these in about a hundred lines.

## Not built

The Police-side interface (only the crate and the simulator exist); LAN and tunnel carriers (the bytes are ready for them); key rotation; a way for a station to end a connection from its side; delivery confirmation (a package is "saved to send", never "delivered"); the Courts and Lawyers directions of the same design.
