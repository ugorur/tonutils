import type { Cell } from '@ton/core'
import { decodeParam, duration, frac16, perYear } from '~/lib/network/config'
import { formatCoin } from '~/utils/currency'

/** limited: the API answered 429, i.e. this visitor's IP is over the keyless quota; the API itself is up. */
export type Health = 'ok' | 'lagging' | 'down' | 'limited'

/** A public API is "lagging" when its newest masterchain block is older than this. */
export const LAG_SECONDS = 30

export function health(ageSec: number | null, failed: boolean, rateLimited = false): Health {
  if (rateLimited) return 'limited'
  if (failed) return 'down'
  return ageSec !== null && ageSec > LAG_SECONDS ? 'lagging' : 'ok'
}

/** Average gap between consecutive block timestamps (seconds); null with fewer than two blocks. */
export function avgInterval(utimes: number[]): number | null {
  if (utimes.length < 2) return null
  return (Math.max(...utimes) - Math.min(...utimes)) / (utimes.length - 1)
}

/** 3 → "3 s ago", 125 → "2 min ago". */
export function ago(sec: number): string {
  if (sec < 1) return 'just now'
  if (sec < 90) return `${Math.round(sec)} s ago`
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`
  return `${Math.round(sec / 3600)} h ago`
}

export interface Highlight { label: string, value: string, hint?: string }

const YEAR = 365 * 86400

/** The config values people ask about most, from a full config (param id → cell). Missing params are skipped. */
export function highlights(cfg: Map<number, Cell>, now = Math.floor(Date.now() / 1000)): Highlight[] {
  const j = <T>(id: number) => (cfg.has(id) ? (decodeParam(id, cfg.get(id)!).json as T) : null)
  const out: Highlight[] = []

  const v = j<{ version: number, capabilities: bigint }>(8)
  if (v) out.push({ label: 'Protocol version', value: String(v.version), hint: `Capabilities 0x${v.capabilities.toString(16)} (config param 8)` })

  const gas = j<{ flatLimit: bigint, flatGasPrice: bigint, other: { gasPrice: bigint, gasLimit: bigint } }>(21)
  if (gas) {
    out.push({
      label: 'Gas price (basechain)',
      value: `${frac16(gas.other.gasPrice)} nano per gas`,
      hint: `1M gas ≈ ${formatCoin(gas.other.gasPrice * 1_000_000n / 65536n, { maxDecimals: 4 })}; max ${Number(gas.other.gasLimit).toLocaleString('en-US')} gas per transaction (param 21)`
    })
  }
  const fwd = j<{ lumpPrice: bigint, cellPrice: bigint }>(25)
  if (fwd) out.push({ label: 'Message forward fee', value: `from ${formatCoin(fwd.lumpPrice)}`, hint: `Plus ${frac16(fwd.cellPrice)} nano per extra cell (param 25)` })

  const st = j<{ utime_since: number, cell_price_ps: bigint, bit_price_ps: bigint }[]>(18)
  if (st?.length) {
    const cur = [...st].reverse().find(p => p.utime_since <= now) ?? st[0]!
    const cellYear = (cur.cell_price_ps * BigInt(YEAR)) / 65536n
    out.push({ label: 'Storage fee', value: `${formatCoin(cellYear, { maxDecimals: 6 })} per cell per year`, hint: `Basechain, plus ${perYear(cur.bit_price_ps)} nano per bit per year (param 18)` })
  }

  const t15 = j<{ validatorsElectedFor: number }>(15)
  const vset = j<{ total: number, main: number, timeUntil: number }>(34)
  if (vset) out.push({ label: 'Validators', value: `${vset.total} (${vset.main} on the masterchain)`, hint: t15 ? `Round length ${duration(t15.validatorsElectedFor)} (params 34, 15)` : 'Param 34' })
  const stake = j<{ minStake: bigint }>(17)
  if (stake) out.push({ label: 'Minimum validator stake', value: formatCoin(stake.minStake, { maxDecimals: 0 }), hint: 'Param 17; the real entry stake is set by each election.' })

  const wc = j<Record<string, { max_split: number }>>(12)
  if (wc?.['0']) out.push({ label: 'Basechain max shards', value: String(2 ** wc['0'].max_split), hint: 'Param 12' })
  return out
}
