import { Cell } from '@ton/core'
import { sameAddress } from '~/lib/jettons-read/core'

// Governed jettons (ton-blockchain/stablecoin-contract, used by USD₮): jetton-wallet.fc stores `status:uint4`.
// status & 1 = outgoing transfers locked, status & 2 = incoming transfers locked. The master can still
// transfer or burn from a locked wallet. The admin changes it with set_status, sent through the master.
export const OP_SET_STATUS = 0xeed236d3

export interface StatusInfo {
  status: number
  canSend: boolean
  canReceive: boolean
  title: string
  color: 'success' | 'warning' | 'error'
  text: string
}

export function statusInfo(status: number): StatusInfo {
  const canSend = (status & 1) === 0
  const canReceive = (status & 2) === 0
  if (canSend && canReceive) return { status, canSend, canReceive, title: 'Not locked', color: 'success', text: 'This wallet can send and receive the token normally.' }
  if (!canSend && !canReceive) return { status, canSend, canReceive, title: 'Fully locked', color: 'error', text: 'The issuer locked this wallet: it can neither send nor receive the token. The balance stays on-chain, but only the issuer can move it.' }
  if (!canSend) return { status, canSend, canReceive, title: 'Sending locked', color: 'error', text: 'The issuer locked outgoing transfers: this wallet cannot send the token, though it can still receive it. Any transfer you try will fail.' }
  return { status, canSend, canReceive, title: 'Receiving locked', color: 'warning', text: 'The issuer locked incoming transfers: this wallet cannot receive the token, but it can still send it. Tokens sent to it bounce back to the sender.' }
}

/** set_status#eed236d3 query_id:uint64 status:uint4. Returns null for anything else. */
export function decodeSetStatus(body: string | Cell): number | null {
  try {
    const s = (typeof body === 'string' ? Cell.fromBase64(body) : body).beginParse()
    if (s.loadUint(32) !== OP_SET_STATUS) return null
    s.loadUintBig(64)
    return s.loadUint(4)
  }
  catch {
    return null
  }
}

/** toncenter v3 /messages item (fields we use). */
export interface ToncenterMessage {
  hash: string
  source: string | null
  destination: string | null
  created_at: string
  in_msg_tx_hash?: string | null
  message_content?: { body?: string } | null
}

export interface LockEvent {
  time: number
  status: number
  txHash?: string
}

/** set_status messages that came from the token master, newest first. Messages from anyone else are ignored by the wallet. */
export function lockEvents(messages: ToncenterMessage[], masterRaw: string): LockEvent[] {
  const out: LockEvent[] = []
  for (const m of messages) {
    if (!sameAddress(m.source, masterRaw) || !m.message_content?.body) continue
    const status = decodeSetStatus(m.message_content.body)
    if (status === null) continue
    out.push({ time: Number(m.created_at), status, txHash: m.in_msg_tx_hash ?? undefined })
  }
  return out.sort((a, b) => b.time - a.time)
}

/** tonapi get-method result: `decoded.status` when tonapi knows the ABI, else the first stack number. */
export function readStatus(r: { success: boolean, exit_code: number, stack?: { type: string, num?: string }[], decoded?: { status?: number } }): number | null {
  if (!r.success || (r.exit_code !== 0 && r.exit_code !== 1)) return null
  if (typeof r.decoded?.status === 'number') return r.decoded.status
  const n = r.stack?.[0]
  return n?.type === 'num' && n.num !== undefined ? Number(BigInt(n.num)) : null
}
