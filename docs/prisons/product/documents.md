# Documents — the object model

Canonical document model for the product ("documents first class" in `PRODUCT.md`). This is the deep module for `product/05` N and the spine's document side.

## Document classes (never conflate)

| Class | Has legal effect | Content source | Lifecycle |
|---|---|---|---|
| **Instrument** | Yes — establishes legal authority for custody (commitment, warrant, order, conviction, outcome) | external (court/authority) | receive, verify, supersede; states verified / pending / rejected / expired / superseded / missing |
| **Generated document** | No — carries/report on the record (admission, release order, s.118 list, transfer dossier, receipt, monthly return) | structured data in the node | build, review, sign/attest, print/export, dispatch |
| **Register** | No, but mandated | view over records (`product/registers.md`) | print, page/line, as-of |
| **Attachment/vault file** | No | arbitrary (scan/photo) | attached to a typed document or record, content-addressed, encrypted at rest (D14) |

## Rules

- An **instrument** is the only thing that changes legal custody. Its fields are editable only by supersession with a mandatory reason (P10, W18). AI output is never an instrument.
- **Generated documents** are derived, not authored: print comes from the spine, never from free text that drifts from the record.
- **Dispatch and receipt** of documents is tracked (F6.4): the transfer dossier and receipt are the working example; a general dispatch record is `designed`.

## Status

`product/status.md`: instruments `implemented` (node), generated documents `in-progress` (reports + dossier/receipt built; admission slip, release order, s.118 print `planned`), registers `designed`, vault attachments `in-progress` (encryption under D14).