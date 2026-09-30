//! The Sixth Schedule to the Advocates (Remuneration and Taxation of Costs)
//! Regulations (SI 123 of 1982, Schedule substituted by SI 7 of 2018): the
//! scale of fees in the High Court, magistrates courts, tribunals and
//! arbitration [P: ULII consolidation 2018-03-02, Laws.Africa, CC-BY]. Uganda
//! only. The app computes the scale; items the Schedule leaves "reasonable,
//! but not less than" a sum are given as that floor, never as an amount.

use serde::Serialize;

/// Item 1(1): marginal bands of the claim or value of the subject matter.
/// (upper bound of the band in shillings, percentage of the part inside it)
const BANDS: [(i64, i64); 7] = [(2_000_000, 15), (5_000_000, 14), (10_000_000, 12), (20_000_000, 10), (50_000_000, 8), (100_000_000, 5), (i64::MAX, 2)];

/// The instruction fee under item 1(1) for a value, in whole shillings.
pub fn instruction_fee(value: i64) -> i64 {
    let mut fee = 0i128;
    let mut below = 0i64;
    for (top, pct) in BANDS {
        if value <= below {
            break;
        }
        let part = value.min(top) - below;
        fee += part as i128 * pct as i128;
        below = top;
    }
    ((fee + 50) / 100) as i64
}

/// Item 1(2) to 1(4): the share of the 1(1) fee.
pub fn basis_percent(basis: &str) -> Option<i64> {
    match basis {
        "1_1" => Some(100),
        "1_2" => Some(65),
        "1_3" => Some(75),
        "1_4" => Some(85),
        _ => None,
    }
}

pub fn instruction_fee_for(value: i64, basis: &str) -> Option<i64> {
    basis_percent(basis).map(|pct| (instruction_fee(value) * pct + 50) / 100)
}

/// A fixed item of the Schedule: its reference, what it is, its fee and the
/// fee for each extra copy (or per hour for attendances).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fixed {
    pub item: &'static str,
    pub what: &'static str,
    pub fee: i64,
    /// Each extra copy (drawing, letters); none for attendances.
    pub per_copy: Option<i64>,
    /// Charged per hour.
    pub hourly: bool,
}

pub const FIXED: [Fixed; 10] = [
    Fixed { item: "10(1)", what: "Drawing a plaint, petition, memorandum of appeal, written statement of defence, reply or similar pleading", fee: 300_000, per_copy: Some(50_000), hourly: false },
    Fixed { item: "10(2)", what: "Drawing an interlocutory application, notice of motion, chamber application, originating summons or affidavit", fee: 200_000, per_copy: Some(30_000), hourly: false },
    Fixed { item: "10(3)", what: "Drawing a decree, order or other necessary court document", fee: 50_000, per_copy: Some(20_000), hourly: false },
    Fixed { item: "10(4)", what: "Drawing written submissions", fee: 300_000, per_copy: Some(50_000), hourly: false },
    Fixed { item: "10(5)", what: "Drawing the bill of costs", fee: 200_000, per_copy: Some(50_000), hourly: false },
    Fixed { item: "11(1)", what: "A letter before action or other necessary letter", fee: 100_000, per_copy: Some(20_000), hourly: false },
    Fixed { item: "12(1)", what: "Attending court to conduct the matter, hear a judgment or ruling, or make an application, including taxation", fee: 100_000, per_copy: None, hourly: true },
    Fixed { item: "12(2)(a)", what: "Attending court on a routine matter, by an advocate", fee: 100_000, per_copy: None, hourly: true },
    Fixed { item: "12(2)(b)", what: "Attending court on a routine matter, by a clerk", fee: 20_000, per_copy: None, hourly: true },
    Fixed { item: "12(3)", what: "Interviewing witnesses, deponents or experts, or another necessary attendance outside chambers", fee: 100_000, per_copy: None, hourly: true },
];

pub fn fixed(item: &str) -> Option<&'static Fixed> {
    FIXED.iter().find(|f| f.item == item)
}

/// Items the Schedule leaves to the taxing officer, with the floor it sets.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Floor {
    pub item: &'static str,
    pub what: &'static str,
    pub at_least: i64,
}

pub const FLOORS: [Floor; 8] = [
    Floor { item: "3(1)(a)", what: "Instructions: undefended petition for divorce, nullity, separation or restitution", at_least: 1_000_000 },
    Floor { item: "3(1)(b)", what: "Instructions: defended matrimonial petition", at_least: 2_000_000 },
    Floor { item: "4", what: "Instructions: adoption or guardianship", at_least: 500_000 },
    Floor { item: "7", what: "Instructions: judicial review or prerogative orders", at_least: 3_000_000 },
    Floor { item: "8(1)", what: "Instructions: to defend or prosecute a criminal case", at_least: 2_000_000 },
    Floor { item: "8(2)", what: "Instructions: to make or oppose a bail application", at_least: 500_000 },
    Floor { item: "9(1)", what: "Instructions: to sue or defend a case not otherwise provided for", at_least: 2_000_000 },
    Floor { item: "9(2)", what: "Instructions: to make or oppose an interlocutory application", at_least: 300_000 },
];

/// Which drawing item a document kind is claimed under.
pub fn drawing_item(kind: &str) -> Option<&'static str> {
    match kind {
        "plaint" | "written_statement_of_defence" | "reply" | "petition" | "memorandum_of_appeal" => Some("10(1)"),
        "notice_of_motion" | "affidavit" | "affidavit_of_service" | "bail_application" => Some("10(2)"),
        "submissions" => Some("10(4)"),
        "demand_letter" | "letter" => Some("11(1)"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_instruction_fee_is_taken_band_by_band() {
        assert_eq!(instruction_fee(1_000_000), 150_000, "15% of 1,000,000");
        assert_eq!(instruction_fee(2_000_000), 300_000);
        // 15% of 2M + 14% of 3M.
        assert_eq!(instruction_fee(5_000_000), 300_000 + 420_000);
        // + 12% of 5M + 10% of 2.4M: the Auma Grace claim of UGX 12,400,000.
        assert_eq!(instruction_fee(12_400_000), 300_000 + 420_000 + 600_000 + 240_000);
        // Every band to 100M, then 2% of the 50M above it.
        assert_eq!(instruction_fee(150_000_000), 300_000 + 420_000 + 600_000 + 1_000_000 + 2_400_000 + 2_500_000 + 1_000_000);
        assert_eq!(instruction_fee(0), 0);
    }

    #[test]
    fn an_undefended_suit_early_settlement_or_refused_leave_takes_a_share() {
        assert_eq!(instruction_fee_for(12_400_000, "1_2"), Some(1_014_000), "65% of 1,560,000");
        assert_eq!(instruction_fee_for(12_400_000, "1_3"), Some(1_170_000), "75%");
        assert_eq!(instruction_fee_for(12_400_000, "1_4"), Some(1_326_000), "85%");
        assert_eq!(instruction_fee_for(12_400_000, "1_9"), None);
    }
}
