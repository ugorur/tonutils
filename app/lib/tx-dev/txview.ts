// One display model for a TON transaction, built either from a raw transaction BOC (@ton/core) or from a
// toncenter v3 transaction JSON (indexer and emulator responses share that shape). Pure TS, client/logic only.
import type { Message, Transaction, TransactionComputePhase } from '@ton/core'
import { Address, Cell, loadTransaction } from '@ton/core'
import { decodeBody, parseBoc, type DecodedBody } from '~/utils/ton/messages'

export type AccStatus = 'uninit' | 'active' | 'frozen' | 'nonexist'

export interface MsgView {
  kind: 'internal' | 'external-in' | 'external-out'
  /** Message cell hash, base64 (null when the source does not give it). */
  hash: string | null
  /** Raw `wc:hex` (lowercase), or null (external source / destination). */
  src: string | null
  dest: string | null
  value: bigint | null
  fwdFee: bigint | null
  ihrFee: bigint | null
  importFee: bigint | null
  bounce: boolean | null
  bounced: boolean | null
  createdLt: bigint | null
  createdAt: number | null
  hasInit: boolean
  /** Body as base64 BOC. */
  body: string | null
  decoded: DecodedBody | null
}

export type ComputeView =
  | { skipped: true, reason: string }
  | {
    skipped: false
    success: boolean
    exitCode: number
    exitArg: number | null
    gasUsed: bigint
    gasLimit: bigint
    gasCredit: bigint | null
    gasFees: bigint
    vmSteps: number
    mode: number
    accountActivated: boolean
    msgStateUsed: boolean
  }

export interface ActionView {
  success: boolean
  valid: boolean
  noFunds: boolean
  resultCode: number
  resultArg: number | null
  totalFwdFees: bigint
  totalActionFees: bigint
  totalActions: number
  specActions: number
  skippedActions: number
  msgsCreated: number
  statusChange: string
}

export type BounceView =
  | { type: 'negfunds' }
  | { type: 'nofunds', reqFwdFees: bigint }
  | { type: 'ok', msgFees: bigint, fwdFees: bigint }

export interface TxView {
  /** base64 */
  hash: string
  hashHex: string
  /** Raw `wc:hex`, lowercase. */
  account: string
  lt: bigint
  now: number
  prevLt: bigint
  origStatus: AccStatus
  endStatus: AccStatus
  totalFees: bigint
  /** ord, tick, tock, storage, split_prepare, split_install, merge_prepare, merge_install. */
  type: string
  aborted: boolean
  destroyed: boolean
  creditFirst: boolean | null
  storage: { fees: bigint, due: bigint | null, statusChange: string } | null
  credit: { credit: bigint, dueCollected: bigint | null } | null
  compute: ComputeView | null
  action: ActionView | null
  bounce: BounceView | null
  inMsg: MsgView | null
  outMsgs: MsgView[]
  /** Only when the source reports them (toncenter v3). */
  balanceBefore: bigint | null
  balanceAfter: bigint | null
}

const b64ToHex = (b64: string) => Buffer.from(b64, 'base64').toString('hex')
const big = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : BigInt(v))
const rawLower = (a: string | null | undefined) => (a ? a.toLowerCase() : null)
const safeDecode = (body: string | Cell | null, testOnly: boolean): DecodedBody | null => (body ? decodeBody(body, { testOnly }) : null)

// ---------------------------------------------------------------- from a raw BOC (@ton/core)

const CORE_STATUS: Record<string, AccStatus> = { 'uninitialized': 'uninit', 'active': 'active', 'frozen': 'frozen', 'non-existing': 'nonexist' }

