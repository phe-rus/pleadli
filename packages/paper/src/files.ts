/**
 * Real Word (.docx) and PDF files for a sheet, made in the page with no
 * network and no library: the sheet is read into plain blocks (headings,
 * paragraphs, table rows) and written out as an Office Open XML package and
 * as a PDF. The verification code is text in both, so the file vouches for
 * itself the way the printed page does.
 */

type Run = { text: string; bold?: boolean }
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: Run[]; center: boolean }
  | { kind: 'para'; runs: Run[]; center: boolean; right: boolean; bullet?: boolean }
  | { kind: 'table'; rows: string[][] }
  /** Pieces that sit side by side on the sheet (Station left, Date right). No borders. */
  | { kind: 'columns'; cells: { text: string; right: boolean }[] }
  /** A picture on the sheet (the crest), as a JPEG on white. Width in points. */
  | { kind: 'image'; jpeg: Uint8Array; px: [number, number]; width: number; center: boolean }
  /** A line on the sheet: a signature line (short) or a divider (full width). */
  | { kind: 'rule'; short: boolean }

const BLOCK_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'SECTION', 'DIV', 'HEADER', 'FOOTER', 'UL', 'OL', 'ARTICLE'])

function runsOf(el: Element, inheritBold = false): Run[] {
  const out: Run[] = []
  const walk = (node: Node, bold: boolean) => {
    if (node.nodeType === 3) {
      const t = (node.textContent ?? '').replace(/\s+/g, ' ')
      if (t) out.push({ text: t, bold })
    } else if (node instanceof Element) {
      if (['SVG', 'svg', 'IMG', 'BUTTON', 'STYLE', 'SCRIPT'].includes(node.tagName)) return
      if (node.tagName === 'BR') return void out.push({ text: '\n', bold })
      const b = bold || ['STRONG', 'B', 'TH'].includes(node.tagName) || Number.parseInt(getComputedStyle(node).fontWeight, 10) >= 600
      node.childNodes.forEach((c) => walk(c, b))
    }
  }
  el.childNodes.forEach((c) => walk(c, inheritBold))
  // trim the ends
  while (out.length && !out[0].text.trim()) out.shift()
  while (out.length && !out[out.length - 1].text.trim()) out.pop()
  if (out.length) {
    out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, '') }
    out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text.replace(/\s+$/, '') }
  }
  return out
}

const hasBlockChild = (el: Element) => [...el.children].some((c) => BLOCK_TAGS.has(c.tagName))

