/** Printing prints only the paper being printed, as A4, nothing of the app around it. */
export const PAPER_CSS = `
@media print {
  body.pleadli-printing * { visibility: hidden !important; }
  body.pleadli-printing [data-paper-printing], body.pleadli-printing [data-paper-printing] * { visibility: visible !important; }
  body.pleadli-printing [data-paper-printing] { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; min-height: 0 !important; }
  body.pleadli-printing [data-paper-tools] { display: none !important; }
}
`