function coreMsg(m: Message, testOnly: boolean): MsgView {
  const i = m.info
  const body = m.body.bits.length || m.body.refs.length ? m.body.toBoc().toString('base64') : null
  const base = {
    hash: null,
    hasInit: !!m.init,
    body,
    decoded: body ? safeDecode(m.body, testOnly) : null
  }
  if (i.type === 'internal') {
    return {
      ...base, kind: 'internal', src: i.src.toRawString(), dest: i.dest.toRawString(), value: i.value.coins,
      fwdFee: i.forwardFee, ihrFee: i.ihrFee, importFee: null, bounce: i.bounce, bounced: i.bounced,
      createdLt: i.createdLt, createdAt: i.createdAt
    }
  }
  if (i.type === 'external-in') {
    return {
      ...base, kind: 'external-in', src: null, dest: i.dest.toRawString(), value: null, fwdFee: null, ihrFee: null,
      importFee: i.importFee, bounce: null, bounced: null, createdLt: null, createdAt: null
    }
  }
  return {
    ...base, kind: 'external-out', src: i.src.toRawString(), dest: null, value: null, fwdFee: null, ihrFee: null,
    importFee: null, bounce: null, bounced: null, createdLt: i.createdLt, createdAt: i.createdAt
  }
}

function coreCompute(c: TransactionComputePhase): ComputeView {
  if (c.type === 'skipped') return { skipped: true, reason: c.reason.replace(/-/g, '_') }
  return {
    skipped: false, success: c.success, exitCode: c.exitCode, exitArg: c.exitArg ?? null, gasUsed: c.gasUsed,
    gasLimit: c.gasLimit, gasCredit: c.gasCredit ?? null, gasFees: c.gasFees, vmSteps: c.vmSteps, mode: c.mode,
    accountActivated: c.accountActivated, msgStateUsed: c.messageStateUsed
  }
}

/** Parses a raw transaction BOC (base64 or hex, or a Cell). Throws a readable Error on anything else. */
export function txFromBoc(input: string | Cell, opts: { testOnly?: boolean } = {}): TxView {
  const cell = typeof input === 'string' ? parseBoc(input) : input
  let tx: Transaction
  try {
    tx = loadTransaction(cell.beginParse())
  }
  catch {
    throw new Error('This BOC is not a transaction. Paste the raw transaction BOC (toncenter v2 getTransactions "data" field), or a transaction hash.')
  }
  return txFromCore(tx, cell, opts.testOnly ?? false)
}

export function txFromCore(tx: Transaction, cell: Cell, testOnly = false): TxView {
  const d = tx.description
  const accountRaw = rawAccount(tx)
  const hash = cell.hash()
  const view: TxView = {
    hash: hash.toString('base64'),
    hashHex: hash.toString('hex'),
    account: accountRaw,
    lt: tx.lt,
    now: tx.now,
    prevLt: tx.prevTransactionLt,
    origStatus: CORE_STATUS[tx.oldStatus] ?? 'nonexist',
    endStatus: CORE_STATUS[tx.endStatus] ?? 'nonexist',
    totalFees: tx.totalFees.coins,
    type: 'ord',
    aborted: false,
    destroyed: false,
    creditFirst: null,
    storage: null,
    credit: null,
    compute: null,
    action: null,
    bounce: null,
    inMsg: tx.inMessage ? coreMsg(tx.inMessage, testOnly) : null,
    outMsgs: tx.outMessages.keys().sort((a, b) => a - b).map(k => coreMsg(tx.outMessages.get(k)!, testOnly)),
    balanceBefore: null,
    balanceAfter: null
  }
  // in_msg is the first ref of the ^[in_msg out_msgs] cell. Out message hashes are left null: re-serializing
  // a parsed Message is not guaranteed to be bit-identical.
  if (view.inMsg) view.inMsg.hash = cell.refs[0]!.refs[0]!.hash().toString('base64')

  const st = 'storagePhase' in d ? d.storagePhase : null
  if (st) view.storage = { fees: st.storageFeesCollected, due: st.storageFeesDue ?? null, statusChange: st.statusChange }
  if ('creditPhase' in d && d.creditPhase) view.credit = { credit: d.creditPhase.credit.coins, dueCollected: d.creditPhase.dueFeesColelcted ?? null }
  if ('computePhase' in d) view.compute = coreCompute(d.computePhase)
  if ('actionPhase' in d && d.actionPhase) {
    const a = d.actionPhase
    view.action = {
      success: a.success, valid: a.valid, noFunds: a.noFunds, resultCode: a.resultCode, resultArg: a.resultArg ?? null,
      totalFwdFees: a.totalFwdFees ?? 0n, totalActionFees: a.totalActionFees ?? 0n, totalActions: a.totalActions,
      specActions: a.specActions, skippedActions: a.skippedActions, msgsCreated: a.messagesCreated, statusChange: a.statusChange
    }
  }
  if ('bouncePhase' in d && d.bouncePhase) {
    const b = d.bouncePhase
    view.bounce = b.type === 'ok'
      ? { type: 'ok', msgFees: b.messageFees, fwdFees: b.forwardFees }
      : b.type === 'no-funds' ? { type: 'nofunds', reqFwdFees: b.requiredForwardFees } : { type: 'negfunds' }
  }
  if ('aborted' in d) view.aborted = d.aborted
  if ('destroyed' in d) view.destroyed = d.destroyed
  if (d.type === 'generic') view.creditFirst = d.creditFirst
  view.type = d.type === 'generic' ? 'ord' : d.type === 'tick-tock' ? (d.isTock ? 'tock' : 'tick') : d.type.replace('-', '_')
  return view
}

