//! Calendar helpers. Uganda observes East Africa Time (UTC+3) all year with
//! no daylight saving, so legal dates and the s.83 before-noon rule are
//! computed against a fixed +03:00 offset, not the machine's zone.

use chrono::{DateTime, Datelike, FixedOffset, Months, NaiveDate, TimeZone, Timelike, Utc};

pub const DAY_MS: i64 = 86_400_000;

fn eat() -> FixedOffset {
    FixedOffset::east_opt(3 * 3600).expect("valid offset")
}

pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

pub fn eat_datetime(ms: i64) -> DateTime<FixedOffset> {
    eat().timestamp_millis_opt(ms).single().unwrap_or_else(|| eat().timestamp_millis_opt(0).unwrap())
}

pub fn eat_hour(ms: i64) -> u32 {
    eat_datetime(ms).hour()
}

fn date_to_ms(date: NaiveDate) -> i64 {
    let midnight = date.and_hms_opt(0, 0, 0).expect("midnight is valid");
    eat().from_local_datetime(&midnight).single().map(|d| d.timestamp_millis()).unwrap_or(0)
}

/// Midnight (EAT) at the start of the day containing `ms`.
pub fn start_of_day(ms: i64) -> i64 {
    date_to_ms(eat_datetime(ms).date_naive())
}

/// `ms` moved forward by whole calendar years, months and days, snapped to
/// midnight EAT. Month arithmetic clamps to the end of a shorter month.
pub fn add_calendar(ms: i64, years: i64, months: i64, days: i64) -> i64 {
    let date = eat_datetime(ms).date_naive();
    let total_months = years * 12 + months;
    let shifted = if total_months >= 0 {
        date.checked_add_months(Months::new(total_months as u32))
    } else {
        date.checked_sub_months(Months::new((-total_months) as u32))
    }
    .unwrap_or(date);
    let shifted = shifted + chrono::Duration::days(days);
    date_to_ms(shifted)
}

/// Whole calendar years between two instants, rounded down.
pub fn whole_years_between(from_ms: i64, to_ms: i64) -> i64 {
    if to_ms <= from_ms {
        return 0;
    }
    let from = eat_datetime(from_ms).date_naive();
    let to = eat_datetime(to_ms).date_naive();
    let mut years = (to.year() - from.year()) as i64;
    if (to.month(), to.day()) < (from.month(), from.day()) {
        years -= 1;
    }
    years.max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noon_rule_uses_east_africa_time() {
        // 2026-03-01 08:59 UTC is 11:59 EAT; 09:00 UTC is noon EAT.
        let before = Utc.with_ymd_and_hms(2026, 3, 1, 8, 59, 0).unwrap().timestamp_millis();
        let at = Utc.with_ymd_and_hms(2026, 3, 1, 9, 0, 0).unwrap().timestamp_millis();
        assert_eq!(eat_hour(before), 11);
        assert_eq!(eat_hour(at), 12);
    }

    #[test]
    fn calendar_addition_is_not_a_day_count() {
        let start = date_to_ms(NaiveDate::from_ymd_opt(2024, 2, 29).unwrap());
        let end = add_calendar(start, 1, 0, 0);
        assert_eq!(eat_datetime(end).date_naive(), NaiveDate::from_ymd_opt(2025, 2, 28).unwrap());
    }
}