/** Reads a sheet into blocks, in reading order. */
export function sheetBlocks(sheet: HTMLElement): Block[] {
  const blocks: Block[] = []
  const root = sheet.querySelector<HTMLElement>('[data-paper-body]') ?? sheet
  const sheetWidth = sheet.getBoundingClientRect().width || 1
  const edge = (st: CSSStyleDeclaration, side: 'Top' | 'Bottom' | 'Left' | 'Right') =>
    Number.parseFloat(st[`border${side}Width` as 'borderTopWidth']) > 0 && st[`border${side}Style` as 'borderTopStyle'] !== 'none'
  // A line is an element with a border on one side only. A bordered box (a photo frame) is not a line.
  const hasBorder = (el: Element, side: 'Top' | 'Bottom') => {
    const st = getComputedStyle(el)
    return edge(st, side) && !edge(st, 'Left') && !edge(st, 'Right') && st.display !== 'table-cell'
  }
  const visit = (el: Element) => {
    if (el.matches('[data-paper-tools], svg, button, style, script')) return
    if (el.tagName === 'IMG') return void pushImage(el as HTMLImageElement)
    if (el.tagName === 'HR') return void blocks.push({ kind: 'rule', short: false })
    const short = el.getBoundingClientRect().width < sheetWidth * 0.6
    if (el.tagName !== 'TABLE' && hasBorder(el, 'Top')) blocks.push({ kind: 'rule', short })
    visitInner(el)
    if (el.tagName !== 'TABLE' && hasBorder(el, 'Bottom')) blocks.push({ kind: 'rule', short })
  }
  const pushImage = (img: HTMLImageElement) => {
    if (!img.complete || !img.naturalWidth) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const bin = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1])
      const jpeg = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      const r = img.getBoundingClientRect()
      const root = sheet.getBoundingClientRect()
      const center = Math.abs(r.left + r.width / 2 - (root.left + root.width / 2)) < 24
      blocks.push({ kind: 'image', jpeg, px: [canvas.width, canvas.height], width: Math.min(110, Math.max(24, r.width * 0.75)), center })
    } catch {
      // a picture that cannot be read is left out; the words still say everything
    }
  }
  /** The words of a cell, with a space where blocks meet ("Preferred by:" then the name), and a dotted leader where
   * the sheet draws a signature line, so a printed file still has a place to sign. */
  const cellText = (el: Element): string => {
    const parts: string[] = []
    const walk = (node: Node) => {
      if (node.nodeType === 3) return void parts.push(node.textContent ?? '')
      if (!(node instanceof Element) || node.matches('[data-paper-tools], svg, button, style, script')) return
      const block = BLOCK_TAGS.has(node.tagName)
      if (block) parts.push(' ')
      if (node !== el && hasBorder(node, 'Top')) parts.push(' ........................ ')
      node.childNodes.forEach(walk)
      if (block) parts.push(' ')
    }
    walk(el)
    return parts.join('').replace(/[ \t\r\f\n]+/g, ' ').trim()
  }
  /** Children laid out on one or more lines (a flex row, a wrapping flex, a grid): each line is a row of columns. */
  const columnsOf = (el: Element): Block[] | null => {
    if (['TABLE', 'UL', 'OL', 'P', 'LI', 'H1', 'H2', 'H3', 'H4'].includes(el.tagName)) return null
    const kids = [...el.children].filter((c) => cellText(c) && !c.matches('[data-paper-tools], svg, button, style, script'))
    if (kids.length < 2 || kids.length > 8) return null
    if (kids.some((k) => k.querySelector('table, img, hr, ul, ol, h1, h2, h3'))) return null
    if (!/flex|grid/.test(getComputedStyle(el).display)) return null
    const rects = kids.map((k) => k.getBoundingClientRect())
    // group by line
    const lines: number[][] = []
    kids.forEach((_, i) => {
      const line = lines.find((l) => Math.abs(rects[l[0]].top - rects[i].top) < Math.max(6, rects[l[0]].height * 0.5))
      if (line) line.push(i)
      else lines.push([i])
    })
    if (lines.some((l) => l.length > 4)) return null
    if (!lines.some((l) => l.length > 1)) return null
    const ordered = lines.map((l) => [...l].sort((a, b) => rects[a].left - rects[b].left))
    return ordered.map((l) => ({
      kind: 'columns' as const,
      cells: l.map((i) => ({ text: cellText(kids[i]), right: ['right', 'end'].includes(getComputedStyle(kids[i]).textAlign) })),
    }))
  }
  const visitInner = (el: Element) => {
    const align = getComputedStyle(el).textAlign
    const center = align === 'center'
    const right = align === 'right' || align === 'end'
    switch (el.tagName) {
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4': {
        const runs = runsOf(el, true)
        if (runs.length) blocks.push({ kind: 'heading', level: el.tagName === 'H1' ? 1 : el.tagName === 'H2' ? 2 : 3, runs, center })
        return
      }
      case 'TABLE': {
        const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()))
        if (rows.some((r) => r.some(Boolean))) blocks.push({ kind: 'table', rows })
        return
      }
      case 'LI':
      case 'P':
      case 'BLOCKQUOTE':
      case 'PRE': {
        const runs = runsOf(el)
        if (runs.length) blocks.push({ kind: 'para', runs, center, right, bullet: el.tagName === 'LI' })
        return
      }
    }
    const sideBySide = columnsOf(el)
    if (sideBySide) return void blocks.push(...sideBySide)
    if (!hasBlockChild(el)) {
      // a flex row of short pieces (a label and its value, two signatures) reads as one line per child
      const kids = [...el.children].filter((c) => (c.textContent ?? '').trim())
      const isRow = kids.length > 1 && getComputedStyle(el).display.includes('flex') && getComputedStyle(el).flexDirection === 'row'
      if (isRow) return void blocks.push({ kind: 'para', runs: kids.flatMap((k, i) => [...(i ? [{ text: '    ' }] : []), ...runsOf(k)]), center: false, right: false })
      const runs = runsOf(el)
      if (runs.length) blocks.push({ kind: 'para', runs, center, right })
      return
    }
    // mixed content: loose text nodes between blocks become their own paragraph
    for (const child of el.childNodes) {
      if (child instanceof Element) visit(child)
      else if (child.nodeType === 3 && (child.textContent ?? '').trim()) blocks.push({ kind: 'para', runs: [{ text: child.textContent!.replace(/\s+/g, ' ').trim() }], center: false, right: false })
    }
  }
  root.childNodes.forEach((c) => c instanceof Element && visit(c))
  const stamp = sheet.querySelector('[data-paper-stamp]')
  if (stamp) {
    const lines = [...stamp.querySelectorAll('p')].map((p) => (p.textContent ?? '').trim()).filter(Boolean)
    lines.forEach((t, i) => blocks.push({ kind: 'para', runs: [{ text: t, bold: i === lines.length - 1 }], center: false, right: true }))
  }
  return blocks
}

