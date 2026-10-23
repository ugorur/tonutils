import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'storage-providers',
  name: 'TON Storage providers',
  short: 'Compare TON Storage providers by price and file limits, and estimate what storing a file costs.',
  description: `List the TON Storage providers that accept new files, with their price per MB per day, file size limits and proof interval, and calculate how much ${COIN_SYMBOL} it costs to keep a file of a given size for a given time with each of them.`,
  category: 'network-stats',
  audience: 'user',
  network: 'read',
  keywords: ['ton storage', 'storage provider', 'decentralized storage', 'file hosting', 'bag', 'torrent', 'price per mb', 'storage cost', 'storage-daemon', 'rate_per_mb_day', 'ton sites'],
  related: ['network-status', 'dns-lookup', 'dns-record-editor'],
  icon: 'i-lucide-hard-drive'
})
