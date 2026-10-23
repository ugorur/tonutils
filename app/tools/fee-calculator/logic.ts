// Gas / forward / storage fee calculator on top of the shared node-exact fee math.
import type { FeeConfig, Workchain } from '~/lib/fees-time/fees'
import { cellStats, currentStoragePrice, fwdFee, gasFee, SECONDS_PER_DAY, SECONDS_PER_YEAR, splitFwdFee, storageFeeFor } from '~/lib/fees-time/fees'
import { formatCoin, NANO_NAME } from '~/utils/currency'
import { parseBoc } from '~/utils/ton/messages'
import { groupThousands } from '~/utils/units'

export type BocKind = 'message' | 'body-ref' | 'body-inline'

export const BOC_KINDS: { value: BocKind, label: string, description: string }[] = [
  { value: 'message', label: 'Full message', description: 'A whole Message cell (header + body). Its root cell is free.' },
  { value: 'body-ref', label: 'Body, stored as a reference', description: 'Typical for jetton/NFT transfers: the body gets its own cell, so every body cell is paid.' },
  { value: 'body-inline', label: 'Body, stored inline', description: 'Small bodies that fit in the message root: the body root is free.' }
]

/** Cells/bits a message pays for (root excluded, duplicate cells counted once). */
export function bocStats(input: string, kind: BocKind): { cells: bigint, bits: bigint } {
  return cellStats(parseBoc(input), kind !== 'body-ref')
}

export const DURATION_UNITS = [
  { value: 'seconds', label: 'seconds', seconds: 1 },
  { value: 'hours', label: 'hours', seconds: 3600 },
  { value: 'days', label: 'days', seconds: SECONDS_PER_DAY },
  { value: 'years', label: 'years (365 d)', seconds: SECONDS_PER_YEAR }
] as const
export type DurationUnit = typeof DURATION_UNITS[number]['value']

/** Non-negative integer from user text ("3 308", "3,308" ok); null when empty/invalid. */
export function parseCount(s: string): bigint | null {
  const t = s.replace(/[\s,_]/g, '')
  return /^\d{1,18}$/.test(t) ? BigInt(t) : null
}

export function toSeconds(value: string, unit: DurationUnit): number | null {
  const n = Number(value.replace(/[\s,_]/g, ''))
  if (!value.trim() || !Number.isFinite(n) || n < 0) return null
  return Math.floor(n * DURATION_UNITS.find(u => u.value === unit)!.seconds)
}

export interface FeeInputs {
  gas: bigint | null
  msg: { cells: bigint, bits: bigint } | null
  storage: { cells: bigint, bits: bigint, seconds: number } | null
}

export interface FeeResult {
  gas: bigint | null
  fwd: { total: bigint, action: bigint, remaining: bigint } | null
  storage: bigint | null
  total: bigint
}

export function computeFees(cfg: FeeConfig, wc: Workchain, inp: FeeInputs, now = Math.floor(Date.now() / 1000)): FeeResult {
  const gas = inp.gas === null ? null : gasFee(inp.gas, cfg.gas[wc])
  let fwd: FeeResult['fwd'] = null
  if (inp.msg) {
    const total = fwdFee(inp.msg.cells, inp.msg.bits, cfg.msg[wc])
    fwd = { total, ...splitFwdFee(total, cfg.msg[wc]) }
  }
  let storage: bigint | null = null
  const price = currentStoragePrice(cfg.storage, now)
  if (inp.storage && price) storage = storageFeeFor(inp.storage.cells, inp.storage.bits, inp.storage.seconds, price, wc === 'masterchain')
  return { gas, fwd, storage, total: (gas ?? 0n) + (fwd?.total ?? 0n) + (storage ?? 0n) }
}

/** nano * 2^16 per unit -> exact decimal nano string (e.g. 4369067 -> "66.6667"). */
export function per16(v: bigint, digits = 4): string {
  const scaled = (v * 10n ** BigInt(digits) + 0x8000n) >> 16n
  const s = scaled.toString().padStart(digits + 1, '0')
  const out = `${s.slice(0, -digits)}.${s.slice(-digits)}`.replace(/\.?0+$/, '')
  return groupThousands(out)
}

