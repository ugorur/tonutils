// toncenter v2 runGetMethod: POST with an optional historic `seqno` (v3 ignores it), and a walker
// that turns its stack into plain values. Pure TS, no Vue.
import { rateLimitedJson } from '~/utils/api-client'

/** int → bigint, cell/slice → base64 BOC string, tuple/list → array, null → null. */
export type StackValue = bigint | string | null | StackValue[]

type V2Entry = { '@type'?: string, [k: string]: unknown }

function nested(e: V2Entry): StackValue {
  switch (e['@type']) {
    case 'tvm.stackEntryNumber': return BigInt((e.number as { number: string }).number)
    case 'tvm.stackEntryCell': return (e.cell as { bytes: string }).bytes
    case 'tvm.stackEntrySlice': return (e.slice as { bytes: string }).bytes
    case 'tvm.stackEntryTuple': return (e.tuple as { elements: V2Entry[] }).elements.map(nested)
    case 'tvm.stackEntryList': return (e.list as { elements: V2Entry[] }).elements.map(nested)
    default: return null
  }
}

/** Top level entries are `[type, value]` pairs ("num" is hex); nested ones are typed objects. */
export function fromV2Stack(stack: unknown[]): StackValue[] {
  return stack.map((entry) => {
    const [type, value] = entry as [string, unknown]
    if (type === 'num') {
      const s = String(value)
      return s.startsWith('-') ? -BigInt(s.slice(1)) : BigInt(s)
    }
    if (type === 'cell' || type === 'slice') return (value as { bytes: string }).bytes
    if (type === 'list' || type === 'tuple') return (value as { elements: V2Entry[] }).elements.map(nested)
    return null
  })
}

export interface GetResult { exitCode: number, stack: StackValue[], seqno: number }

/** Runs a no-argument get-method through toncenter v2. `base` is useToncenter().baseUrl(). */
export async function runGetV2(base: string, address: string, method: string, seqno?: number): Promise<GetResult> {
  const res = await rateLimitedJson<{ ok: boolean, error?: string, result: { exit_code: number, stack: unknown[], block_id: { seqno: number } } }>(
    `${base}/v2/runGetMethod`,
    { provider: 'toncenter' },
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, method, stack: [], ...(seqno ? { seqno } : {}) }) }
  )
  if (!res.ok) throw new Error(res.error ?? `${method} failed`)
  return { exitCode: res.result.exit_code, stack: fromV2Stack(res.result.stack), seqno: res.result.block_id.seqno }
}
