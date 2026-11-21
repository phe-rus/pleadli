pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Stored timestamps are always UTC epoch milliseconds. What a person reads (exports, printed papers, the
/// Markdown vault) is the station's configured timezone with the offset written out. The computer's own
/// timezone is never used: see `pleadli_node_core::timezone`.
pub fn display_ms(millis: i64) -> String {
    pleadli_node_core::timezone::show(millis)
}

pub fn display_now() -> String {
    pleadli_node_core::timezone::stamp_now()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_names_the_offset() {
        let text = display_ms(1_700_000_000_000);
        assert!(text.contains("(UTC"), "{text}");
    }

    /// The acceptance check: one stored event, printed under several operating-system timezones, reads the same.
    #[test]
    fn the_same_event_prints_the_same_whatever_the_computers_timezone() {
        const EVENT: i64 = 1_795_260_600_000; // 2026-11-21T11:30:00Z
        for os_zone in ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati", "Europe/Paris"] {
            // SAFETY: only this test touches TZ, and it is read by nothing in the timezone code.
            unsafe { std::env::set_var("TZ", os_zone) };
            assert_eq!(display_ms(EVENT), "2026-11-21 14:30 (UTC+03:00)", "OS zone {os_zone}");
        }
        unsafe { std::env::remove_var("TZ") };
    }

    #[test]
    fn out_of_range_still_reads_as_something_or_nothing_never_panics() {
        let _ = display_ms(i64::MAX);
    }
}
