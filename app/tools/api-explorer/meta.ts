import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'api-explorer',
  name: 'TON API request builder',
  short: 'Try any toncenter v2/v3 or tonapi endpoint from your browser and copy it as curl, fetch or @ton/ton.',
  description: 'Pick any endpoint of toncenter API v2, toncenter v3 or tonapi.io, loaded live from their OpenAPI specs. Fill the parameters (prefilled with working examples), send the request keyless from your browser on mainnet or testnet, read the JSON response, and copy the call as curl, fetch or @ton/ton code.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'read',
  privacyNote: 'Your browser sends each request straight to the API you pick (toncenter or tonapi) and loads their public OpenAPI specs. Nothing is stored.',
  keywords: ['api', 'toncenter', 'tonapi', 'openapi', 'swagger', 'rest', 'http api', 'curl', 'fetch', 'TonClient', '@ton/ton', 'runGetMethod', 'getAddressInformation', 'indexer', 'v3', 'postman', 'request builder', 'playground'],
  related: ['get-method-runner', 'network-status', 'testnet-faucet-hub', 'tx-lookup'],
  icon: 'i-lucide-braces'
})
