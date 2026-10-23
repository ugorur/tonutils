import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'timestamp-helper',
  name: 'Timestamp, valid_until & lt helper',
  short: 'Unix time ⇄ date, valid_until for wallets and TonConnect, chain clock and lt lookup.',
  description: 'Convert unix timestamps and dates, build a valid_until value for wallet external messages and TonConnect from your clock or the chain\'s, see the latest masterchain block time, and find roughly when a logical time (lt) happened.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'read',
  keywords: ['timestamp', 'unix time', 'epoch', 'date converter', 'valid_until', 'validUntil', 'expiration', 'TonConnect', 'logical time', 'lt', 'gen_utime', 'masterchain seqno', 'block time', 'clock drift', 'now()'],
  related: ['query-id-generator', 'external-message-builder-sender', 'block-explorer-lite'],
  icon: 'i-lucide-calendar-clock'
})