// ---------- zip (store) ----------

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, f.data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, f.data.length, true)
    c.setUint32(24, f.data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) (out.set(p, at), (at += p.length))
  return out
}

// ---------- docx ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// control characters are not allowed in XML
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

function wRuns(runs: Run[], size?: number, forceBold = false) {
  return runs
    .map((r) => {
      const props = `${forceBold || r.bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}`
      return r.text
        .split('\n')
        .map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(clean(line))}</w:t></w:r>`)
        .join('')
    })
    .join('')
}

export function docxFile(sheet: HTMLElement, title: string): Uint8Array {
  const blocks = sheetBlocks(sheet)
  const pictures: { name: string; data: Uint8Array }[] = []
  const body = blocks
    .map((b) => {
      if (b.kind === 'image') {
        const n = pictures.length + 1
        pictures.push({ name: `word/media/image${n}.jpg`, data: b.jpeg })
        const cx = Math.round(b.width * 12700)
        const cy = Math.round((b.width * b.px[1]) / b.px[0] * 12700)
        return `<w:p><w:pPr><w:spacing w:after="100"/>${b.center ? '<w:jc w:val="center"/>' : ''}</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
      }
      if (b.kind === 'rule') {
        return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="${b.short ? 480 : 120}" w:after="60"/>${b.short ? '<w:ind w:right="5200"/>' : ''}</w:pPr></w:p>`
      }
      if (b.kind === 'heading') {
        const size = b.level === 1 ? 28 : b.level === 2 ? 24 : 22
        return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/>${b.center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${wRuns(b.runs, size, true)}</w:p>`
      }
      if (b.kind === 'para') {
        const jc = b.center ? '<w:jc w:val="center"/>' : b.right ? '<w:jc w:val="right"/>' : ''
        const lead = b.bullet ? '<w:r><w:t xml:space="preserve">• </w:t></w:r>' : ''
        return `<w:p><w:pPr><w:spacing w:after="100"/>${b.bullet ? '<w:ind w:left="360"/>' : ''}${jc}</w:pPr>${lead}${wRuns(b.runs)}</w:p>`
      }
      if (b.kind === 'columns') {
        const n = b.cells.length
        const cw = Math.floor(9000 / n)
        return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid>${b.cells.map(() => `<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${b.cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="60"/>${c.right ? '<w:jc w:val="right"/>' : ''}</w:pPr><w:r><w:t xml:space="preserve">${esc(clean(c.text))}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr></w:tbl>`
      }
      const cols = Math.max(...b.rows.map((r) => r.length), 1)
      const w = Math.floor(9000 / cols)
      const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="888888"/>`).join('')
      return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${b.rows
        .map((r) => `<w:tr>${Array.from({ length: cols }, (_, i) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${esc(clean(r[i] ?? ''))}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`)
        .join('')}</w:tbl><w:p/>`
    })
    .join('')
  const enc = new TextEncoder()
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(`${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`) },
    { name: '_rels/.rels', data: enc.encode(`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
    { name: 'docProps/core.xml', data: enc.encode(`${xml}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(clean(title))}</dc:title></cp:coreProperties>`) },
    { name: 'word/document.xml', data: enc.encode(`${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1021" w:bottom="1134" w:left="1021" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`) },
    ...(pictures.length
      ? [
          ...pictures,
          {
            name: 'word/_rels/document.xml.rels',
            data: enc.encode(`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pictures.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.jpg"/>`).join('')}</Relationships>`),
          },
        ]
      : []),
  ])
}

// ---------- pdf ----------

const CP1252: Record<number, number> = { 0x20ac: 128, 0x201a: 130, 0x192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2c6: 136, 0x2030: 137, 0x160: 138, 0x2039: 139, 0x152: 140, 0x17d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x2dc: 152, 0x2122: 153, 0x161: 154, 0x203a: 155, 0x153: 156, 0x17e: 158, 0x178: 159 }
function winAnsi(s: string): number[] {
  const out: number[] = []
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!
    if (c === 0xa0) out.push(32)
    else if (c < 256 && !(c >= 128 && c < 160)) out.push(c)
    else out.push(CP1252[c] ?? 63)
  }
  return out
}
const pdfString = (s: string) => '(' + winAnsi(s).map((b) => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b))).join('') + ')'

let measureCtx: CanvasRenderingContext2D | null = null
function widthOf(text: string, size: number, bold: boolean) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size * 0.5
  measureCtx.font = `${bold ? 'bold ' : ''}${size}px "Times New Roman", Times, serif`
  return measureCtx.measureText(text).width
}

type Piece = { text: string; bold: boolean }
function wrap(runs: Run[], size: number, maxWidth: number, forceBold: boolean): Piece[][] {
  const words: Piece[] = []
  for (const r of runs)
    for (const part of r.text.split(/(\n)| /)) {
      if (part === undefined || part === '') continue
      words.push({ text: part, bold: forceBold || !!r.bold })
    }
  const lines: Piece[][] = [[]]
  let used = 0
  for (const w of words) {
    if (w.text === '\n') {
      lines.push([])
      used = 0
      continue
    }
    const wWidth = widthOf(w.text, size, w.bold)
    const space = used ? widthOf(' ', size, false) : 0
    if (used && used + space + wWidth > maxWidth) {
      lines.push([w])
      used = wWidth
    } else {
      lines[lines.length - 1].push(w)
      used += space + wWidth
    }
  }
  return lines.filter((l, i) => l.length || i === 0)
}

export function pdfFile(sheet: HTMLElement, title: string): Uint8Array {
  const blocks = sheetBlocks(sheet)
  const W = 595.28
  const H = 841.89
  const M = 56
  const maxW = W - 2 * M
  const pages: string[][] = [[]]
  let y = H - M
  const need = (h: number) => {
    if (y - h < M) {
      pages.push([])
      y = H - M
    }
  }
  const text = (x: number, size: number, bold: boolean, s: string) => pages[pages.length - 1].push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(s)} Tj ET`)
  const drawLines = (lines: Piece[][], size: number, align: 'left' | 'center' | 'right', x0 = M, width = maxW) => {
    const lh = size * 1.35
    for (const line of lines) {
      need(lh)
      y -= lh
      const total = line.reduce((n, p, i) => n + widthOf(p.text, size, p.bold) + (i ? widthOf(' ', size, false) : 0), 0)
      let x = align === 'center' ? x0 + (width - total) / 2 : align === 'right' ? x0 + width - total : x0
      line.forEach((p, i) => {
        if (i) x += widthOf(' ', size, false)
        text(x, size, p.bold, p.text)
        x += widthOf(p.text, size, p.bold)
      })
    }
  }
  const images: { jpeg: Uint8Array; px: [number, number] }[] = []
  for (const b of blocks) {
    if (b.kind === 'image') {
      const h = (b.width * b.px[1]) / b.px[0]
      need(h + 6)
      y -= h
      const x = b.center ? M + (maxW - b.width) / 2 : M
      images.push({ jpeg: b.jpeg, px: b.px })
      pages[pages.length - 1].push(`q ${b.width.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${images.length - 1} Do Q`)
      y -= 6
    } else if (b.kind === 'rule') {
      if (b.short) y -= 20
      need(8)
      y -= 4
      pages[pages.length - 1].push(`0 G 0.6 w ${M} ${y.toFixed(2)} m ${(M + (b.short ? 210 : maxW)).toFixed(2)} ${y.toFixed(2)} l S`)
      y -= 4
    } else if (b.kind === 'heading') {
      const size = b.level === 1 ? 14 : b.level === 2 ? 12 : 11
      y -= 6
      need(size * 2.7)
      drawLines(wrap(b.runs, size, maxW, true), size, b.center ? 'center' : 'left')
      y -= 3
    } else if (b.kind === 'para') {
      const indent = b.bullet ? 14 : 0
      const runs = b.bullet ? [{ text: '• ' }, ...b.runs] : b.runs
      drawLines(wrap(runs, 11, maxW - indent, false), 11, b.center ? 'center' : b.right ? 'right' : 'left', M + indent, maxW - indent)
      y -= 4
    } else if (b.kind === 'columns') {
      const cw = maxW / b.cells.length
      const cells = b.cells.map((c) => wrap([{ text: c.text }], 11, cw - 8, false))
      const rows = Math.max(...cells.map((c) => c.length))
      need(rows * 11 * 1.35 + 4)
      const top = y
      cells.forEach((lines, i) => {
        y = top
        drawLines(lines, 11, b.cells[i].right ? 'right' : 'left', M + i * cw + 4, cw - 8)
      })
      y = top - rows * 11 * 1.35 - 4
    } else {
      const cols = Math.max(...b.rows.map((r) => r.length), 1)
      const cw = maxW / cols
      for (const row of b.rows) {
        const cells = Array.from({ length: cols }, (_, i) => wrap([{ text: row[i] ?? '' }], 10, cw - 8, false))
        const rows = Math.max(...cells.map((c) => c.length))
        const lh = 10 * 1.35
        need(rows * lh + 6)
        const top = y
        cells.forEach((lines, i) => {
          y = top
          drawLines(lines, 10, 'left', M + i * cw + 4, cw - 8)
        })
        y = top - rows * lh - 4
        pages[pages.length - 1].push(`0.5 G ${M} ${y.toFixed(2)} m ${(W - M).toFixed(2)} ${y.toFixed(2)} l S`)
      }
      y -= 8
    }
  }
  const objs: string[] = []
  const add = (s: string) => objs.push(s) && objs.length
  add('<< /Type /Catalog /Pages 2 0 R >>')
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>')
  const firstImage = 5 + pages.length * 2
  const xobjects = images.length ? ` /XObject << ${images.map((_, i) => `/Im${i} ${firstImage + i} 0 R`).join(' ')} >>` : ''
  pages.forEach((ops, i) => {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${6 + i * 2} 0 R >>`)
    const content = ops.join('\n')
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  for (const im of images) {
    // the picture's bytes go in as they are: each character here stands for one byte
    let bin = ''
    for (let i = 0; i < im.jpeg.length; i += 0x8000) bin += String.fromCharCode(...im.jpeg.subarray(i, i + 0x8000))
    add(`<< /Type /XObject /Subtype /Image /Width ${im.px[0]} /Height ${im.px[1]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n${bin}\nendstream`)
  }
  const info = add(`<< /Title ${pdfString(title)} /Producer (Pleadli) >>`)
  // content streams hold only ASCII (strings are escaped), so string length equals byte length
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