/** Human summary of the live prices for one workchain. */
export function priceRows(cfg: FeeConfig, wc: Workchain, now = Math.floor(Date.now() / 1000)) {
  const g = cfg.gas[wc]
  const m = cfg.msg[wc]
  const sp = currentStoragePrice(cfg.storage, now)
  const mc = wc === 'masterchain'
  const cellYear = sp ? storageFeeFor(1n, 0n, SECONDS_PER_YEAR, sp, mc) : 0n
  const kbitYear = sp ? storageFeeFor(0n, 1000n, SECONDS_PER_YEAR, sp, mc) : 0n
  return [
    { label: 'Gas price', value: `${per16(g.gasPrice)} ${NANO_NAME} per gas unit`, hint: `First ${g.flatLimit} gas cost a flat ${formatCoin(g.flatPrice)} (config ${mc ? 20 : 21})` },
    { label: 'Gas limits', value: `${groupThousands(String(g.gasLimit))} per tx · ${groupThousands(String(g.gasCredit))} credit for external messages`, hint: `A full ${groupThousands(String(g.gasLimit))}-gas transaction costs ${formatCoin(gasFee(g.gasLimit, g))}` },
    { label: 'Message lump price', value: formatCoin(m.lumpPrice), hint: `Paid by every message; covers the root cell (config ${mc ? 24 : 25})` },
    { label: 'Per extra cell / bit', value: `${per16(m.cellPrice)} / ${per16(m.bitPrice)} ${NANO_NAME}` },
    { label: 'Sender\'s share (first_frac)', value: `${per16(BigInt(m.firstFrac) * 100n, 2)}%`, hint: 'Part of the forward fee kept by the sender\'s validators; the rest travels in the message' },
    { label: 'Storage per cell per year', value: formatCoin(cellYear), hint: sp ? `Prices since ${new Date(sp.utimeSince * 1000).toISOString().slice(0, 10)} (config 18)` : undefined },
    { label: 'Storage per 1000 bits per year', value: formatCoin(kbitYear) },
    { label: 'Freeze / delete due limit', value: `${formatCoin(g.freezeDueLimit)} / ${formatCoin(g.deleteDueLimit)}`, hint: 'Unpaid storage debt above which an account is frozen, then deleted' }
  ]
}

/**
 * A real mainnet transaction to compare against: wallet v4 EQDQ_HdfPCW2uE0UQTU-OZbf4JQx2v-lw-VvzrdTsHCORTsf,
 * tx 91671f17a22d16bc64a4b274bce06583ba590aea2353bc4c0475cd37ebde9c72 (lt 111813286000010, utime 1792742091).
 * Values read from toncenter (compute_ph.gas_used, out message BOC, tonapi storage stats and the gap since the previous tx).
 */
export const EXAMPLE = {
  txHash: '91671f17a22d16bc64a4b274bce06583ba590aea2353bc4c0475cd37ebde9c72',
  utime: 1792742091,
  gas: '3308',
  messageBoc: 'te6cckEBBAEA6QABsWgBofjuvnhLbXCaKIJqfHMtv8EoY7X/S4fK351up2DhHIsAOlhmRQDromvjktzoYdZIEnnZwAxcQaMO6OKGcc2bZPQQC+vCAAYDNNoAAMtjHmLrFtW2JZbAAQGoD4p+pX7XQCFSD2X+O28/CACBG0dlFtgMtLJ8IHIk03VVOL8ZXXgY07PhVXdWVTJK1wA0Px3XzwltrhNFEE1PjmW3+CUMdr/pcPlb863U7BwjkUIDAgFOAAAAAFRlbGVncmFtIFByZW1pdW0gZm9yIDMgbW9udGhzIAoKUmVmAwAUI2xVYU5aYkRHSOwyAIo=',
  storageCells: '22',
  storageBits: '5697',
  storageSeconds: '409',
  onChain: { gas: 220534n, fwdTotal: 157601n, fwdAction: 52532n, fwdRemaining: 105069n, storage: 19n }
}