/** The account address of a transaction: account_addr is a bare 256-bit hash; the workchain comes from a message. */
function rawAccount(tx: Transaction): string {
  const hex = tx.address.toString(16).padStart(64, '0')
  const m = tx.inMessage
  let wc: number | null = null
  if (m) wc = m.info.dest && Address.isAddress(m.info.dest) ? m.info.dest.workChain : null
  if (wc === null) {
    for (const o of tx.outMessages.values()) {
      if (Address.isAddress(o.info.src)) {
        wc = o.info.src.workChain
        break
      }
    }
  }
  // tick-tock transactions (no messages) only happen on masterchain special accounts
  return `${wc ?? -1}:${hex}`
}

// ---------------------------------------------------------------- from toncenter v3 JSON

export interface V3Msg {
  hash: string
  source: string | null
  destination: string | null
  value: string | null
  fwd_fee: string | null
  ihr_fee: string | null
  import_fee?: string | null
  bounce: boolean | null
  bounced: boolean | null
  created_lt: string | null
  created_at: string | null
  message_content?: { hash?: string, body?: string | null } | null
  init_state?: { hash?: string, body?: string } | null
}

export interface V3Tx {
  account: string
  hash: string
  lt: string
  now: number
  mc_block_seqno?: number | null
  trace_id?: string | null
  prev_trans_hash?: string
  prev_trans_lt: string
  orig_status: AccStatus
  end_status: AccStatus
  total_fees: string
  description: {
    type: string
    aborted?: boolean
    destroyed?: boolean
    credit_first?: boolean
    is_tock?: boolean
    storage_ph?: { storage_fees_collected: string, storage_fees_due?: string, status_change: string }
    credit_ph?: { credit: string, due_fees_collected?: string }
    compute_ph?: {
      skipped: boolean
      reason?: string
      success?: boolean
      exit_code?: number
      exit_arg?: number
      gas_used?: string
      gas_limit?: string
      gas_credit?: string
      gas_fees?: string
      vm_steps?: number
      mode?: number
      account_activated?: boolean
      msg_state_used?: boolean
    }
    action?: {
      success: boolean
      valid: boolean
      no_funds: boolean
      result_code: number
      result_arg?: number
      total_fwd_fees?: string
      total_action_fees?: string
      tot_actions: number
      spec_actions: number
      skipped_actions: number
      msgs_created: number
      status_change: string
    }
    bounce?: { type: string, req_fwd_fees?: string, msg_fees?: string, fwd_fees?: string }
  }
  block_ref?: { workchain: number, shard: string, seqno: number } | null
  in_msg: V3Msg | null
  out_msgs: V3Msg[]
  account_state_before?: { balance?: string | null, code_hash?: string | null } | null
  account_state_after?: { balance?: string | null, code_hash?: string | null } | null
  emulated?: boolean
}

