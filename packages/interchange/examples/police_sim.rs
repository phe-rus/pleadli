//! A stand-in for the Police side, to exercise a DPP office by hand. It is also
//! the shortest correct example of how a station uses this crate.
//!
//!   police_sim init <dir> "<station name>" ["<jurisdiction>"]
//!   police_sim respond <dir> <invitation.pxpkg> <answer.pxpkg>
//!   police_sim referral <dir> <out.pxpkg> <reference> [<file key to resubmit>]
//!   police_sim read <dir> <package.pxpkg>

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{hex, unhex32, Identity, IdentityKind, PublicIdentity};
use pleadli_interchange::messages::*;
use pleadli_interchange::pairing;
use std::{env, fs, path::Path, process::exit};

fn state_path(dir: &str) -> std::path::PathBuf {
    Path::new(dir).join("station.json")
}

fn save(dir: &str, station: &Identity, office: Option<&PublicIdentity>, seq: u64) {
    let json = serde_json::json!({
        "public": station.public, "signing": hex(&station.signing_secret()), "encryption": hex(&station.encryption_secret()),
        "office": office, "seq": seq,
    });
    fs::create_dir_all(dir).unwrap();
    fs::write(state_path(dir), serde_json::to_vec_pretty(&json).unwrap()).unwrap();
}

fn load(dir: &str) -> (Identity, Option<PublicIdentity>, u64) {
    let json: serde_json::Value = serde_json::from_slice(&fs::read(state_path(dir)).expect("run init first")).unwrap();
    let public: PublicIdentity = serde_json::from_value(json["public"].clone()).unwrap();
    let station = Identity::restore(public, unhex32(json["signing"].as_str().unwrap()).unwrap(), unhex32(json["encryption"].as_str().unwrap()).unwrap()).unwrap();
    (station, serde_json::from_value(json["office"].clone()).ok(), json["seq"].as_u64().unwrap_or(0))
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("");
    match cmd {
        "init" => {
            let station = Identity::generate(IdentityKind::PoliceStation, &args[3], args.get(4).map(String::as_str));
            save(&args[2], &station, None, 0);
            println!("{}", station.public.fingerprint());
        }
        "respond" => {
            let (station, _, seq) = load(&args[2]);
            let invite = pairing::read_invite(&fs::read(&args[3]).unwrap()).expect("not a valid invitation");
            eprintln!("Invitation from {} ({}). Fingerprint to confirm aloud: {}", invite.office.name, invite.office.jurisdiction.clone().unwrap_or_default(), invite.office.fingerprint());
            fs::write(&args[4], pairing::make_response(&station, &invite, Some("OC of the station")).unwrap()).unwrap();
            save(&args[2], &station, Some(&invite.office), seq);
            println!("{}", station.public.fingerprint());
        }
        "referral" => {
            let (station, office, seq) = load(&args[2]);
            let office = office.expect("respond to an invitation first");
            let reference = &args[4];
            let payload = ReferralPayload {
                police_reference: reference.clone(),
                station_name: station.public.name.clone(),
                referred_at: chrono_now() - 86_400_000,
                referring_officer: Some("D/Sgt B. Detective".into()),
                summary: "A motor vehicle was stolen from outside the complainant's home at Kira Road and recovered two days later.".into(),
                people: vec![
                    PersonClaim { key: "p1".into(), role: "accused".into(), first_name: "Robert".into(), last_name: "Okello".into(), national_id: Some("CM91034521XYZAB".into()), address: Some("Gulu Town".into()), ..Default::default() },
                    PersonClaim { key: "p2".into(), role: "witness".into(), first_name: "Grace".into(), last_name: "Namutebi".into(), phone: Some("0772 445 108".into()), ..Default::default() },
                ],
                statements: vec![StatementClaim { key: "s1".into(), person_key: "p2".into(), role: "witness".into(), given_at: chrono_now() - 2 * 86_400_000, content: "I saw the accused drive the car away at about 9 pm.".into(), taken_by: Some("D/Sgt B. Detective".into()), file_ids: vec!["scan-1".into()] }],
                exhibits: vec![ExhibitClaim { key: "e1".into(), description: "Toyota Premio UAX 123A".into(), identification_mark: Some("Chassis 555".into()), recovered_at: None, recovered_from_location: Some("Bweyogerere".into()), file_ids: vec![] }],
                charges: vec![ChargeClaim { accused_person_key: Some("p1".into()), offence: "Theft of a motor vehicle".into(), statutory_section: Some("s.254 of the Penal Code Act".into()), particulars: Some("On the night of 3 May 2026 at Kira Road the accused stole a Toyota Premio.".into()) }],
                resubmission_of: args.get(5).cloned(),
                notes: None,
            };
            let body = Body::new(serde_json::to_value(&payload).unwrap()).with_file("scan-1", "statement-of-grace-namutebi.pdf", "application/pdf", b"%PDF-1.4 scanned statement of the complainant".to_vec());
            let (bytes, header) = envelope::seal(&station, &office, KIND_REFERRAL, seq + 1, None, &body).unwrap();
            fs::write(&args[3], bytes).unwrap();
            save(&args[2], &station, Some(&office), seq + 1);
            println!("package {} number {}", header.id, header.seq);
        }
        "read" => {
            let (station, office, _) = load(&args[2]);
            let office = office.expect("respond to an invitation first");
            let peeked = envelope::peek(&fs::read(&args[3]).unwrap()).expect("not a package");
            let opened = envelope::open(&station, peeked, &office).expect("refused: not from the pinned office, or not for this station");
            println!("{} #{} from {}\n{}", opened.header.kind, opened.header.seq, opened.header.from.name, serde_json::to_string_pretty(&opened.body.json).unwrap());
        }
        _ => {
            eprintln!("usage: police_sim init|respond|referral|read ...");
            exit(2);
        }
    }
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}
