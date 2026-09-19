# Registers — first-class object type

Canonical definition of a register in the product model. Registers are the institution's statutory record of record — the thing a prison actually keeps in a "book".

## What a register is

A register is **a view over records**, printable in book form, with an identity of its own. It is not a separate data area: the ledger is the data; the register is the mandated presentation — page and line numbers, as-of logic, printable. Building a register must never mean duplicating records into a second store.

## The object type

Every register object has these parts (fields are the *register's*, its records are generic typed rows):

| Part | Meaning |
|---|---|
| identity | name, kind, statutory basis (citation), jurisdiction |
| purpose | what the book is for, who reads it |
| records | typed rows over real domain events (state: see below) |
| responsible role | who keeps it (e.g. the officer in charge, the gate) |
| retention | what supersession/archival means for it |
| audit | who wrote what, when (the node audit trail) |
| reads | which reports/submissions read from it |

Register **field schemas are mostly unknown** — the UHRC inspection names the set (admission, release, property, transfer-of-detainees, gate, exhibits, medical registers) but the content of each is unconfirmed (evidence `research/findings.md` §11.6). The vault rule: **do not invent fields.** A register is `designed` when its legal basis is cited; its record body stays generic typed rows until evidence exists.

## The named set (evidence-seeded)

Ugandan names (pack): admission, release, property and effects, transfer-of-detainees, gate, exhibits, medical. Act-named (s.110, s.111): Visiting Justices' Book, visitor's book. Police-named registers (lockup register, station diary) are excluded for prisons.

## Status

`product/status.md` F6.3: `designed` — this note is the design; no code exists. Registers become `in-progress` in the stage that implements them (stage 5 returns-and-paper and later). Register *views* over existing structured data are the honest near-term step before any register is promoted.