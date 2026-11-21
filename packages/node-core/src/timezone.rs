//! One timezone implementation for all five applications.
//!
//! Rules this module exists to keep:
//!
//! * A moment is stored as a UTC instant (epoch milliseconds). That is the
//!   only authoritative form. It never changes when a zone is configured or
//!   changed.
//! * What a person reads (a screen, a PDF, a Word file, a Markdown record) is
//!   that instant shown in the *institution's* configured IANA zone with the
//!   UTC offset written out. The computer's own timezone is never consulted,
//!   so a laptop set to the wrong zone prints the same legal time.
//! * A zone change is a new row in a history, effective from a moment. An old
//!   event is shown in the zone that was in force when it happened, so a
//!   change never silently re-times history or a document already finalized.
//! * Zone and clock are different things. A correct zone does not fix a wrong
//!   clock; `check_clock` warns about a clock that is plainly wrong using only
//!   what is on the computer (no network).

use chrono::{LocalResult, NaiveDateTime, Offset, TimeZone, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

/// The zones an institution can be set to. The Pleadli countries only; adding
/// a country means adding its zones here on purpose, with a source.
pub const SUPPORTED: &[(&str, &str)] = &[
    ("Africa/Kampala", "UG"),
    ("Africa/Nairobi", "KE"),
    ("Africa/Kinshasa", "CD"),
    ("Africa/Lubumbashi", "CD"),
];

/// The zone a country starts with, when one zone covers the whole country.
/// DR Congo spans two (Kinshasa and Lubumbashi), so it has no default: the
/// institution must choose where it is.
pub fn default_for_country(country: &str) -> Option<&'static str> {
    match country.to_ascii_uppercase().as_str() {
        "UG" => Some("Africa/Kampala"),
        "KE" => Some("Africa/Nairobi"),
        _ => None,
    }
}

/// The zones a country's institution may pick from.
pub fn choices_for_country(country: &str) -> Vec<&'static str> {
    SUPPORTED.iter().filter(|(_, c)| c.eq_ignore_ascii_case(country)).map(|(id, _)| *id).collect()
}

/// Whether `id` is a zone Pleadli lets an institution use.
pub fn is_supported(id: &str) -> bool {
    SUPPORTED.iter().any(|(z, _)| *z == id)
}

/// A zone the institution may use, by IANA name.
pub fn parse(id: &str) -> Result<Tz, String> {
    if !is_supported(id) {
        return Err(format!("\"{id}\" is not a timezone this application can be set to."));
    }
    id.parse::<Tz>().map_err(|_| format!("\"{id}\" is not a known timezone."))
}

/// A zone for *reading* an already stored identifier (any valid IANA name),
/// so a record saved under a zone later removed from the choices still shows.
fn parse_stored(id: &str) -> Option<Tz> {
    id.parse::<Tz>().ok()
}

/// "+03:00" for the offset the zone had at that instant.
fn offset_text(tz: Tz, instant_ms: i64) -> Option<(String, chrono::DateTime<Tz>)> {
    let utc = Utc.timestamp_millis_opt(instant_ms).single()?;
    let local = utc.with_timezone(&tz);
    let secs = local.offset().fix().local_minus_utc();
    let sign = if secs < 0 { '-' } else { '+' };
    let secs = secs.abs();
    Some((format!("{sign}{:02}:{:02}", secs / 3600, (secs % 3600) / 60), local))
}

/// "2026-11-21 14:30 (UTC+03:00)". Empty when the instant is out of range or the zone unknown.
pub fn format_instant(instant_ms: i64, zone_id: &str) -> String {
    let Some(tz) = parse_stored(zone_id) else { return String::new() };
    match offset_text(tz, instant_ms) {
        Some((off, local)) => format!("{} (UTC{off})", local.format("%Y-%m-%d %H:%M")),
        None => String::new(),
    }
}

/// As `format_instant`, also naming the zone: "2026-11-21 14:30 (UTC+03:00, Africa/Kampala)".
/// For the line on a document that says when it was made and in which zone.
pub fn format_instant_with_zone(instant_ms: i64, zone_id: &str) -> String {
    let Some(tz) = parse_stored(zone_id) else { return String::new() };
    match offset_text(tz, instant_ms) {
        Some((off, local)) => format!("{} (UTC{off}, {zone_id})", local.format("%Y-%m-%d %H:%M")),
        None => String::new(),
    }
}

