# Resume, 2026-11-19 late

Done and pushed today: Courts security setup (shared flow), DPP paper filing sheet, withdrawal (DPP to Courts, receipt back), bail release round trip, committal warrant (Courts sentence order to Prisons; Prisons records it as `committal_warrant` and the officer applies the sentence from its sentence screen; not yet run in real windows, unit round-trip only).

Release CI: Windows only, by decision (2026-11-19). `.github/workflows/release.yml` already covers dpp, lawyers, prisons, police, courts. Courts needs its first-release bootstrap box ticked. See docs/RELEASING.md.

Still open: Police and Prisons on the shared setup flow; Prisons reporting back to Courts; Lawyers filing to Courts and firm receipt carried back; paper-arrival entry for police files; paper warrants to Prisons; native Open/Save dialogs need a manual click-through; sw/fr wording not native-reviewed. Run log: docs/platform/real-cases/RUN-PLAN-2026-11-19.md.
