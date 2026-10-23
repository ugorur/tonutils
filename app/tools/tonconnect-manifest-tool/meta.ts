import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tonconnect-manifest-tool',
  name: 'TonConnect manifest generator and checker',
  short: 'Create a tonconnect-manifest.json, or check a hosted one the way wallets fetch it.',
  description: 'Generate a valid tonconnect-manifest.json for your dApp, or check a hosted manifest against the TonConnect spec: reachable cross-origin (CORS), HTTP 200, JSON content type, required fields, https URLs, app domain, and a square PNG icon at 180×180.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'read',
  keywords: ['tonconnect', 'ton connect', 'tonconnect-manifest.json', 'manifest', 'manifestUrl', 'validator', 'generator', 'cors', 'iconUrl', 'app manifest', 'error 2', 'manifest not found', 'manifest content error', 'dapp'],
  related: ['tonconnect-tx-tester', 'tonconnect-wallets-status', 'tonconnect-link-decoder', 'ton-proof-verifier'],
  icon: 'i-lucide-file-check'
})
