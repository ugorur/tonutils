import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'address-poisoning-detector',
  name: 'Address poisoning detector',
  short: 'Find fake look-alike addresses planted in your wallet history so you never copy one.',
  description: 'Scans a wallet\'s recent history for address poisoning: fresh addresses that end like someone you really pay and send you tiny transfers so they show up in your history. Lists each real counterparty with its fakes, plus other dust and spam senders.',
  category: 'security',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['address poisoning', 'poisoning attack', 'look-alike address', 'lookalike', 'fake address', 'dust attack', 'spam transfer', 'zero transfer', 'vanity address scam', 'copy address', 'history', 'scam'],
  related: ['safe-to-send', 'address-compare', 'wallet-security-checkup', 'scam-checker'],
  icon: 'i-lucide-copy-x'
})
