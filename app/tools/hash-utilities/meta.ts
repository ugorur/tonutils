import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'hash-utilities',
  name: 'Hash and checksum utilities',
  short: 'SHA-256, SHA-512, CRC-16, CRC-32, CRC-32C, HMAC and PBKDF2 for text, bytes or files.',
  description: 'Hash text, hex, base64 or a file with SHA-256, SHA-512, CRC-16 (XMODEM), CRC-32 and CRC-32C, compare against an expected checksum, and compute HMAC-SHA256/512 and PBKDF2. Shows TON get-method ids and TL-B op codes derived from the input.',
  category: 'crypto-encoding',
  audience: 'dev',
  network: 'offline',
  keywords: ['sha256', 'sha-256', 'sha512', 'sha-512', 'crc16', 'crc32', 'crc32c', 'checksum', 'hmac', 'pbkdf2', 'digest', 'hash', 'file hash', 'method id', 'op code', 'tl-b', 'xmodem', 'castagnoli'],
  related: ['encoding-converter', 'ed25519-sign-verify', 'get-method-id', 'message-hash-tool'],
  icon: 'i-lucide-hash'
})
