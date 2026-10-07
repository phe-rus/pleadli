# Real case: Uganda v Kibuuka Joseph

Used as the reference case for the files-first rework (docs/platform/FILES-FIRST.md), so decisions rest on what a real file contains, not on guesses.

- **Judgment:** Uganda v Kibuuka (Criminal Session Case 72 of 2022) [2025] UGHC 121, High Court at Hoima, Byaruhanga Jesse Rugyema J, 27 February 2025. Public on ULII: https://ulii.org/en/akn/ug/judgment/ughc/2025/121/eng@2025-02-27 (scanned PDF, 10 pages; source file on media.ulii.org).
- Read in full on 2026-10-04. Names below are as published in the judgment.

## 1. One case, three numbers

| Stage | Number on the paper | Holder |
|---|---|---|
| Police | KD CRB 021/2019 (Kagadi station) | Uganda Police Force |
| Committal | Kagadi Criminal Case No. 69/2019 | Chief Magistrate's Court, Kagadi |
| Trial | H.C. Criminal Session Case No. 0072 of 2022 | High Court, Hoima |

The judgment's caption carries all three ("Arising from Kagadi Criminal Case No.69/2019; KD CRB 021/2019"). Every Pleadli paper about a case should print the numbers it arises from in the same way: the court caption is the real-world proof of "one case, institution-owned records".

## 2. The facts in brief

On 5 January 2019 at Kamusegu Trading Centre, Karambi Village, Kagadi District, the accused shared a glass of waragi with the deceased, Kyarikora Wilberforce, and a witness; the deceased collapsed and died; post-mortem: organophosphate poisoning. Motive: the accused had eloped with the deceased's wife. Arrested the same day as he prepared to flee. Indicted for murder, c/ss 188 and 189 Penal Code Act Cap. 120. Pleaded not guilty. Convicted 27 February 2025; 30 years, less 6 years 2 months on remand: 23 years 10 months. Right of appeal explained.

## 3. The papers this case actually turned on

| Paper | In the judgment as | Made by | Pleadli app that produces or receives it |
|---|---|---|---|
| Police case file (CRB) | KD CRB 021/2019 | Police | Police makes it, DPP receives it |
| Witness statement, deceased's brother | PW1 Katungwensi Josephat | Police | Police, DPP |
| Witness statement, eye witness | PW2 Hannah (Barihira) Ngirengyezi | Police | Police, DPP |
| Investigating officer's statement | PW3 D/Sgt Tena Malco | Police | Police, DPP |
| Post-mortem report | P. Exh. 1, admitted under s.66 TIA (not disputed, doctor not called) | Medical officer, through Police | Police, DPP, Courts (exhibit) |
| Indictment | "indicted with the offence of Murder c/ss 188 & 189 PCA" | DPP | DPP (output), Courts (receives) |
| Summary of the case | the prosecution case, paras [2] to [7] | DPP | DPP (output) |
| Committal record | Kagadi Criminal Case No. 69/2019 | Magistrate's court | Courts |
| Record of proceedings | coram, plea, evidence, unsworn statement, allocutus, sentence | Court | Courts (output) |
| Judgment and sentence | 6 + 4 pages | Court | Courts (output); Lawyers and DPP receive |
| Warrant / commitment on conviction | implied by sentence | Court | Courts (output), Prisons (receives) |
| Remand record | 6 years 2 months on remand | Prisons | Prisons (output), Courts (deducts it) |

## 4. What this means for the apps (decisions, not guesses)

1. **DPP's output is two papers first: the indictment and the summary of the case.** Both are written from the statements and the post-mortem. DPP must produce them in minutes from what it already holds, as printable, verifiable A4 papers. Every other DPP screen serves those two papers or the decision to make them.
2. **Statements are papers, not fields.** The court relied on who said what (PW1, PW2, PW3). The statement should show as the statement (heading, maker, date, body, signature lines), with its witness number once listed (PW1...), and the scan beside it when Police sent one.
3. **Exhibits carry the court's number.** "P. Exh. 1" is how the post-mortem is known from trial onward. An exhibit paper needs its exhibit number and, where it applies, the s.66 TIA admission.
4. **The caption pattern is shared.** Republic of Uganda / court / case number / "arising from" numbers / Uganda versus accused. Courts, DPP and Lawyers papers should all print it the same way (DPP's charge sheet template already has the caption part).
5. **Remand is counted and deducted.** 6 years 2 months on remand was deducted from 30 years (Art. 23(8) Constitution). The 180-day limit in the client's CTMS brief applies only before committal (Art. 23(6)(c)); this accused was on remand for six years lawfully after committal. The Courts remand tracker must stop the mandatory-bail clock at committal and keep counting days for the sentence deduction.
6. **The court record has a fixed shape.** Date, coram (accused present, state counsel, defence counsel "holding brief for", clerk), what was said, the court's order, signature. This is the Courts "Record proceedings" paper the CTMS brief asks for.

## 5. How it is used

- The ten-page scanned judgment is the import test for Courts and Lawyers (a real scan, real layout).
- The DPP test file is built from this case: the three statements and the post-mortem as received papers, then the indictment and summary of the case produced and printed with verification codes.
- Fictional details added only where the judgment is silent (e.g., the exact wording of a statement) are marked as such in test data, never presented as the real record.
