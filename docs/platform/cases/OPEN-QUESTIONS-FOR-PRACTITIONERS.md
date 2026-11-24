# Open questions for a practitioner

Written 2026-11-24 from the case runs in this folder. Every case was run with fictional names. The procedure behind each case is from general knowledge and has not been checked by anyone who does this work. Below, each question says what the app does today on the strength of an assumption, so the answer shows what to keep and what to change.

## Police (a station officer or an advocate who attends stations)

1. Must the station record that a person in custody asked for a lawyer, and where? The app now records who was asked for (own advocate, legal aid, duty counsel, declined, not yet asked) and the name, shown on the custody list and the custody paper. Nothing is sent to anyone.
2. Is duty counsel a real option at a station, or only at court? The app offers it as a choice.
3. Should the lawyer status go into the referral to the DPP? It does not today.
4. While the DPP has a file out for more investigation, what happens to the suspect's police bond and the time limits? The app does not change any clock when a file is returned.
5. How long does the police have to answer the DPP's directions? The app sets no limit.

## DPP (a state attorney)

6. Does the DPP formally return a file with written directions, and in what form? The app sends the directions as plain words, and a resubmission is tied to the original file.
7. After a sanction, which stage is the file in? The app now moves a sanctioned file to "prepare". Declines, returns and other decisions leave the stage as it was, because concluding needs an outcome. What should each decision do to the stage?
8. Is a charging review started by the person using the app, or can it be started for a colleague? The app names the starter from the profile and the decision from what is typed.

## Courts (a registrar or magistrate)

9. When is the court number given: at registration of the charge sheet, or at the first appearance?
10. Is bail for a simple theft decided at first appearance with no written application?
11. Which court decides bail for aggravated robbery, and on what application? A bail application in a magistrate's form was returned in the case run, with the reason that it belongs in the High Court.
12. Can the court order the prisons to explain a failure to produce a prisoner? Not built.
13. Is civil work in scope for Courts? Courts has only criminal cases today (decision D4). A civil suit has no plaintiff, defendant or plaint in the app. This is a product decision as well as a procedure question.

## Lawyers (an advocate)

14. How does an advocate learn the court number and a refusal in practice: from the clerk, in court, in writing? The app shows the court's record of the sitting and the order's wording, sent from the court.
15. After a refusal of bail, what is the next step and its time limit: a fresh application on changed circumstances, or an appeal? The app starts no deadline after a refusal.
16. A reply to the defence and a defence to a counterclaim are separate filings under separate rules (CPR O.8 r.18(1) and r.11(1)). The app closes both with one "reply filed" event. Should they be recorded separately?
17. The app counts civil deadlines from the Civil Procedure Rules, the Limitation Act and the Court of Appeal Rules as written into it (for example 15 days to reply to a defence, 28 days for summons for directions). Are those the periods in use, including the 2019 amendment?

## Prisons (an officer in charge)

18. Does a prison receive a remand warrant before it holds the person, and what does it do when the name does not match? In the run the prison returned the order with the reason "no person of this name is held here", and the court saw that reason.
19. On the day a prisoner is not produced, who tells the court and the advocate, and in what form? The app has the prison report it to the court, and the court records the adjournment with the prisons as the responsible party and tells the firm.

## What I need back

For each question: the answer, and whether the app's current behaviour is right, wrong, or right only in some courts or districts. Answers that depend on the country (Uganda, Kenya, DR Congo) should say which.
