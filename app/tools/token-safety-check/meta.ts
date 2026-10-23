import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'token-safety-check',
  name: 'Token safety check',
  short: 'Rug-pull risk check for a jetton: admin, minting, holders, liquidity, code and metadata.',
  description: 'Risk report for any TON token (jetton): scam-list status, fake tickers and phishing names, whether the admin is renounced or can still mint, how concentrated the holders are, how much DEX liquidity exists, whether the wallet code is a common one and where the metadata lives.',
  category: 'security',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, plus DexScreener for liquidity data, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['rug pull', 'rug check', 'token scanner', 'jetton safety', 'honeypot', 'is this token safe', 'dyor', 'mintable', 'renounced', 'admin', 'liquidity', 'holders', 'concentration', 'fake token', 'meme coin'],
  related: ['jetton-info', 'jetton-holders', 'scam-checker', 'dex-pools'],
  icon: 'i-lucide-search-check'
})
