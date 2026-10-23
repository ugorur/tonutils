import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'telegram-miniapp-link-builder',
  name: 'Telegram Mini App link builder',
  short: 'Build and decode t.me links for bots and Mini Apps: startapp, start, attach menu, full-screen mode',
  description: 'Build Telegram deep links for bots and Mini Apps (direct, main, /start and attachment menu), encode text or JSON payloads as base64url within the length limits, get a QR code and TonConnect return URL, or decode an existing link.',
  category: 'telegram',
  audience: 'dev',
  network: 'offline',
  keywords: ['telegram', 'mini app', 'twa', 'deep link', 't.me', 'startapp', 'start_param', 'startattach', 'start parameter', 'base64url', 'bot link', 'tonconnect', 'twaReturnUrl', 'qr'],
  related: ['telegram-initdata-validator'],
  icon: 'i-lucide-link'
})