/// The calendar date of an instant in the zone ("2026-11-21"), for things dated by day.
pub fn local_date(instant_ms: i64, zone_id: &str) -> String {
    let Some(tz) = parse_stored(zone_id) else { return String::new() };
    Utc.timestamp_millis_opt(instant_ms).single().map(|u| u.with_timezone(&tz).format("%Y-%m-%d").to_string()).unwrap_or_default()
}

/// What a wall-clock time typed in the institution's zone means.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LocalTime {
    /// Exactly one instant.
    Unique { instant_ms: i64 },
    /// The clock showed this time twice (a clock put back). The person must say which.
    Ambiguous { earlier_ms: i64, later_ms: i64 },
    /// The clock never showed this time (a clock put forward).
    Nonexistent,
}

/// Turns a wall-clock time written in the zone into instants, naming the
/// two cases a naive conversion gets wrong: a time that happened twice and a
/// time that never happened. Never picks silently.
pub fn resolve_local(local: NaiveDateTime, zone_id: &str) -> Result<LocalTime, String> {
    let tz = parse_stored(zone_id).ok_or_else(|| format!("\"{zone_id}\" is not a known timezone."))?;
    Ok(match tz.from_local_datetime(&local) {
        LocalResult::Single(dt) => LocalTime::Unique { instant_ms: dt.timestamp_millis() },
        LocalResult::Ambiguous(a, b) => LocalTime::Ambiguous { earlier_ms: a.timestamp_millis(), later_ms: b.timestamp_millis() },
        LocalResult::None => LocalTime::Nonexistent,
    })
}

/// One entry of an institution's zone history: from `effective_from_ms`, `zone_id` is in force.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneChange {
    pub effective_from_ms: i64,
    pub zone_id: String,
}

/// The zone in force at an instant. `history` need not be sorted. An instant
/// before the first entry uses the first entry (the zone the institution
/// started with), so nothing is ever shown without a zone.
pub fn zone_at<'a>(history: &'a [ZoneChange], instant_ms: i64) -> Option<&'a str> {
    let mut sorted: Vec<&ZoneChange> = history.iter().collect();
    sorted.sort_by_key(|c| c.effective_from_ms);
    sorted
        .iter()
        .rev()
        .find(|c| c.effective_from_ms <= instant_ms)
        .or_else(|| sorted.first())
        .map(|c| c.zone_id.as_str())
}

/// An event shown in the zone that was in force when it happened.
pub fn format_historical(history: &[ZoneChange], instant_ms: i64) -> String {
    zone_at(history, instant_ms).map(|z| format_instant(instant_ms, z)).unwrap_or_default()
}

// ---------- clock integrity ----------

/// The earliest date a correct clock can show now: before this, the clock is
/// reset or its battery has failed. Moved forward with each release.
pub const CLOCK_FLOOR_MS: i64 = 1_767_225_600_000; // 2026-01-01T00:00:00Z

/// How far behind the newest recorded event the clock may be before it is called wrong (5 minutes covers ordinary drift between records).
pub const BEHIND_TOLERANCE_MS: i64 = 5 * 60 * 1000;

/// How far ahead of anything recorded the clock may be before it is called suspicious (400 days: an
/// installation can sit idle for a year).
pub const AHEAD_LIMIT_MS: i64 = 400 * 24 * 3600 * 1000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ClockWarning {
    /// Earlier than the date this version was made: the clock was reset.
    BeforeRelease,
    /// Earlier than a record already saved: the clock has gone backwards.
    BehindRecords { behind_ms: i64 },
    /// Far later than anything recorded.
    FarAhead,
}

