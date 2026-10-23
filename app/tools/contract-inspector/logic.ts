import { cellFromApi, cellStats, summarizeCode, type CellStats, type CodeSummary } from '~/lib/contracts-read/cells'

/** toncenter /api/v3/account */
export interface ToncenterAccount {
  balance: string
  code: string | null
  data: string | null
  status: string
  frozen_hash: string | null
  last_transaction_lt: string | null
}

/** tonapi /v2/accounts/{id} (subset) */
export interface TonapiAccount {
  interfaces?: string[]
  name?: string
  is_scam?: boolean
  is_wallet?: boolean
  get_methods?: string[]
}

/** tonapi /v2/blockchain/accounts/{id}/inspect (subset). Resolves library code before analysing. */
export interface TonapiInspect {
  code_hash: string
  methods: { id: number, method: string }[]
  compiler: string
  source?: { files?: { name: string }[] }
}

export interface Inspection {
  status: string
  balance: bigint
  frozenHash: string | null
  code: (CodeSummary & { boc: string }) | null
  data: { boc: string, hashHex: string, stats: CellStats } | null
  interfaces: { id: string, label: string }[]
  name?: string
  isScam: boolean
  compiler?: string
  methods: { id: number, name: string }[]
  hasSource: boolean
}

const INTERFACES: Record<string, string> = {
  jetton_master: 'Jetton master (TEP-74)',
  jetton_wallet: 'Jetton wallet (TEP-74)',
  jetton_wallet_v1: 'Jetton wallet v1 (TEP-74)',
  jetton_wallet_v2: 'Jetton wallet v2 (TEP-74)',
  nft_item: 'NFT item (TEP-62)',
  nft_collection: 'NFT collection (TEP-62)',
  nft_item_simple: 'NFT item (TEP-62)',
  nft_royalty: 'NFT royalty (TEP-66)',
  sbt: 'Soulbound token (TEP-85)',
  dns: 'TON DNS resolver (TEP-81)',
  jetton_wallet_governed: 'Governed jetton wallet (TEP-74, USD₮ style)',
  teleitem: 'Telegram collectible'
}

const COMPILERS: Record<string, string> = { func: 'FunC', fift: 'Fift', tact: 'Tact', tolk: 'Tolk' }

export function interfaceLabel(id: string): string {
  if (INTERFACES[id]) return INTERFACES[id]
  const w = /^wallet_(v\d)(r\d|beta)?$/.exec(id)
  if (w) return `Wallet ${w[1]}${(w[2] ?? '').toUpperCase()}`
  return id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

export function inspect(acc: ToncenterAccount, info: TonapiAccount | null, insp: TonapiInspect | null): Inspection {
  const codeCell = acc.code ? cellFromApi(acc.code) : null
  const dataCell = acc.data ? cellFromApi(acc.data) : null
  const code = codeCell ? { ...summarizeCode(codeCell), boc: codeCell.toBoc().toString('base64') } : null
  return {
    status: acc.status,
    balance: BigInt(acc.balance ?? 0),
    frozenHash: acc.frozen_hash,
    code,
    data: dataCell ? { boc: dataCell.toBoc().toString('base64'), hashHex: dataCell.hash().toString('hex'), stats: cellStats(dataCell) } : null,
    // the wallet version is already shown from the code hash; skip tonapi's duplicate wallet_* interface
    interfaces: (info?.interfaces ?? []).filter(id => !(code?.wallet && id.startsWith('wallet_'))).map(id => ({ id, label: interfaceLabel(id) })),
    name: info?.name,
    isScam: !!info?.is_scam,
    compiler: insp?.compiler ? (COMPILERS[insp.compiler] ?? insp.compiler) : undefined,
    methods: (insp?.methods ?? []).map(m => ({ id: m.id, name: m.method })).sort((a, b) => a.name.localeCompare(b.name)),
    hasSource: !!insp?.source?.files?.length
  }
}
