import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'encoding-converter',
  name: 'Encoding converter',
  short: 'Convert bytes between hex, base64, base64url, base32, UTF-8 text and big integers.',
  description: 'Paste a hash, key, code hash or any value and see it in every encoding TON uses: hex, standard and URL-safe base64, base32 (ADNL), UTF-8 text, a decimal big integer and a byte array. A 32-byte value is also shown as an account address.',
  category: 'crypto-encoding',
  audience: 'dev',
  network: 'offline',
  keywords: ['base64', 'base64url', 'url-safe', 'hex', 'base16', 'base32', 'utf8', 'utf-8', 'bigint', 'uint256', 'decimal', 'bytes', 'uint8array', 'decode', 'encode', 'code hash', 'convert'],
  related: ['hash-utilities', 'ed25519-sign-verify', 'adnl-address-converter', 'address-converter', 'boc-converter'],
  icon: 'i-lucide-binary'
})
