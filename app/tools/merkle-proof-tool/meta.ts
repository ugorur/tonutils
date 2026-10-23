import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'merkle-proof-tool',
  name: 'Merkle proof builder and verifier',
  short: 'Verify a TON Merkle proof against a root hash, see what it proves, or build proofs for dict keys.',
  description: 'Paste a Merkle proof, a Merkle update or a mintless-jetton claim payload: see its root hash, the kept and pruned branches and the dictionary entries it proves, and check it against an expected root. Build proofs and updates for any dictionary keys, with TEP-176 airdrop claim wrapping.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['merkle', 'merkle proof', 'merkle update', 'pruned branch', 'exotic cell', 'mintless', 'airdrop', 'TEP-176', 'claim', 'custom_payload', 'whitelist', 'generateMerkleProof', 'root hash', 'dictionary'],
  related: ['dictionary-codec', 'tvm-stack-codec', 'stateinit-builder'],
  icon: 'i-lucide-git-compare'
})
