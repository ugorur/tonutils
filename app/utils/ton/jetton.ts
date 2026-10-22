// Jetton amounts (decimals-aware, exact bigint math) and a short list of well-known mainnet jettons.
// Pure TS, no @ton/* imports: safe anywhere.
import { formatAmount, parseUnits } from '../units'

/** TEP-64: decimals default to 9 when metadata omits them. */
export const DEFAULT_JETTON_DECIMALS = 9

/** "12.5" with 6 decimals -> 12500000n. Throws Error with a readable message. */
export function parseJettonAmount(input: string, decimals = DEFAULT_JETTON_DECIMALS): bigint {
  return parseUnits(input, decimals)
}

export interface FormatJettonOptions {
  /** Appended after a space, e.g. 'USD₮'. */
  symbol?: string
  /** Thousands separators (default true). */
  group?: boolean
  /** Truncate to at most this many decimals. */
  maxDecimals?: number
}

/** 12500000n with 6 decimals -> "12.5" (or "12.5 USD₮" with a symbol). */
export function formatJettonAmount(units: bigint, decimals = DEFAULT_JETTON_DECIMALS, opts: FormatJettonOptions = {}): string {
  const s = formatAmount(units, decimals, opts)
  return opts.symbol ? `${s} ${opts.symbol}` : s
}

/** Reads decimals from TEP-64 metadata ({ decimals: "6" } or 6); falls back to 9. */
export function jettonDecimals(metadata: { decimals?: string | number | null } | null | undefined): number {
  const n = Number(metadata?.decimals ?? DEFAULT_JETTON_DECIMALS)
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : DEFAULT_JETTON_DECIMALS
}

export interface KnownJetton {
  symbol: string
  name: string
  decimals: number
  /** Jetton master, mainnet, bounceable user-friendly form. */
  master: string
}

/** Mainnet masters; symbol/name/decimals verified with toncenter v3 /metadata on 2026-10-22. */
export const KNOWN_JETTONS: readonly KnownJetton[] = [
  { symbol: 'USD₮', name: 'Tether USD', decimals: 6, master: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
  { symbol: 'NOT', name: 'Notcoin', decimals: 9, master: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT' },
  { symbol: 'DOGS', name: 'Dogs', decimals: 9, master: 'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS' },
  { symbol: 'STON', name: 'STON', decimals: 9, master: 'EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO' },
  { symbol: 'tsTON', name: 'Tonstakers TON', decimals: 9, master: 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav' },
  { symbol: 'stGRAM', name: 'Staked GRAM (bemo)', decimals: 9, master: 'EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k' },
  { symbol: 'hGRAM', name: 'Hipo Staked GRAM', decimals: 9, master: 'EQDPdq8xjAhytYqfGSX8KcFWIReCufsB9Wdg0pLlYSO_h76w' }
]

export const USDT_MASTER = KNOWN_JETTONS[0]!.master
