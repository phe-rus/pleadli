/** The wording of a sheet, as a reader would type it out: what the code vouches for. */
export function sheetWording(sheet: HTMLElement) {
  const body = sheet.querySelector<HTMLElement>('[data-paper-body]') ?? sheet
  return body.innerText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Prints only this sheet. The system's print window also offers saving as PDF. */
export function printSheet(sheet: HTMLElement) {
  return new Promise<void>((resolve) => {
    sheet.setAttribute('data-paper-printing', '')
    document.body.classList.add('pleadli-printing')
    const done = () => {
      sheet.removeAttribute('data-paper-printing')
      document.body.classList.remove('pleadli-printing')
      window.removeEventListener('afterprint', done)
      resolve()
    }
    window.addEventListener('afterprint', done)
    window.print()
    // Some webviews never fire afterprint; print() has returned by now.
    setTimeout(done, 1500)
  })
}

/** The sheet as a Word file: Word opens a web page saved as .doc as an ordinary document. */
export function wordFile(sheet: HTMLElement, title: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<style>@page { size: 21cm 29.7cm; margin: 2cm 1.8cm; } body { font-family: 'Times New Roman', serif; font-size: 12pt; } h1 { font-size: 13pt; text-align: center; text-transform: uppercase; } header { text-align: center; font-weight: bold; text-transform: uppercase; } svg { width: 2.5cm; height: 2.5cm; }</style>
</head><body>${sheet.innerHTML}</body></html>`
  return new TextEncoder().encode(html)
}

export function safeFileName(title: string) {
  return title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'paper'
}

/** Waits until what was just set has painted. Frames stop in a hidden or minimised window, so a timer backs them up. */
export function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    setTimeout(resolve, 150)
  })
}
