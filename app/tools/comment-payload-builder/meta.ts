import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'comment-payload-builder',
  name: 'Comment payload builder',
  short: 'Turn text into a TON comment payload (BOC) and back; encrypt or decrypt encrypted comments locally',
  description: 'Build the message body wallets send for a text comment (op 0 + snake string), decode a comment body, and read or write encrypted comments (op 0x2167da4b, the format Tonkeeper and MyTonWallet use) with your recovery phrase. Everything runs in your browser; the phrase never leaves this page.',
  category: 'transactions',
  audience: 'both',
  network: 'offline',
  keywords: ['comment', 'memo', 'text comment', 'payload', 'boc', 'encrypted comment', 'decrypt comment', 'encrypt message', '0x2167da4b', 'snake string', 'ton transfer comment', 'deeplink text'],
  related: ['payload-decoder', 'internal-message-builder', 'boc-converter', 'snake-string-codec'],
  icon: 'i-lucide-message-square-text'
})
