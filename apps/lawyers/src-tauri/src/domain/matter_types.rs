//! The kinds of matter, which usage each belongs to, and its stages
//! (docs/lawyers/REVIEW-2026-09-30.md, section 4.4). A matter moves through
//! its type's stages on the board; closing it (with an outcome) is separate
//! and is not a stage. The stage lists are the working shape of each kind of
//! work, not a statutory sequence: where a stage rests on a rule (the 45-day
//! notice to Government, the notice of appeal), the clocks of L2 carry the rule.

pub struct MatterType {
    pub id: &'static str,
    pub usage: &'static str,
    pub stages: &'static [&'static str],
}

pub const TYPES: &[MatterType] = &[
    MatterType { id: "civil_suit", usage: "civil", stages: &["instructions", "pre_action", "pleadings", "directions", "trial", "judgment", "costs_execution"] },
    MatterType { id: "application", usage: "civil", stages: &["filed", "served", "reply", "hearing", "ruling"] },
    MatterType { id: "criminal_defence", usage: "criminal", stages: &["instructions", "custody_bail", "plea_disclosure", "trial", "sentence", "appeal"] },
    MatterType { id: "appeal", usage: "appeals", stages: &["notice", "record", "memorandum", "hearing", "judgment"] },
    MatterType { id: "land_transaction", usage: "land", stages: &["instructions", "due_diligence", "drafting", "signing", "registration"] },
    MatterType { id: "company_matter", usage: "companies", stages: &["instructions", "due_diligence", "drafting", "signing", "registration"] },
    MatterType { id: "family_case", usage: "family", stages: &["instructions", "pleadings", "mediation", "hearing", "order"] },
    MatterType { id: "succession", usage: "family", stages: &["instructions", "petition", "gazetting", "grant", "distribution"] },
    MatterType { id: "employment_claim", usage: "employment", stages: &["instructions", "complaint", "mediation", "hearing", "award"] },
    MatterType { id: "advice", usage: "advisory", stages: &["question", "research", "drafted", "delivered"] },
    MatterType { id: "government_suit", usage: "government", stages: &["notice", "pleadings", "directions", "trial", "judgment", "satisfaction"] },
    MatterType { id: "legal_aid_case", usage: "legal_aid", stages: &["intake", "eligibility", "advice", "representation"] },
    MatterType { id: "private_prosecution", usage: "prosecution", stages: &["complaint", "sanction", "charge", "trial", "judgment"] },
];

pub fn find(id: &str) -> Option<&'static MatterType> {
    TYPES.iter().find(|t| t.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::usages::USAGES;

    #[test]
    fn every_type_belongs_to_a_known_usage_and_has_distinct_stages() {
        for t in TYPES {
            assert!(USAGES.contains(&t.usage), "{} -> {}", t.id, t.usage);
            assert!(!t.stages.is_empty());
            for (i, s) in t.stages.iter().enumerate() {
                assert!(!t.stages[..i].contains(s), "{} repeats {s}", t.id);
            }
        }
    }

    /// A transaction or advice is not before a court, so never has a hearing:
    /// the "no hearing listed" queries leave these kinds out, in the same words
    /// as the frontend's `inCourt` (features/matter-types).
    #[test]
    fn the_no_hearing_queries_leave_out_the_kinds_never_in_court() {
        for source in [include_str!("matters.rs"), include_str!("overview.rs")] {
            assert!(source.contains("NOT IN ('land_transaction', 'company_matter', 'advice')"));
        }
        assert!(include_str!("../../../src/features/matter-types/index.ts").contains("['land_transaction', 'company_matter', 'advice']"));
    }

    #[test]
    fn every_usage_that_opens_matters_has_a_type() {
        // Oaths and notarial acts are a register (L5), not matters.
        for usage in USAGES.iter().filter(|u| **u != "oaths") {
            assert!(TYPES.iter().any(|t| t.usage == *usage), "{usage} has no matter type");
        }
    }
}
