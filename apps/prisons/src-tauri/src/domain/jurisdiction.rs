//! Legal rules belong to a jurisdiction, not to the custody engine.
//! Uganda is the only operational pack. Congo (DRC), then Kenya require
//! their own verified laws, instruments, calendars and acceptance cases.
//! References below use the original Prisons Act, 2006 section numbering:
//! https://www.mia.go.ug/sites/default/files/resources/Prisons%20Act%20Uganda%202006.pdf
//! Constitutional remand thresholds: Article 23(6), as amended.

pub struct JurisdictionRules {
    pub id: &'static str,
    pub country: &'static str,
    pub remand_ordinary_days: i64,
    pub remand_high_court_days: i64,
    pub remission_min_months: i64,
    pub remission_divisor: i64,
    pub parole_min_years: i64,
    pub parole_window_months: i64,
    pub review_term_over_years: i64,
    pub review_cycle_years: i64,
    /// Prisons Act 2006 s.83 (Uganda): an entitlement discharge happens before noon. Another country's pack states its
    /// own rule, or none; the rule is never assumed.
    pub discharge_before_noon: bool,
}

pub const UGANDA: JurisdictionRules = JurisdictionRules {
    id: "ug",
    country: "Uganda",
    remand_ordinary_days: 60,
    remand_high_court_days: 180,
    remission_min_months: 1,
    remission_divisor: 3,
    parole_min_years: 3,
    parole_window_months: 6,
    review_term_over_years: 7,
    review_cycle_years: 4,
    discharge_before_noon: true,
};

impl JurisdictionRules {
    pub fn mandatory_bail_days(&self, high_court_only: bool) -> i64 {
        if high_court_only { self.remand_high_court_days } else { self.remand_ordinary_days }
    }
}

/// An unknown jurisdiction must never inherit Uganda's rules.
pub fn rules(id: &str) -> Option<&'static JurisdictionRules> {
    match id { "ug" => Some(&UGANDA), _ => None }
}


fn for_profile(profile: super::facility_profile::FacilityProfile) -> Result<&'static JurisdictionRules, sqlx::Error> {
    let pack = rules(&profile.jurisdiction).ok_or_else(|| sqlx::Error::Protocol(
        format!("Unsupported legal jurisdiction: {}. Uganda rules were not substituted.", profile.jurisdiction)
    ))?;
    if let Some(country) = profile.country.as_deref().filter(|value| !value.trim().is_empty()) {
        if !country.trim().eq_ignore_ascii_case(pack.country) {
            return Err(sqlx::Error::Protocol("The installation country does not match its legal jurisdiction.".into()));
        }
    }
    Ok(pack)
}

pub async fn for_pool(pool: &sqlx::SqlitePool) -> Result<&'static JurisdictionRules, sqlx::Error> {
    for_profile(super::facility_profile::get(pool).await?)
}

pub async fn for_conn(conn: &mut sqlx::SqliteConnection) -> Result<&'static JurisdictionRules, sqlx::Error> {
    for_profile(super::facility_profile::get_conn(conn).await?)
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_an_implemented_jurisdiction_supplies_rules() {
        assert_eq!(super::rules("ug").unwrap().country, "Uganda");
        for id in ["cd", "ke", "", "unknown"] { assert!(super::rules(id).is_none()); }
    }
}
