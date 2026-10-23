import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'mintless-jetton-airdrop-builder',
  name: 'Mintless jetton airdrop builder',
  short: 'Turn a CSV of owners and amounts into the Merkle root, proofs and claim data for a mintless jetton',
  description: 'Builds a TEP-177 mintless airdrop from a CSV (address, amount, start, expiry): the airdrop dictionary and its Merkle root for the minter, each owner\'s claim custom_payload and jetton wallet state_init, and the TEP-176 API answers wallets fetch. Runs in your browser.',
  category: 'jettons',
  audience: 'dev',
  network: 'offline',
  keywords: ['mintless', 'mintless jetton', 'airdrop', 'merkle', 'merkle root', 'merkle proof', 'tep-177', 'tep-176', 'custom_payload', 'custom_payload_api_uri', 'claim', 'hmstr', 'jetton 2.0', 'csv'],
  related: ['mintless-claim', 'merkle-proof-tool', 'dictionary-codec'],
  icon: 'i-lucide-list-tree'
})