/// Judges the clock from what is on the computer alone: the date this version was made and the
/// newest record saved. It cannot prove a clock right, only catch one that is plainly wrong. No network.
pub fn check_clock(now_ms: i64, newest_record_ms: Option<i64>) -> Vec<ClockWarning> {
    let mut out = Vec::new();
    if now_ms < CLOCK_FLOOR_MS {
        out.push(ClockWarning::BeforeRelease);
    }
    if let Some(newest) = newest_record_ms {
        if newest - now_ms > BEHIND_TOLERANCE_MS {
            out.push(ClockWarning::BehindRecords { behind_ms: newest - now_ms });
        }
        if now_ms - newest > AHEAD_LIMIT_MS {
            out.push(ClockWarning::FarAhead);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    // 2026-11-21T11:30:00Z
    const T: i64 = 1_795_260_600_000;

    #[test]
    fn uganda_and_kenya_show_east_africa_time() {
        assert_eq!(format_instant(T, "Africa/Kampala"), "2026-11-21 14:30 (UTC+03:00)");
        assert_eq!(format_instant(T, "Africa/Nairobi"), "2026-11-21 14:30 (UTC+03:00)");
    }

    #[test]
    fn dr_congo_has_two_zones_one_hour_apart() {
        assert_eq!(format_instant(T, "Africa/Kinshasa"), "2026-11-21 12:30 (UTC+01:00)");
        assert_eq!(format_instant(T, "Africa/Lubumbashi"), "2026-11-21 13:30 (UTC+02:00)");
    }

    #[test]
    fn country_defaults_follow_the_rules() {
        assert_eq!(default_for_country("UG"), Some("Africa/Kampala"));
        assert_eq!(default_for_country("ke"), Some("Africa/Nairobi"));
        assert_eq!(default_for_country("CD"), None, "DR Congo must choose");
        assert_eq!(choices_for_country("CD"), vec!["Africa/Kinshasa", "Africa/Lubumbashi"]);
    }

    #[test]
    fn only_listed_zones_can_be_set() {
        assert!(parse("Africa/Kampala").is_ok());
        assert!(parse("Europe/London").is_err());
        assert!(parse("Mars/Olympus").is_err());
        assert!(parse("").is_err());
    }

    /// The computer's own zone is never read, so the same event prints the same
    /// whatever TZ the process runs under.
    #[test]
    fn the_computers_timezone_makes_no_difference() {
        let expected = format_instant(T, "Africa/Kampala");
        for tz in ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati", "Africa/Kinshasa"] {
            // SAFETY: tests in this module do not read TZ-dependent APIs; the value is only set to prove it is ignored.
            unsafe { std::env::set_var("TZ", tz) };
            assert_eq!(format_instant(T, "Africa/Kampala"), expected, "TZ={tz}");
            assert_eq!(format_instant_with_zone(T, "Africa/Kampala"), "2026-11-21 14:30 (UTC+03:00, Africa/Kampala)");
            assert_eq!(local_date(T, "Africa/Kampala"), "2026-11-21");
        }
        unsafe { std::env::remove_var("TZ") };
    }

    #[test]
    fn the_date_changes_at_the_institutions_midnight_not_utc() {
        // 2026-11-21T22:30:00Z is already 22 November in Kampala.
        let late = T + 11 * 3600 * 1000;
        assert_eq!(local_date(late, "Africa/Kampala"), "2026-11-22");
        assert_eq!(local_date(late, "Africa/Kinshasa"), "2026-11-21");
    }

    #[test]
    fn a_history_keeps_old_events_in_the_zone_they_happened_in() {
        let history = vec![
            ZoneChange { effective_from_ms: 0, zone_id: "Africa/Kinshasa".into() },
            ZoneChange { effective_from_ms: T, zone_id: "Africa/Lubumbashi".into() },
        ];
        // Before the change: still Kinshasa. After: Lubumbashi.
        assert_eq!(format_historical(&history, T - 3_600_000), "2026-11-21 11:30 (UTC+01:00)");
        assert_eq!(format_historical(&history, T), "2026-11-21 13:30 (UTC+02:00)");
        // The same instant, read later, is unchanged by a still later change.
        let mut later = history.clone();
        later.push(ZoneChange { effective_from_ms: T + 10_000_000, zone_id: "Africa/Kinshasa".into() });
        assert_eq!(format_historical(&later, T - 3_600_000), format_historical(&history, T - 3_600_000));
        // Before the very first entry: the first zone, never blank.
        assert_eq!(zone_at(&history, -5), Some("Africa/Kinshasa"));
        assert_eq!(zone_at(&[], 5), None);
    }

    #[test]
    fn a_stored_zone_no_longer_offered_still_displays() {
        assert_eq!(format_instant(T, "Africa/Dar_es_Salaam"), "2026-11-21 14:30 (UTC+03:00)");
        assert_eq!(format_instant(T, "Not/AZone"), "");
    }

    /// No Pleadli zone observes daylight saving today, so the transition cases are proven with
    /// a zone that does, through the same function an institution's zone goes through.
    #[test]
    fn a_clock_put_back_is_ambiguous_and_one_put_forward_does_not_exist() {
        let d = |m, day, h, min| NaiveDate::from_ymd_opt(2026, m, day).unwrap().and_hms_opt(h, min, 0).unwrap();
        // Europe/Paris, 2026: clocks go forward 29 March 02:00 -> 03:00, back 25 October 03:00 -> 02:00.
        assert_eq!(resolve_local(d(3, 29, 2, 30), "Europe/Paris").unwrap(), LocalTime::Nonexistent);
        match resolve_local(d(10, 25, 2, 30), "Europe/Paris").unwrap() {
            LocalTime::Ambiguous { earlier_ms, later_ms } => assert_eq!(later_ms - earlier_ms, 3_600_000),
            other => panic!("{other:?}"),
        }
        assert!(matches!(resolve_local(d(6, 1, 12, 0), "Europe/Paris").unwrap(), LocalTime::Unique { .. }));
        // An East African wall time is never ambiguous.
        assert_eq!(
            resolve_local(d(11, 21, 14, 30), "Africa/Kampala").unwrap(),
            LocalTime::Unique { instant_ms: T }
        );
    }

    #[test]
    fn an_offset_during_daylight_saving_is_named_correctly() {
        // 2026-07-01T10:00:00Z in Paris is UTC+02:00.
        assert_eq!(format_instant(1_782_900_000_000, "Europe/Paris"), "2026-07-01 12:00 (UTC+02:00)");
    }

    #[test]
    fn clock_warnings_need_no_network() {
        assert!(check_clock(T, Some(T - 1000)).is_empty());
        assert!(check_clock(T, None).is_empty());
        // Reset to 2000.
        assert_eq!(check_clock(946_684_800_000, None), vec![ClockWarning::BeforeRelease]);
        // A record saved an hour "in the future": the clock went back.
        assert_eq!(check_clock(T, Some(T + 3_600_000)), vec![ClockWarning::BehindRecords { behind_ms: 3_600_000 }]);
        // Within ordinary drift: no warning.
        assert!(check_clock(T, Some(T + 60_000)).is_empty());
        // A clock years ahead of the last record.
        assert_eq!(check_clock(T + 500 * 24 * 3_600_000, Some(T)), vec![ClockWarning::FarAhead]);
    }
}

// ---------- the institution's configured zone, kept in its database ----------

/// The table and its guards, for one of an application's own migrations. Append-only: a change of
/// zone is a new row, so history can be read back and nothing is rewritten.
pub const TABLE_SQL: &str = "CREATE TABLE institution_timezone (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id TEXT NOT NULL,
    country TEXT NOT NULL,
    effective_from INTEGER NOT NULL,
    set_by TEXT,
    set_at INTEGER NOT NULL,
    reason TEXT
);

