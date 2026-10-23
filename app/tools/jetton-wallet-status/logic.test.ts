import { describe, expect, it } from 'vitest'
import type { ToncenterMessage } from './logic'
import { decodeSetStatus, lockEvents, readStatus, statusInfo } from './logic'

const USDT = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
// Real set_status bodies sent by the USD₮ master, from toncenter GET /api/v3/messages?opcode=0xeed236d3&source=<USD₮ master>
// (2026-10-22). toncenter's own decoder reports `"decoded": {"@type": "jetton_set_status", "status": "1"}` for LOCK.
const LOCK = 'te6cckEBAQEADwAAGe7SNtMAAAAAAAAAABitdJ2Z'
const UNLOCK = 'te6cckEBAQEADwAAGe7SNtMAAAAAAAAAAAjCs8OJ'

// Messages to USD₮ jetton wallet 0:8B7F3C24…5D5F: locked 2026-01-20, unlocked 2026-03-24. tonapi get_status on it now returns 0.
const WALLET_8B7F: ToncenterMessage[] = [
  { hash: 'fRclOn4Lg8AwqXPI0+SNNWEqgoOsuKT6fXGmAhv80RU=', source: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE', destination: '0:8B7F3C2491E0B89C6EB96078316B0BAA753DED60149EE0A226BD16DC4FFE5D5F', created_at: '1768940657', in_msg_tx_hash: 'BmUsWXuHM7ZdaLpXLoKIiGhIz6CkyzFu4paxPlg5S1I=', message_content: { body: LOCK } },
  { hash: 'W/dGIcyUIwRZuBML7GRRpmfekMyO6U/e6LeNiecu6cY=', source: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE', destination: '0:8B7F3C2491E0B89C6EB96078316B0BAA753DED60149EE0A226BD16DC4FFE5D5F', created_at: '1774374523', in_msg_tx_hash: 'UZYfGn6CwKc4JmkTGxyDHDzMBkGJowwZOHBvuqq2xtE=', message_content: { body: UNLOCK } }
]

describe('decodeSetStatus', () => {
  it('reads the new status from real set_status bodies', () => {
    expect(decodeSetStatus(LOCK)).toBe(1)
    expect(decodeSetStatus(UNLOCK)).toBe(0)
  })
  it('returns null for other bodies', () => {
    // plain text comment "hello" (op 0 + text)
    expect(decodeSetStatus('te6cckEBAQEACwAAEgAAAABoZWxsb5oNank=')).toBeNull()
    expect(decodeSetStatus('not a boc')).toBeNull()
  })
})

describe('lockEvents', () => {
  it('lists lock/unlock from the master, newest first, and ignores other senders', () => {
    const fake: ToncenterMessage = { ...WALLET_8B7F[0]!, hash: 'x', source: '0:1111111111111111111111111111111111111111111111111111111111111111', created_at: '1790000000' }
    const ev = lockEvents([...WALLET_8B7F, fake], USDT)
    expect(ev).toEqual([
      { time: 1774374523, status: 0, txHash: 'UZYfGn6CwKc4JmkTGxyDHDzMBkGJowwZOHBvuqq2xtE=' },
      { time: 1768940657, status: 1, txHash: 'BmUsWXuHM7ZdaLpXLoKIiGhIz6CkyzFu4paxPlg5S1I=' }
    ])
  })
})

describe('readStatus + statusInfo', () => {
  it('reads tonapi get_status results', () => {
    // tonapi GET /v2/blockchain/accounts/0:78D61B24…40E6/methods/get_status (locked by Tether 2026-08-21)
    expect(readStatus({ success: true, exit_code: 0, stack: [{ type: 'num', num: '0x1' }], decoded: { status: 1 } })).toBe(1)
    expect(readStatus({ success: true, exit_code: 0, stack: [{ type: 'num', num: '0x3' }] })).toBe(3)
    // a standard (non-governed) jetton wallet has no get_status: exit code 11
    expect(readStatus({ success: false, exit_code: 11 })).toBeNull()
  })
  it('explains every status bit combination (stablecoin-contract jetton-wallet.fc)', () => {
    expect(statusInfo(0)).toMatchObject({ canSend: true, canReceive: true, title: 'Not locked' })
    expect(statusInfo(1)).toMatchObject({ canSend: false, canReceive: true, title: 'Sending locked' })
    expect(statusInfo(2)).toMatchObject({ canSend: true, canReceive: false, title: 'Receiving locked' })
    expect(statusInfo(3)).toMatchObject({ canSend: false, canReceive: false, title: 'Fully locked' })
  })
})
