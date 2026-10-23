import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tx-lookup',
  name: 'Transaction lookup & explainer',
  short: 'Paste a tx hash or explorer link: see what happened, the full trace, fees and why a step failed.',
  description: 'Paste a TON transaction hash, message hash or Tonviewer/Tonscan link. Get a plain-language summary, every step of the trace as a tree, fees, bounces and failed steps with their exit codes explained.',
  category: 'transactions',
  audience: 'both',
  network: 'read',
  keywords: ['transaction', 'tx', 'hash', 'trace', 'message hash', 'exit code', 'failed', 'bounce', 'bounced', 'aborted', 'fees', 'explain', 'tonviewer', 'tonscan', 'compute phase', 'action phase', 'why did my transaction fail'],
  related: ['tx-receipt', 'tx-history', 'explorer-link-switcher'],
  icon: 'i-lucide-scan-search'
})