CREATE TRIGGER institution_timezone_no_update BEFORE UPDATE ON institution_timezone
BEGIN SELECT RAISE(ABORT, 'A timezone change is never edited. Make a new change.'); END;

CREATE TRIGGER institution_timezone_no_delete BEFORE DELETE ON institution_timezone
BEGIN SELECT RAISE(ABORT, 'A timezone change is never deleted.'); END;";

/// The full history, oldest first. Empty until the institution has chosen a zone.
pub async fn history(pool: &sqlx::SqlitePool) -> Result<Vec<ZoneChange>, sqlx::Error> {
    let rows: Vec<(i64, String)> = sqlx::query_as("SELECT effective_from, zone_id FROM institution_timezone ORDER BY seq").fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(effective_from_ms, zone_id)| ZoneChange { effective_from_ms, zone_id }).collect())
}

/// The zone in force now, or the country's default when none was ever chosen. `None` when none was
/// chosen and the country has no single zone (DR Congo): the caller must make the institution choose.
pub async fn current(pool: &sqlx::SqlitePool, country: &str, now_ms: i64) -> Result<Option<String>, sqlx::Error> {
    let h = history(pool).await?;
    Ok(zone_at(&h, now_ms).map(str::to_string).or_else(|| default_for_country(country).map(str::to_string)))
}

