# Legal rules pack (Police)

The legal rules the app applies are data, not code, so they can be corrected and improved without a
new release. Added 2026-11-18.

## What a rule is
One entry in a country's pack, with:
- `id`, `title`, `kind` (`offence_list`, `number`, `guidance`) and its content (`terms`, `exceptions`, `value`, `text`)
- `citation`: the law it comes from, or null
- `status`: `draft` (the team's own working reading), `sourced` (matches a primary source, citation required) or `reviewed` (a named person checked it on a date, citation required)
- `reviewedBy`, `reviewedOn`, and a plain `note`

A pack with a `reviewed` rule that names no reviewer, or a `sourced` or `reviewed` rule with no citation, is refused.

## Where the rules are
- Starting pack: `apps/police/src-tauri/rules/uganda.json`, compiled in and loaded into the `rule_packs` table at startup.
- Every version ever loaded stays in `rule_packs`. The highest version for the country is in force.
- Settings > Legal rules shows the pack, each rule's status and citation, and (administrators only) "Choose a file" to load a newer pack.
- A newer pack must have a higher `version` than the one in force.

## Rules in force today (all `draft`, none reviewed by a legal officer)
| Rule | Drives |
|------|--------|
| `bond.not_police_bailable` | Refuses a police bond for those offences; the refusal shows the rule's text and "awaiting legal review" |
| `juvenile.age` (18) | The "Juvenile" chip on a person and the notice when booking them in |
| `juvenile.custody_guidance` | The guidance text in that notice |

## Still in code, to move into the pack
The 48-hour custody limit (`custodyCompliance`), referral destinations, and case statuses are still fixed in the app.

## How to improve a rule
A legal officer edits the JSON (adds the citation, their name and date, sets `status`), raises `version`, and an administrator loads it. Later: the same pack pushed from Pleadli Cloud to every station.

Other countries: add `kenya.json` and `drc.json` the same way; Police uses `UG` for now (`DEFAULT_COUNTRY`).
