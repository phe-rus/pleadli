# AI — seam, not an assistant-in-the-cell

Canonical stance on AI in Pleadli Prisons. Deep detail: `ai/README`, `PLAN.md` stage 8.

## The shape

An **integration layer**, not a product feature. Pleadli Prisons does not ship a model inside the facility. It provides a seam so AI capabilities can arrive without a rewrite, and every AI output is attributable and reviewable.

## Boundaries (non-negotiable)

- AI **suggests, extracts, summarises, classifies, assists search** — it never **decides**. Guilt, custody, release, discipline, and any legal determination are human and official decisions.
- The model **never gets a raw database**. Tools call the same `/api/prisons/**` the UI uses, honouring the same permissions and audit.
- **Attribution**: every AI-assisted write is attributed like any other write (audit trail), and the human is the author of record.
- **Off by default.** No prisoner text leaves the machine unless the OIC has enabled a provider and scoped it. Default `disabled`.

## Providers and key modes

OpenAI, Anthropic, Google, local (offline). Key modes: institution-provided, user-provided, subscription, Pleadli-managed, disabled. Current app state: **not present**; the seam is stage 8 (`PLAN.md`).

## The distinction that keeps this honest

An AI **summary** of a file is an instrument of *assistance*. A **legal instrument** (`product/documents.md`) is an instrument of *legal effect*. The two never merge: AI output is provisional and reviewed; legal authority is verified, citation-bearing, and supersession-protected.