/// Sets the institution's zone from now on. Refuses a zone outside the country's choices. Writes in
/// the caller's transaction so the change and the application's own audit record commit together. A repeat of the
/// zone already in force changes nothing.
pub async fn set_zone(
    conn: &mut sqlx::SqliteConnection,
    country: &str,
    zone_id: &str,
    actor: &str,
    reason: Option<&str>,
    now_ms: i64,
) -> Result<bool, String> {
    parse(zone_id)?;
    if !choices_for_country(country).contains(&zone_id) {
        return Err(format!("\"{zone_id}\" is not a timezone for this country."));
    }
    let rows: Vec<(i64, String)> = sqlx::query_as("SELECT effective_from, zone_id FROM institution_timezone ORDER BY seq")
        .fetch_all(&mut *conn)
        .await
        .map_err(|_| "The timezone could not be read.".to_string())?;
    let history: Vec<ZoneChange> = rows.into_iter().map(|(effective_from_ms, zone_id)| ZoneChange { effective_from_ms, zone_id }).collect();
    let in_force = zone_at(&history, now_ms).map(str::to_string).or_else(|| default_for_country(country).map(str::to_string));
    if in_force.as_deref() == Some(zone_id) && !history.is_empty() {
        return Ok(false);
    }
    // A new zone applies from now, and never from before an earlier change: a clock set back must not
    // back-date this one over events already shown in the zone then in force.
    let now_ms = history.iter().map(|c| c.effective_from_ms).max().map_or(now_ms, |latest| now_ms.max(latest.saturating_add(1)));
    sqlx::query("INSERT INTO institution_timezone (zone_id, country, effective_from, set_by, set_at, reason) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(zone_id)
        .bind(country.to_ascii_uppercase())
        .bind(now_ms)
        .bind(actor)
        .bind(now_ms)
        .bind(reason)
        .execute(&mut *conn)
        .await
        .map_err(|_| "The timezone could not be saved.".to_string())?;
    Ok(true)
}

#[cfg(test)]
mod store_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(TABLE_SQL).execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn uganda_starts_on_kampala_and_dr_congo_must_choose() {
        let p = pool().await;
        assert_eq!(current(&p, "UG", 5).await.unwrap().as_deref(), Some("Africa/Kampala"));
        assert_eq!(current(&p, "CD", 5).await.unwrap(), None);
        p.close().await;
    }

    #[tokio::test]
    async fn a_change_applies_from_now_and_history_is_kept() {
        let p = pool().await;
        let mut c = p.acquire().await.unwrap();
        assert!(set_zone(&mut c, "CD", "Africa/Kinshasa", "admin", None, 1_000).await.unwrap());
        assert!(set_zone(&mut c, "CD", "Africa/Lubumbashi", "admin", Some("station moved"), 5_000).await.unwrap());
        // Repeating the zone in force writes nothing.
        assert!(!set_zone(&mut c, "CD", "Africa/Lubumbashi", "admin", None, 6_000).await.unwrap());
        drop(c);
        let h = history(&p).await.unwrap();
        assert_eq!(h.len(), 2);
        assert_eq!(zone_at(&h, 2_000), Some("Africa/Kinshasa"));
        assert_eq!(zone_at(&h, 5_000), Some("Africa/Lubumbashi"));
        p.close().await;
    }

    #[tokio::test]
    async fn a_zone_from_another_country_is_refused() {
        let p = pool().await;
        let mut c = p.acquire().await.unwrap();
        assert!(set_zone(&mut c, "UG", "Africa/Kinshasa", "admin", None, 1).await.is_err());
        assert!(set_zone(&mut c, "UG", "Europe/London", "admin", None, 1).await.is_err());
        drop(c);
        assert!(history(&p).await.unwrap().is_empty());
        p.close().await;
    }

    #[tokio::test]
    async fn the_history_cannot_be_edited_or_deleted() {
        let p = pool().await;
        let mut c = p.acquire().await.unwrap();
        set_zone(&mut c, "UG", "Africa/Kampala", "admin", None, 1).await.unwrap();
        drop(c);
        assert!(sqlx::query("UPDATE institution_timezone SET zone_id = 'Africa/Nairobi'").execute(&p).await.is_err());
        assert!(sqlx::query("DELETE FROM institution_timezone").execute(&p).await.is_err());
        p.close().await;
    }
}

// ---------- the installed zone: what every document and screen of this install reads ----------

