import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'multisig-viewer',
  name: 'Multisig wallet viewer',
  short: 'Signers, threshold and orders of a TON multisig v2 wallet, or the multisigs a wallet signs for.',
  description: 'Look up a multisig v2 wallet: its signers, proposers and approval threshold, plus every order with its approvals, expiry and decoded actions. Paste a regular wallet instead to find the multisigs it is a signer or proposer of. Read-only.',
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['multisig', 'multisig v2', 'multi-signature', 'signers', 'threshold', 'orders', 'approvals', 'proposers', 'treasury', 'dao', 'multisig.ton.org'],
  related: ['wallet-version-detector', 'account-overview', 'vesting-viewer'],
  icon: 'i-lucide-users-round'
})
