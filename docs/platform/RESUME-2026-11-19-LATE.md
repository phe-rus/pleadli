# Resume, 2026-11-19 late

Done and pushed today: Courts security setup (shared flow), DPP paper filing sheet, withdrawal (DPP to Courts, receipt back), bail release round trip, committal warrant (Courts sentence order to Prisons; Prisons records it as `committal_warrant` and the officer applies the sentence from its sentence screen; not yet run in real windows, unit round-trip only).

Release CI: Windows only, by decision (2026-11-19). `.github/workflows/release.yml` already covers dpp, lawyers, prisons, police, courts. Courts needs its first-release bootstrap box ticked. See docs/RELEASING.md.

Still open: Police and Prisons on the shared setup flow; Prisons reporting back to Courts; Lawyers filing to Courts and firm receipt carried back; paper-arrival entry for police files; paper warrants to Prisons; native Open/Save dialogs need a manual click-through; sw/fr wording not native-reviewed. Run log: docs/platform/real-cases/RUN-PLAN-2026-11-19.md.

## Later the same day
Built and pushed: prison reports back to the court (Prisons form, Courts stores as a claim), counsel files documents with the court (Lawyers send, Courts accepts or returns with a receipt), DPP inbox "A paper file arrived", committal recorded as the existing warrant of conviction kind. All unit round-trip tested, not yet run in real windows.
Not done on purpose: Police/Prisons setup parity, see docs/platform/SETUP-PARITY-2026-11-19.md (needs an owner decision on sign-in vocabulary).
Still open: real-window runs of the new flows, native Open/Save dialogs, sw/fr native review, receipts that change case status.
