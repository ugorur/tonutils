// "Pay with TON" button snippets: plain HTML with inline styles (no script, no external assets), plus Markdown.
import type { PaymentRequest, ShareExtras } from '~/lib/payments/link'
import { buildLink, hostedUrl, SITE_ORIGIN } from '~/lib/payments/link'

export type Target = 'hosted' | 'keeper' | 'ton'
export type Theme = 'blue' | 'dark' | 'light'
export type Size = 'sm' | 'md' | 'lg'

export const TARGETS: { value: Target, label: string, hint: string }[] = [
  { value: 'hosted', label: 'TonUtils checkout page', hint: 'Works everywhere: TonConnect on desktop and mobile, QR code, and a "payment received" confirmation.' },
  { value: 'keeper', label: 'Keeper (Tonkeeper) link', hint: 'Opens Keeper on phones; on desktop shows Keeper\'s web page with a QR.' },
  { value: 'ton', label: 'ton:// link', hint: 'Opens whatever TON wallet app is installed. Does nothing on devices without one.' }
]

/** Where the button points. Snippets are for other sites, so the checkout page uses the public origin. */
export function targetUrl(r: PaymentRequest, target: Target, extras: ShareExtras = {}, origin = SITE_ORIGIN): string {
  return target === 'hosted' ? hostedUrl(r, extras, origin) : buildLink(r, target)
}

const THEMES: Record<Theme, { bg: string, fg: string, border: string }> = {
  blue: { bg: '#0098EA', fg: '#FFFFFF', border: '#0098EA' },
  dark: { bg: '#121214', fg: '#FFFFFF', border: '#121214' },
  light: { bg: '#FFFFFF', fg: '#0B0B0D', border: '#D4D4D8' }
}
const SIZES: Record<Size, { pad: string, font: number, icon: number }> = {
  sm: { pad: '8px 14px', font: 14, icon: 16 },
  md: { pad: '12px 20px', font: 16, icon: 20 },
  lg: { pad: '16px 28px', font: 18, icon: 24 }
}

/** HTML-escapes text and attribute values (& < > " '). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}

export interface ButtonOptions {
  href: string
  label: string
  theme: Theme
  size: Size
  /** Fully rounded (pill) instead of rounded corners. */
  pill: boolean
  newTab: boolean
  /** Inline SVG QR of the payment link, shown above the button. Must be qrcode-generated markup. */
  qrSvg?: string
}

/** TON diamond mark as a single-colour inline SVG (currentColor). */
const icon = (px: number) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16L12 20Z"/><path d="M12 5v15"/></svg>`

export function buttonHtml(o: ButtonOptions): string {
  const t = THEMES[o.theme]
  const s = SIZES[o.size]
  const style = [
    'display:inline-flex', 'align-items:center', 'gap:8px', `padding:${s.pad}`, `border-radius:${o.pill ? '999px' : '12px'}`,
    `border:1px solid ${t.border}`, `background:${t.bg}`, `color:${t.fg}`,
    `font:600 ${s.font}px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`, 'text-decoration:none', 'cursor:pointer'
  ].join(';')
  const attrs = `href="${escapeHtml(o.href)}"${o.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''} style="${escapeHtml(style)}"`
  const a = `<a ${attrs}>${icon(s.icon)}<span>${escapeHtml(o.label)}</span></a>`
  if (!o.qrSvg) return `<!-- Pay with TON button (tonutils.io) -->\n${a}`
  const wrap = 'display:inline-flex;flex-direction:column;align-items:center;gap:12px'
  const qr = `<div style="width:180px;height:180px;background:#fff;padding:8px;border-radius:12px;box-sizing:border-box">${o.qrSvg}</div>`
  return `<!-- Pay with TON button + QR (tonutils.io) -->\n<div style="${wrap}">\n${qr}\n${a}\n</div>`
}

/** Markdown link (READMEs, forums). Brackets in the label and parentheses in the URL are escaped. */
export function markdownLink(label: string, href: string): string {
  return `[${label.replace(/([[\]\\])/g, '\\$1')}](${href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
}

/** Default button text for an amount ("Pay 5 GRAM", or "Pay with GRAM" without an amount). */
export function defaultLabel(amountText: string | null, symbol: string): string {
  return amountText ? `Pay ${amountText}` : `Pay with ${symbol}`
}

/** Wraps a snippet in a minimal page for the preview iframe (no scripts). */
export function previewDoc(snippet: string, dark: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:${dark ? '#0B0B0D' : '#F4F4F5'}}</style></head><body>${snippet}</body></html>`
}