function v3Msg(m: V3Msg, testOnly: boolean): MsgView {
  const kind: MsgView['kind'] = m.source === null || m.source === '' ? 'external-in' : m.destination === null || m.destination === '' ? 'external-out' : 'internal'
  const body = m.message_content?.body ?? null
  return {
    kind,
    hash: m.hash,
    src: rawLower(m.source),
    dest: rawLower(m.destination),
    value: kind === 'internal' ? big(m.value) : null,
    fwdFee: kind === 'internal' ? big(m.fwd_fee) : null,
    ihrFee: kind === 'internal' ? big(m.ihr_fee) : null,
    importFee: kind === 'external-in' ? big(m.import_fee) ?? 0n : null,
    bounce: kind === 'internal' ? m.bounce : null,
    bounced: kind === 'internal' ? m.bounced : null,
    createdLt: big(m.created_lt),
    createdAt: m.created_at ? Number(m.created_at) : null,
    hasInit: !!m.init_state,
    body: body && !isEmptyCellBoc(body) ? body : null,
    decoded: body && !isEmptyCellBoc(body) ? safeDecode(body, testOnly) : null
  }
}

function isEmptyCellBoc(b64: string): boolean {
  try {
    const c = Cell.fromBase64(b64)
    return c.bits.length === 0 && c.refs.length === 0
  }
  catch {
    return false
  }
}

export function txFromV3(t: V3Tx, testOnly = false): TxView {
  const d = t.description
  const c = d.compute_ph
  const a = d.action
  const b = d.bounce
  const type = d.type === 'tick_tock' ? (d.is_tock ? 'tock' : 'tick') : d.type
  return {
    hash: t.hash,
    hashHex: b64ToHex(t.hash),
    account: t.account.toLowerCase(),
    lt: BigInt(t.lt),
    now: t.now,
    prevLt: BigInt(t.prev_trans_lt ?? 0),
    origStatus: t.orig_status,
    endStatus: t.end_status,
    totalFees: BigInt(t.total_fees),
    type,
    aborted: d.aborted ?? false,
    destroyed: d.destroyed ?? false,
    creditFirst: d.credit_first ?? null,
    storage: d.storage_ph ? { fees: BigInt(d.storage_ph.storage_fees_collected), due: big(d.storage_ph.storage_fees_due), statusChange: d.storage_ph.status_change } : null,
    credit: d.credit_ph ? { credit: BigInt(d.credit_ph.credit), dueCollected: big(d.credit_ph.due_fees_collected) } : null,
    compute: !c
      ? null
      : c.skipped
        ? { skipped: true, reason: c.reason ?? 'unknown' }
        : {
            skipped: false, success: !!c.success, exitCode: c.exit_code ?? 0, exitArg: c.exit_arg ?? null,
            gasUsed: BigInt(c.gas_used ?? 0), gasLimit: BigInt(c.gas_limit ?? 0), gasCredit: big(c.gas_credit),
            gasFees: BigInt(c.gas_fees ?? 0), vmSteps: c.vm_steps ?? 0, mode: c.mode ?? 0,
            accountActivated: !!c.account_activated, msgStateUsed: !!c.msg_state_used
          },
    action: a
      ? {
          success: a.success, valid: a.valid, noFunds: a.no_funds, resultCode: a.result_code, resultArg: a.result_arg ?? null,
          totalFwdFees: BigInt(a.total_fwd_fees ?? 0), totalActionFees: BigInt(a.total_action_fees ?? 0),
          totalActions: a.tot_actions, specActions: a.spec_actions, skippedActions: a.skipped_actions,
          msgsCreated: a.msgs_created, statusChange: a.status_change
        }
      : null,
    bounce: b
      ? b.type === 'ok'
        ? { type: 'ok', msgFees: BigInt(b.msg_fees ?? 0), fwdFees: BigInt(b.fwd_fees ?? 0) }
        : b.type === 'nofunds' ? { type: 'nofunds', reqFwdFees: BigInt(b.req_fwd_fees ?? 0) } : { type: 'negfunds' }
      : null,
    inMsg: t.in_msg ? v3Msg(t.in_msg, testOnly) : null,
    outMsgs: [...t.out_msgs].sort((x, y) => (BigInt(x.created_lt ?? 0) < BigInt(y.created_lt ?? 0) ? -1 : 1)).map(m => v3Msg(m, testOnly)),
    balanceBefore: big(t.account_state_before?.balance),
    balanceAfter: big(t.account_state_after?.balance)
  }
}

