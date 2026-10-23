import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'telegram-initdata-validator',
  name: 'Telegram Mini App initData validator',
  short: 'Check a Mini App initData hash with your bot token, or its Ed25519 signature with just the bot ID.',
  description: 'Verify Telegram Mini App initData in your browser: the HMAC hash with your bot token, or Telegram\'s Ed25519 signature with only the bot ID, and see the decoded user, auth date and start parameter. Nothing is sent anywhere.',
  category: 'telegram',
  audience: 'dev',
  network: 'offline',
  keywords: ['telegram', 'mini app', 'twa', 'initData', 'webapp', 'validate', 'hash', 'hmac', 'signature', 'ed25519', 'bot token', 'auth', 'tma'],
  related: ['telegram-miniapp-link-builder'],
  icon: 'i-lucide-shield-check'
})
