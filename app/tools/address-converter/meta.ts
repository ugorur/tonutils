import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'address-converter',
  name: 'Address converter',
  short: 'Turn any TON address into raw, bounceable, non-bounceable and testnet forms.',
  description: 'Paste a TON address in any format and get every equivalent form: raw, bounceable (EQ), non-bounceable (UQ), URL-safe or standard base64, mainnet or testnet. Shows the workchain and account hash.',
  category: 'address',
  audience: 'both',
  network: 'offline',
  keywords: ['raw', 'friendly', 'bounceable', 'non-bounceable', 'EQ', 'UQ', 'kQ', '0Q', 'base64', 'url-safe', 'workchain', 'hash', 'testnet', 'validate'],
  related: ['ton-units', 'mnemonic-generator'],
  icon: 'i-lucide-at-sign',
  featured: true
})
