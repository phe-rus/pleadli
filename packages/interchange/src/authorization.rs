//! Which institution may send which message to which, and nothing else.
//!
//! The relay (pleadli.com) joins two addresses once an administrator of the
//! office asked has approved the connection. It does not know what a referral
//! or a custody order is, so it cannot say that a law firm must never post a
//! custody order. This table says it, on the computer that receives, before
//! any package is opened. It lists only the paths the applications actually
//! implement, each taken from the message types in `messages`. A pair or a kind
//! that is not listed is refused: no institution has a general right to write
//! to another, and adding a path means adding a line here, with the law or
//! procedure that allows it written in the commit that does so.
//!
//! Whether a message is permitted is one question. Whether the sender is a
//! station this office trusts, and whether the signature holds, are two
//! more, and `envelope::open` and each application's link table answer them.

use crate::identity::IdentityKind::{self, CourtRegistry, DppOffice, LawFirm, PoliceStation, PrisonFacility};
use crate::messages::*;
use crate::pairing::{KIND_CONFIRMATION, KIND_INVITE, KIND_RESPONSE};

/// One implemented path: `kind` may travel from `from` to `to`.
struct Path {
    from: IdentityKind,
    to: IdentityKind,
    kind: &'static str,
    /// What it is, in the words of the institution that receives it.
    what: &'static str,
}

const fn p(from: IdentityKind, to: IdentityKind, kind: &'static str, what: &'static str) -> Path {
    Path { from, to, kind, what }
}

const PATHS: &[Path] = &[
    // Police and the DPP: a referral goes up, the receipt and the decision come back.
    p(PoliceStation, DppOffice, KIND_REFERRAL, "a case file referred for a decision"),
    p(DppOffice, PoliceStation, KIND_RECEIPT, "the DPP's answer to a referral"),
    p(DppOffice, PoliceStation, KIND_DECISION_NOTICE, "the DPP's decision on a referred file"),
    // The DPP and a court registry: a filing or a withdrawal goes to the court, the registry's answer comes back.
    p(DppOffice, CourtRegistry, KIND_FILING, "a prosecution file lodged with the registry"),
    p(DppOffice, CourtRegistry, KIND_WITHDRAWAL, "a withdrawal or discontinuance of a filed case"),
    p(CourtRegistry, DppOffice, KIND_FILING_RECEIPT, "the registry's answer to a filing or a withdrawal"),
    // A court registry and counsel: notices go to the firm, filings and answers come back.
    p(CourtRegistry, LawFirm, KIND_COURT_NOTICE, "a hearing notice or a copy of an order"),
    p(LawFirm, CourtRegistry, KIND_COURT_NOTICE_RECEIPT, "the firm's answer to a notice"),
    p(LawFirm, CourtRegistry, KIND_FIRM_FILING, "a document filed by counsel"),
    p(CourtRegistry, LawFirm, KIND_FIRM_FILING_RECEIPT, "the registry's answer to counsel's filing"),
    // A court registry and a prison: orders go to the facility, receipts and reports come back.
    p(CourtRegistry, PrisonFacility, KIND_CUSTODY_ORDER, "a remand, release or committal order"),
    p(PrisonFacility, CourtRegistry, KIND_CUSTODY_RECEIPT, "the facility's answer to an order"),
    p(PrisonFacility, CourtRegistry, KIND_CUSTODY_REPORT, "the facility's report on a person the court sent"),
];

/// The two sides of every connection that may exist, either way round.
fn connected(a: IdentityKind, b: IdentityKind) -> bool {
    PATHS.iter().any(|x| (x.from == a && x.to == b) || (x.from == b && x.to == a))
}

/// May a package of `kind` travel from an institution of kind `from` to one of kind `to`?
/// Pairing messages are allowed in both directions between any two institutions
/// that have at least one implemented path.
pub fn permitted(from: IdentityKind, to: IdentityKind, kind: &str) -> bool {
    if matches!(kind, KIND_INVITE | KIND_RESPONSE | KIND_CONFIRMATION) {
        return connected(from, to);
    }
    PATHS.iter().any(|x| x.from == from && x.to == to && x.kind == kind)
}

/// Every kind `to` may receive from `from`, for messages and screens.
pub fn kinds(from: IdentityKind, to: IdentityKind) -> Vec<(&'static str, &'static str)> {
    PATHS.iter().filter(|x| x.from == from && x.to == to).map(|x| (x.kind, x.what)).collect()
}

