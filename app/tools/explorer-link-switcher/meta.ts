import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'explorer-link-switcher',
  name: 'Explorer link switcher',
  short: 'Open the same TON address or transaction on Tonviewer, Tonscan and other explorers.',
  description: 'Paste a link from any TON explorer (Tonviewer, Tonscan, tonscan.com, dton, Tonwhales, explorer.toncoin.org, Getgems), or a bare address or transaction hash, and get the same page on every other explorer, mainnet or testnet.',
  category: 'address',
  audience: 'user',
  network: 'offline',
  keywords: ['explorer', 'tonviewer', 'tonscan', 'tonscan.com', 'dton', 'tonwhales', 'getgems', 'link', 'url', 'switch', 'open in', 'transaction hash', 'tx hash', 'hex', 'base64'],
  related: ['address-converter'],
  icon: 'i-lucide-link'
})