// In a running app the zone is one process-wide fact. In a test build (the `test-keys` feature, which apps turn on
// for tests only) it is per thread, so tests that set a zone cannot disturb tests running beside them, and a test
// that never sets one reads Kampala, as the old fixed East Africa offset did.
#[cfg(not(feature = "test-keys"))]
static INSTALLED: std::sync::RwLock<Vec<ZoneChange>> = std::sync::RwLock::new(Vec::new());

#[cfg(feature = "test-keys")]
thread_local! {
    static INSTALLED_HERE: std::cell::RefCell<Vec<ZoneChange>> = std::cell::RefCell::new(vec![ZoneChange { effective_from_ms: i64::MIN, zone_id: "Africa/Kampala".to_string() }]);
}

fn with_installed<R>(f: impl FnOnce(&[ZoneChange]) -> R) -> R {
    #[cfg(not(feature = "test-keys"))]
    {
        // A panic elsewhere while the lock was held must not freeze the zone or fall back to UTC: the history is
        // replaced whole, so the data behind a poisoned lock is still whole.
        let h = INSTALLED.read().unwrap_or_else(|e| e.into_inner());
        f(&h)
    }
    #[cfg(feature = "test-keys")]
    {
        INSTALLED_HERE.with(|h| f(&h.borrow()))
    }
}

/// Replaces the zone history this install displays with. Called at start and after a change.
pub fn install(history: Vec<ZoneChange>) {
    #[cfg(not(feature = "test-keys"))]
    {
        let mut w = INSTALLED.write().unwrap_or_else(|e| e.into_inner());
        *w = history;
    }
    #[cfg(feature = "test-keys")]
    INSTALLED_HERE.with(|h| *h.borrow_mut() = history);
}

/// Reads the institution's zone history from its database and installs it. With no row yet, the country's own zone
/// (Uganda, Kenya) applies from the beginning of time; DR Congo, which must choose, stays empty until it does.
pub async fn load_and_install(pool: &sqlx::SqlitePool, country: &str) -> Result<(), sqlx::Error> {
    // A load that began later read a database at least as new, so when two overlap the later one wins and a slow,
    // older read can never install over it.
    static LAST_STARTED: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    static LAST_INSTALLED: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let ticket = LAST_STARTED.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let mut h = history(pool).await?;
    if h.is_empty() {
        if let Some(z) = default_for_country(country) {
            h.push(ZoneChange { effective_from_ms: i64::MIN, zone_id: z.to_string() });
        }
    }
    // Test builds keep the zone per thread, so tickets taken on other threads must not suppress this install.
    let newest = cfg!(feature = "test-keys") || LAST_INSTALLED.fetch_max(ticket, std::sync::atomic::Ordering::SeqCst) < ticket;
    if newest {
        install(h);
    }
    Ok(())
}

/// Whether the institution has a zone (set or defaulted). False means every time prints in UTC, offset shown, until one is chosen.
pub fn is_configured() -> bool {
    with_installed(|h| !h.is_empty())
}

/// The zone in force now, if any.
pub fn current_zone() -> Option<String> {
    with_installed(|h| zone_at(h, Utc::now().timestamp_millis()).map(str::to_string))
}

/// An event's time for people to read, in the zone in force when it happened.
/// Without a configured zone it reads as UTC with the offset spelled out, never as the computer's local time.
pub fn show(instant_ms: i64) -> String {
    let text = with_installed(|h| format_historical(h, instant_ms));
    if text.is_empty() {
        format_instant(instant_ms, "UTC")
    } else {
        text
    }
}

/// "Now" with the zone named, for the line on a document that says when it was made.
pub fn stamp_now() -> String {
    let now = Utc::now().timestamp_millis();
    let zone = with_installed(|h| zone_at(h, now).map(str::to_string)).unwrap_or_else(|| "UTC".to_string());
    format_instant_with_zone(now, &zone)
}

#[cfg(test)]
mod installed_tests {
    use super::*;

