// Draws the plain-text receipt (receiptText output) plus its QR code onto a canvas and returns a PNG blob.
// Browser only. ponytail: hand-drawn canvas instead of an html-to-image dependency; the PNG mirrors the text receipt, not the on-screen card.

const W = 760
const PAD = 40
const LABEL_W = 170

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= max) {
      line = next
      continue
    }
    if (line) out.push(line)
    // Addresses and hashes have no spaces: break them by character.
    line = ''
    for (const ch of word) {
      if (ctx.measureText(line + ch).width > max) {
        out.push(line)
        line = ch
      }
      else line += ch
    }
  }
  if (line) out.push(line)
  return out
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not draw the QR code'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

export async function receiptPng(text: string, qrSvg: string, scale = 2): Promise<Blob> {
  const [title = '', ...rest] = text.split('\n')
  const rows = rest.map((l) => {
    const i = l.indexOf(': ')
    return i < 0 ? ['', l] as const : [l.slice(0, i), l.slice(i + 2)] as const
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const valueFont = '16px "JetBrains Mono", ui-monospace, monospace'
  ctx.font = valueFont
  const laid = rows.map(([label, value]) => ({ label, lines: wrap(ctx, value, W - PAD * 2 - LABEL_W) }))
  const QR = 180
  const H = PAD + 44 + laid.reduce((h, r) => h + r.lines.length * 24 + 10, 0) + 20 + QR + PAD

  canvas.width = W * scale
  canvas.height = H * scale
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#0b1220'
  ctx.font = 'bold 26px Unbounded, system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(title, PAD, PAD)

  let y = PAD + 52
  for (const r of laid) {
    ctx.font = '14px Onest, system-ui, sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText(r.label, PAD, y + 2)
    ctx.font = valueFont
    ctx.fillStyle = '#0b1220'
    for (const l of r.lines) {
      ctx.fillText(l, PAD + LABEL_W, y)
      y += 24
    }
    y += 10
  }
  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(PAD, y + 4)
  ctx.lineTo(W - PAD, y + 4)
  ctx.stroke()

  if (qrSvg) ctx.drawImage(await loadSvg(qrSvg), PAD, y + 20, QR, QR)
  ctx.font = '13px Onest, system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText('Scan to verify this transaction', PAD + QR + 20, y + 20 + QR / 2 - 16)
  ctx.fillText('on a public TON explorer. Made with tonutils.io', PAD + QR + 20, y + 20 + QR / 2 + 4)

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'))
}