/// Checks a package's claimed sender kind and kind against the receiving institution.
/// The claim is the header's, which is not yet proven: this is the first, cheap refusal.
/// A refusal names the kinds, never the content.
pub fn check(from: IdentityKind, to: IdentityKind, kind: &str) -> Result<(), String> {
    if permitted(from, to, kind) {
        Ok(())
    } else {
        Err(format!("A {} is not allowed to send a '{}' package to a {}. Nothing was kept.", label(from), kind, label(to)))
    }
}

pub fn label(kind: IdentityKind) -> &'static str {
    match kind {
        PoliceStation => "police station",
        DppOffice => "DPP office",
        CourtRegistry => "court registry",
        PrisonFacility => "prison facility",
        LawFirm => "law firm",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [IdentityKind; 5] = [PoliceStation, DppOffice, CourtRegistry, PrisonFacility, LawFirm];
    const MESSAGES: [&str; 13] = [
        KIND_REFERRAL,
        KIND_RECEIPT,
        KIND_DECISION_NOTICE,
        KIND_FILING,
        KIND_FILING_RECEIPT,
        KIND_WITHDRAWAL,
        KIND_CUSTODY_ORDER,
        KIND_CUSTODY_RECEIPT,
        KIND_CUSTODY_REPORT,
        KIND_COURT_NOTICE,
        KIND_COURT_NOTICE_RECEIPT,
        KIND_FIRM_FILING,
        KIND_FIRM_FILING_RECEIPT,
    ];

    #[test]
    fn every_message_has_exactly_one_direction() {
        for kind in MESSAGES {
            let n = PATHS.iter().filter(|x| x.kind == kind).count();
            assert_eq!(n, 1, "{kind} must be listed once");
        }
    }

    #[test]
    fn a_firm_can_never_send_a_custody_order_and_a_prison_can_never_file_a_case() {
        for kind in MESSAGES {
            for from in ALL {
                for to in ALL {
                    let expected = PATHS.iter().any(|x| x.from == from && x.to == to && x.kind == kind);
                    assert_eq!(permitted(from, to, kind), expected, "{from:?} to {to:?} {kind}");
                }
            }
        }
        assert!(!permitted(LawFirm, PrisonFacility, KIND_CUSTODY_ORDER));
        assert!(!permitted(PoliceStation, CourtRegistry, KIND_FILING));
        assert!(!permitted(LawFirm, DppOffice, KIND_FIRM_FILING));
        assert!(!permitted(PrisonFacility, DppOffice, KIND_FILING_RECEIPT));
    }

    #[test]
    fn nothing_is_allowed_to_oneself_or_between_unlisted_pairs() {
        for kind in MESSAGES.iter().chain([KIND_INVITE, KIND_RESPONSE, KIND_CONFIRMATION].iter()) {
            for k in ALL {
                assert!(!permitted(k, k, kind), "{k:?} to itself");
            }
        }
        // Police and prisons, police and courts, police and firms, firms and prisons, firms and the DPP: no path is implemented.
        for (a, b) in [(PoliceStation, PrisonFacility), (PoliceStation, CourtRegistry), (PoliceStation, LawFirm), (LawFirm, PrisonFacility), (LawFirm, DppOffice), (DppOffice, PrisonFacility)] {
            for kind in MESSAGES.iter().chain([KIND_INVITE, KIND_RESPONSE, KIND_CONFIRMATION].iter()) {
                assert!(!permitted(a, b, kind) && !permitted(b, a, kind), "{a:?} and {b:?} must not exchange {kind}");
            }
        }
    }

    #[test]
    fn pairing_is_allowed_only_between_institutions_that_have_a_path() {
        for kind in [KIND_INVITE, KIND_RESPONSE, KIND_CONFIRMATION] {
            assert!(permitted(PoliceStation, DppOffice, kind) && permitted(DppOffice, PoliceStation, kind));
            assert!(permitted(DppOffice, CourtRegistry, kind) && permitted(CourtRegistry, DppOffice, kind));
            assert!(permitted(CourtRegistry, LawFirm, kind) && permitted(LawFirm, CourtRegistry, kind));
            assert!(permitted(CourtRegistry, PrisonFacility, kind) && permitted(PrisonFacility, CourtRegistry, kind));
            assert!(!permitted(PoliceStation, PrisonFacility, kind));
        }
    }

    #[test]
    fn an_unknown_kind_is_refused() {
        assert!(!permitted(PoliceStation, DppOffice, "anything_else"));
        assert!(check(LawFirm, PrisonFacility, KIND_CUSTODY_ORDER).unwrap_err().contains("law firm"));
    }
}