    /// One test owns the process-wide cache, so tests running side by side cannot disturb each other.
    #[test]
    fn the_installed_zone_drives_every_display() {
        const T: i64 = 1_795_260_600_000;
        install(vec![]);
        assert!(!is_configured());
        assert_eq!(show(T), "2026-11-21 11:30 (UTC+00:00)", "unconfigured reads as UTC, never the computer's zone");
        install(vec![ZoneChange { effective_from_ms: i64::MIN, zone_id: "Africa/Kampala".into() }]);
        assert!(is_configured());
        assert_eq!(show(T), "2026-11-21 14:30 (UTC+03:00)");
        assert!(stamp_now().contains("(UTC+03:00, Africa/Kampala)"));
        assert_eq!(current_zone().as_deref(), Some("Africa/Kampala"));
        install(vec![]);
    }
}

// ---------- what an app's settings screen shows and does ----------

/// Everything a settings screen needs: the zone in force, the choices, the history and the clock check.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneStatus {
    pub country: String,
    /// The zone in force now; none until a country with several zones (DR Congo) is told which.
    pub zone_id: Option<String>,
    pub choices: Vec<String>,
    pub history: Vec<ZoneChange>,
    /// The time now in that zone, so a person can see whether it matches the wall clock.
    pub now_shown: String,
    pub clock_warnings: Vec<ClockWarning>,
}

/// `newest_record_ms` is the newest moment any record of the app was made (the app knows its own tables).
pub async fn status(pool: &sqlx::SqlitePool, country: &str, newest_record_ms: Option<i64>) -> Result<ZoneStatus, sqlx::Error> {
    let now = Utc::now().timestamp_millis();
    // Read from the database, not the cache, so the screen shows what is stored.
    let zone_id = current(pool, country, now).await?;
    Ok(ZoneStatus {
        choices: choices_for_country(country).into_iter().map(str::to_string).collect(),
        history: history(pool).await?,
        now_shown: show(now),
        clock_warnings: check_clock(now, newest_record_ms),
        country: country.to_ascii_uppercase(),
        zone_id,
    })
}

/// Changes the zone from now on and refreshes what this install displays. `record_audit` runs in the same
/// transaction (an app writes its own audit entry there), so the change and its audit record commit together or not at all.
pub async fn change<F>(pool: &sqlx::SqlitePool, country: &str, zone_id: &str, actor: &str, reason: Option<&str>, record_audit: F) -> Result<bool, String>
where
    F: for<'c> FnOnce(&'c mut sqlx::SqliteConnection) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'c>>,
{
    let mut tx = crate::db::begin_write(pool).await.map_err(|_| "The timezone could not be changed.".to_string())?;
    let changed = set_zone(&mut tx, country, zone_id, actor, reason, Utc::now().timestamp_millis()).await?;
    if changed {
        record_audit(&mut tx).await?;
    }
    tx.commit().await.map_err(|_| "The timezone could not be saved.".to_string())?;
    load_and_install(pool, country).await.map_err(|_| "The timezone was saved but could not be loaded.".to_string())?;
    Ok(changed)
}

/// The institution's UTC offset at an instant, for code that does calendar arithmetic (the year of a reference
/// number, the day a deadline falls on). UTC when no zone is set; never the computer's.
pub fn offset_at(instant_ms: i64) -> chrono::FixedOffset {
    let zone = with_installed(|h| zone_at(h, instant_ms).map(str::to_string));
    zone.and_then(|z| parse_stored(&z))
        .and_then(|tz| Utc.timestamp_millis_opt(instant_ms).single().map(|u| u.with_timezone(&tz).offset().fix()))
        .unwrap_or_else(|| chrono::FixedOffset::east_opt(0).expect("zero is a valid offset"))
}

#[cfg(test)]
mod backdating_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// A computer clock set backwards must not give a new zone an earlier start than a change already recorded,
    /// or events already shown in the old zone would be re-timed.
    #[tokio::test]
    async fn a_zone_change_is_never_dated_before_an_earlier_one() {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(TABLE_SQL).execute(&pool).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        assert!(set_zone(&mut conn, "CD", "Africa/Kinshasa", "a", None, 2_000_000).await.unwrap());
        // The clock was set back to 1_000_000 before the next change.
        assert!(set_zone(&mut conn, "CD", "Africa/Lubumbashi", "a", None, 1_000_000).await.unwrap());
        drop(conn);
        let h = history(&pool).await.unwrap();
        assert!(h[1].effective_from_ms > h[0].effective_from_ms, "the later change starts after the earlier one");
        assert_eq!(zone_at(&h, 1_500_000), Some("Africa/Kinshasa"), "an event before the later change keeps its zone");
    }
}
