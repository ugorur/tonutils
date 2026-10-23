import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'vanity-address-generator',
  name: 'Vanity wallet address generator',
  short: 'Find a TON wallet address that starts or ends with your word, in your browser.',
  description: 'Search for a W5 or v4R2 wallet address with a custom prefix or suffix using every CPU core. Get an importable 24-word phrase, or, about a thousand times faster, a private key for scripts. Nothing leaves your browser.',
  category: 'wallet-keys',
  audience: 'user',
  network: 'offline',
  keywords: ['vanity', 'custom address', 'pretty address', 'beautiful address', 'address prefix', 'address suffix', 'nice wallet address', 'generator', 'w5', 'v4r2', 'mnemonic', 'private key', 'web worker'],
  related: ['mnemonic-generator', 'address-converter', 'mnemonic-to-addresses'],
  icon: 'i-lucide-wand-sparkles'
})
