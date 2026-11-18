# Police offline run (2026-11-18)

Method: Linux user and network namespace with only loopback, so any outside call fails at once. The app (debug build), Vite and tauri-driver ran inside it, with an isolated data folder (`PLEADLI_DATA_DIR`) and `PLEADLI_NO_SEED=1`. The real data folder was not touched.

## Worked with no network
- First-day set-up (station, administrator), sign in, sign out, sign in again after restart.
- People, incident, case (numbered in the Crime Record Book, `... CRB 1/2026`), arrest and custody, statement, exhibit, charge sheet, referral to the DPP.
- Medical record (PF3), restricted case, print library, whole-station Excel export.
- Everything created was still there after restarting the app.
- The window loaded resources only from localhost.
- Charge sheet as a real `.docx` and a real PDF (see below).

## Fixed during the run
- Save as Word wrote a web page renamed `.doc`; PDF existed only through the print window. `@pleadli/paper` now writes a real `.docx` and a real PDF itself (`packages/paper/src/files.ts`), with a Save as PDF button. Checked: zip and XML well-formed, Ghostscript reads the PDF and extracts the text. Not yet opened in Word. The button label is English only for now.

## Not done or not run
- Backup and restore (the route is under the Orchestra paths, not `/api/backup`; needs its own run).
- Attachments and scanned files, rules pack import, user-visible export through the save window.
- Whole-station exports are still refused to non-admins when restricted cases exist. Kept on purpose: filtering needs every linked record (incidents, people, statements) worked out from the hidden cases first, or it could leak.
- Sealed document vault and numbered issued documents, Cloudflare tunnel simplification, other apps' paper two-way and HQ side.