// ---------------------------------------------------------------- derived values

export interface FeeBreakdown {
  storage: bigint
  gas: bigint
  /** Part of the forwarding fees kept by validators for sending messages (action phase). */
  action: bigint
  /** Fee to send the bounced message back (bounce phase). */
  bounce: bigint
  /** Rest of total_fees: mostly the import fee of an inbound external message. */
  other: bigint
  total: bigint
  /** Forwarding fees attached to outbound messages (paid on top, not part of total_fees). */
  outForward: bigint
}

export function feeBreakdown(v: TxView): FeeBreakdown {
  const storage = v.storage?.fees ?? 0n
  const gas = v.compute && !v.compute.skipped ? v.compute.gasFees : 0n
  const action = v.action?.totalActionFees ?? 0n
  const bounce = v.bounce?.type === 'ok' ? v.bounce.msgFees : 0n
  const outForward = v.outMsgs.reduce((s, m) => s + (m.fwdFee ?? 0n) + (m.ihrFee ?? 0n), 0n)
  return { storage, gas, action, bounce, other: v.totalFees - storage - gas - action - bounce, total: v.totalFees, outForward }
}

/**
 * Balance change of the account in nanoGRAM. Uses the reported before/after balances when present, otherwise
 * incoming value - total fees - (value + forwarding fees of every outbound internal message).
 */
export function balanceChange(v: TxView): bigint {
  if (v.balanceBefore !== null && v.balanceAfter !== null) return v.balanceAfter - v.balanceBefore
  const credit = v.inMsg?.kind === 'internal' ? v.inMsg.value ?? 0n : 0n
  const out = v.outMsgs.reduce((s, m) => s + (m.value ?? 0n) + (m.fwdFee ?? 0n) + (m.ihrFee ?? 0n), 0n)
  return credit - v.totalFees - out
}

/** Overall verdict for headers: did the transaction do what its message asked? */
export function txOutcome(v: TxView): { ok: boolean, label: string } {
  if (v.compute?.skipped) return { ok: false, label: `Compute skipped (${v.compute.reason.replace(/_/g, ' ')})` }
  if (v.compute && !v.compute.success) return { ok: false, label: `Failed: exit code ${v.compute.exitCode}` }
  if (v.action && !v.action.success) return { ok: false, label: `Action phase failed: result code ${v.action.resultCode}` }
  if (v.aborted) return { ok: false, label: 'Aborted' }
  return { ok: true, label: 'Success' }
}

export const STATUS_LABEL: Record<AccStatus, string> = { uninit: 'Uninitialized', active: 'Active', frozen: 'Frozen', nonexist: 'Does not exist' }

export const SKIP_REASON: Record<string, string> = {
  no_state: 'The account has no code yet (not deployed) and the message brought no StateInit',
  bad_state: 'The StateInit in the message does not match the account address',
  no_gas: 'Not enough value to buy even the minimum gas',
  suspended: 'The account is suspended'
}

// ---------------------------------------------------------------- decoded body rows (same layout as TxPreview)

/** Fields holding nanoGRAM (other amounts are jetton units with unknown decimals). */
const COIN_FIELDS = new Set(['forward_ton_amount', 'forward_amount', 'ton_amount'])

export interface BodyRow { label: string, value: string, coin?: bigint }

export function bodyRows(body: DecodedBody, prefix = ''): BodyRow[] {
  return Object.entries(body.fields).flatMap(([k, v]): BodyRow[] => {
    const label = prefix + k.replace(/_/g, ' ')
    if (v && typeof v === 'object') return [{ label, value: v.title }, ...bodyRows(v, `${label} › `)]
    if (typeof v === 'bigint' && COIN_FIELDS.has(k)) return [{ label, value: '', coin: v }]
    if (k === 'amount' && typeof v === 'bigint') return [{ label: `${label} (token base units)`, value: v.toString() }]
    return [{ label, value: v === null ? '—' : String(v) }]
  })
}
