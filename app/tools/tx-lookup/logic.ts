// toncenter v3 /traces -> a readable trace tree with per-step status, exit-code explanations and fees.
import type { ExitInfo } from '~/lib/tx-user/exit-codes'
import { explainExitCode } from '~/lib/tx-user/exit-codes'
import { txHashHex } from '~/utils/ton/explorers'

export interface TcMessage {
  hash: string
  source: string | null
  destination: string | null
  value: string | null
  fwd_fee?: string | null
  opcode?: string | null
  decoded_opcode?: string | null
  bounce?: boolean | null
  bounced?: boolean | null
  created_at?: string | null
  message_content?: { body?: string, decoded?: { '@type'?: string, comment?: string } | null } | null
}

export interface TcTransaction {
  account: string
  hash: string
  lt: string
  now: number
  total_fees: string
  orig_status?: string
  end_status?: string
  description: {
    type?: string
    aborted: boolean
    destroyed?: boolean
    compute_ph?: { skipped: boolean, reason?: string, success?: boolean, exit_code?: number, gas_used?: string, gas_fees?: string }
    action?: { success: boolean, valid?: boolean, no_funds?: boolean, result_code: number, msgs_created?: number }
    bounce?: { type: string }
  }
  in_msg: TcMessage | null
  out_msgs: TcMessage[]
}

export interface TcTraceNode {
  tx_hash: string
  in_msg_hash?: string
  children: TcTraceNode[]
}

export interface TcTrace {
  trace_id: string
  external_hash: string | null
  start_utime: number
  end_utime: number
  is_incomplete: boolean
  trace_info: { trace_state: string, messages: number, transactions: number, pending_messages: number }
  trace: TcTraceNode
  transactions: Record<string, TcTransaction>
}

export interface TcTracesResponse {
  traces: TcTrace[]
  address_book: Record<string, { user_friendly: string, domain: string | null, interfaces?: string[] }>
}

export type StepStatus = 'ok' | 'failed' | 'skipped'

export interface Step {
  hash: string
  hashHex: string
  account: string
  accountFriendly: string
  domain: string | null
  interfaces: string[]
  depth: number
  time: number
  /** 'external' for the signed message that started the trace. */
  inKind: 'external' | 'internal' | 'none'
  opName: string
  opcode: string | null
  value: bigint
  comment?: string
  bouncedIn: boolean
  fees: bigint
  status: StepStatus
  /** Plain-language reason for a failed or skipped step. */
  problem?: string
  compute?: ExitInfo
  action?: ExitInfo
  /** A failed step whose incoming message was bounceable sends the value back. */
  bounces: boolean
  children: Step[]
}

export interface TraceSummary {
  traceId: string
  externalHash: string | null
  time: number
  state: 'complete' | 'pending'
  status: 'success' | 'failed' | 'partial' | 'pending'
  txCount: number
  totalFees: bigint
  root: Step
  failures: Step[]
  rootTxHex: string
}

const SKIP_REASONS: Record<string, string> = {
  no_state: 'The account is not deployed, so the bounceable message was returned to the sender.',
  bad_state: 'The account state is invalid or did not match the attached state init.',
  no_gas: 'Not enough value to pay for any computation.',
  suspended: 'The account is suspended.'
}

function opLabel(m: TcMessage | null): string {
  if (!m) return 'No incoming message'
  if (!m.source) return 'External message (signed by the wallet owner)'
  if (m.bounced) return 'Bounced message (value returned)'
  if (m.decoded_opcode) return m.decoded_opcode.replace(/_/g, ' ')
  if (!m.opcode || m.opcode === '0x00000000') return 'Plain transfer'
  return `Operation ${m.opcode}`
}

function buildStep(node: TcTraceNode, resp: TcTracesResponse, trace: TcTrace, depth: number): Step {
  const tx = trace.transactions[node.tx_hash]!
  const book = resp.address_book[tx.account]
  const interfaces = book?.interfaces ?? []
  const d = tx.description
  const c = d.compute_ph
  const a = d.action
  const m = tx.in_msg

  const compute = c && !c.skipped && c.exit_code !== undefined ? explainExitCode(c.exit_code, 'compute', interfaces) : undefined
  const action = a ? explainExitCode(a.result_code, 'action', interfaces) : undefined

  let status: StepStatus = 'ok'
  let problem: string | undefined
  if (c?.skipped) {
    // A non-bounceable transfer to an undeployed account is normal: the value is just credited.
    // Same for a notification carrying too little value to run any code (e.g. 1 nano forward amount).
    const credited = (c.reason === 'no_state' || c.reason === 'no_gas') && !m?.bounce
    status = credited ? 'skipped' : 'failed'
    problem = credited
      ? (c.reason === 'no_state'
          ? 'Account not deployed yet: no code ran and the value was credited to it (normal for a first transfer to a new wallet).'
          : 'Too little value attached to run any code; the value was credited. Normal for notifications with a tiny forward amount.')
      : SKIP_REASONS[c.reason ?? ''] ?? `Computation skipped (${c.reason ?? 'unknown reason'}).`
  }
  else if (compute && !compute.ok) {
    status = 'failed'
    problem = `Exit code ${compute.code}: ${compute.title}`
  }
  else if (a && !a.success) {
    status = 'failed'
    problem = `Action phase code ${a.result_code}: ${action?.title}${a.no_funds ? ' (not enough funds)' : ''}`
  }
  else if (d.aborted) {
    status = 'failed'
    problem = 'Transaction aborted.'
  }

  const comment = m?.message_content?.decoded?.['@type'] === 'text_comment' ? m.message_content.decoded.comment : undefined

  return {
    hash: tx.hash,
    hashHex: txHashHex(tx.hash),
    account: tx.account,
    accountFriendly: book?.user_friendly ?? tx.account,
    domain: book?.domain ?? null,
    interfaces,
    depth,
    time: tx.now,
    inKind: !m ? 'none' : m.source ? 'internal' : 'external',
    opName: opLabel(m),
    opcode: m?.opcode ?? null,
    value: BigInt(m?.value ?? 0),
    comment,
    bouncedIn: !!m?.bounced,
    fees: BigInt(tx.total_fees ?? 0),
    status,
    problem,
    compute,
    action,
    bounces: status === 'failed' && !!m?.bounce && !!m.source,
    children: node.children.map(ch => buildStep(ch, resp, trace, depth + 1))
  }
}

export function flatten(s: Step): Step[] {
  return [s, ...s.children.flatMap(flatten)]
}

export function summarizeTrace(resp: TcTracesResponse): TraceSummary | null {
  const trace = resp.traces[0]
  if (!trace) return null
  const root = buildStep(trace.trace, resp, trace, 0)
  const all = flatten(root)
  const failures = all.filter(s => s.status === 'failed')
  const pending = trace.is_incomplete || trace.trace_info.trace_state !== 'complete'
  return {
    traceId: trace.trace_id,
    externalHash: trace.external_hash,
    time: trace.start_utime,
    state: pending ? 'pending' : 'complete',
    status: pending ? 'pending' : root.status === 'failed' ? 'failed' : failures.length ? 'partial' : 'success',
    txCount: all.length,
    totalFees: all.reduce((s, x) => s + x.fees, 0n),
    root,
    failures,
    rootTxHex: root.hashHex
  }
}

export function stepCount(s: Step): number {
  return flatten(s).length
}

/** Interface ids like "wallet_v5r1" / "jetton_wallet_governed" -> "Wallet v5r1" / "Jetton wallet governed". */
export function interfaceLabel(interfaces: string[]): string {
  const i = interfaces[0]
  if (!i) return ''
  const s = i.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
