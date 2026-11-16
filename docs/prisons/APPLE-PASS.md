# Prisons Apple pass

The same treatment DPP, Lawyers and Police had (see docs/platform/COMPLETE-DPP-LAWYERS.md "Apple pass"), in the Prisons' own words.

## Done (2026-10-08)

- **Shell**: ribbon and status bar removed. The left pillar is DPP's: window lights and the sidebar button in the title bar (`components/toolbar/{controls,sidebar-toggle}.tsx`), crest and prison name below, then the sidebar. Folding the sidebar moves the lights and the button into the centre header. Headers are 48px across all three columns.
- **Sidebar** (`features/workspace/navigator.tsx`): Search (with the platform shortcut, `lib/platform.ts`) and one "+" menu (`quick-actions.tsx`); Today (Estate at Head Office), Inbox with its unread count; **Prisoners** as smart folders with counts; **Work** (Movements, Legal, Visits, Requests); **Prison** (Reports, Officers); Pinned. Head Office: Network (Facilities, Reports) and Head Office (Officers). Footer: officer, the Head Office connection, Settings, Sign out. The old inbox-in-sidebar switch is gone; `/inbox` is its own page.
- **Prisoner folders** (`features/prisoners/folders.ts`): Everyone held, On remand, Past the bail limit (red count: remand beyond 60 or 180 days, Art. 23(6)), Convicted, Civil debtors, Papers missing, Released or moved (not counted). `/prisoners?view=<id>`; the page title and note are the folder's; one Prisoners tab that remembers its folder (`tab-identity.ts`, `useGo` in `tab-actions.ts`). The UUID column is gone (the prisoner number identifies).
- **Centre header**: tabs, back/forward, the assistant (sparkle), and on a prisoner's file only, the button for that person's details. The theme switch left the header (it is in Settings > Appearance).
- **One page width**: `.page` is 72rem everywhere; `page-narrow` and the per-page `--page-max` overrides are gone, as are the inbox's and Facilities' own widths.
- **Plain icons**: the tinted squares in the add-record panel and the Head Office connect card are plain muted icons.
- Dev: `?api=<port>` on the browser dev page points the tab at another node port (`lib/api.ts`), as Police has.
- Strings in en, sw, fr (`folder_*`, `shell_section_*`, `shell_new`, `shell_sign_out`, `shell_search_short`). Note fr.json holds only ~150 keys; the rest falls back to English.

## Next

- See it in the real window; check a narrow window.
- Today: the "Desktop alerts" switch belongs in Settings, not beside the one primary action; hide zero counters; calmer sections.
- Prisoner file: segmented control for its tabs, calm two-line summary, one primary action with the rest behind "···".
- Settings: DPP/Lawyers System Settings layout (plain-icon list, label-left rows).
- Empty states (icon, one sentence, one button) across Movements, Legal, Visits, Requests.
- French catalogue.
