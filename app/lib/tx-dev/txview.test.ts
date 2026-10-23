import { describe, expect, it } from 'vitest'
import { describeExitCode, describeResultCode } from './exitCodes'
import fx from './fixtures/transactions.json'
import { balanceChange, feeBreakdown, txFromBoc, txFromV3, txOutcome, type TxView, type V3Tx } from './txview'

// Every vector is a real mainnet transaction: `raw` is the BOC from toncenter v2 getTransactions and `v3` is the
// independently indexed JSON from toncenter v3 /transactions. The BOC parser must agree with the indexer.
const cases = ['walletV4', 'walletV4Excess', 'usdtMasterExit9', 'jettonWalletLib', 'bounced'] as const

/** Fields both sources carry, for comparison. */
function comparable(v: TxView) {
  return {
    hash: v.hash, account: v.account, lt: v.lt, now: v.now, prevLt: v.prevLt, origStatus: v.origStatus, endStatus: v.endStatus,
    totalFees: v.totalFees, type: v.type, aborted: v.aborted, destroyed: v.destroyed, creditFirst: v.creditFirst,
    storage: v.storage, credit: v.credit, compute: v.compute, action: v.action, bounce: v.bounce,
    inMsg: v.inMsg && { ...v.inMsg, decoded: v.inMsg.decoded?.name, hash: v.inMsg.hash },
    outMsgs: v.outMsgs.map(m => ({ ...m, hash: null, decoded: m.decoded?.name }))
  }
}

describe('txFromBoc vs toncenter v3', () => {
  it.each(cases)('%s: raw BOC parse matches the indexer', (name) => {
    const c = fx[name]
    const fromBoc = txFromBoc(c.raw)
    const fromV3 = txFromV3(c.v3 as unknown as V3Tx)
    expect(comparable(fromBoc)).toEqual(comparable(fromV3))
  })
})

describe('known values (toncenter v3 JSON)', () => {
  it('wallet v4 external: phases, fees and the jetton transfer it sent', () => {
    const v = txFromBoc(fx.walletV4.raw)
    expect(v.hash).toBe('Jg0+MZwYxsr75K7jOEcvc900uBDcYQBO5rG4oWQ8qkQ=')
    expect(v.account).toBe('0:e16fd1e37c855ed15fa1ba73dd4a13f032aeb2155fcf65d8986d18a6166b3cf8')
    expect(v.inMsg?.kind).toBe('external-in')
    expect(v.compute).toMatchObject({ skipped: false, success: true, exitCode: 0, gasUsed: 3308n, vmSteps: 68, gasFees: 220534n, gasCredit: 10000n })
    expect(v.action).toMatchObject({ success: true, resultCode: 0, msgsCreated: 1, totalFwdFees: 118134n, totalActionFees: 39377n })
    expect(v.outMsgs).toHaveLength(1)
    expect(v.outMsgs[0]).toMatchObject({ kind: 'internal', value: 80238329n, fwdFee: 78757n, bounce: true })
    expect(v.outMsgs[0]!.decoded?.name).toBe('jetton_transfer')
    const f = feeBreakdown(v)
    expect(f.storage + f.gas + f.action + f.other).toBe(460742n)
    // toncenter v2 reports fee = total_fees + out forward fee = 539499
    expect(f.total + f.outForward).toBe(539499n)
    // out msg forward fee + action fee = total_fwd_fees
    expect(v.outMsgs[0]!.fwdFee! + v.action!.totalActionFees).toBe(v.action!.totalFwdFees)
    expect(txOutcome(v)).toEqual({ ok: true, label: 'Success' })
  })

  it('aborted USDT master tx: exit code 9, nothing sent, balance change = credit - fees', () => {
    const v = txFromBoc(fx.usdtMasterExit9.raw)
    expect(v.aborted).toBe(true)
    expect(v.compute).toMatchObject({ success: false, exitCode: 9, gasUsed: 1030n, vmSteps: 27 })
    expect(v.outMsgs).toHaveLength(0)
    // v3 account_state_after.balance - account_state_before.balance
    const v3 = fx.usdtMasterExit9.v3
    expect(balanceChange(v)).toBe(BigInt(v3.account_state_after.balance) - BigInt(v3.account_state_before.balance))
    expect(feeBreakdown(v).other).toBe(0n)
    expect(txOutcome(v).ok).toBe(false)
    expect(describeExitCode(9)).toMatch(/Cell underflow/)
  })

  it('bounced: bounce phase ok and a bounced message back to the sender', () => {
    const v = txFromBoc(fx.bounced.raw)
    expect(v.compute).toMatchObject({ success: false, exitCode: 211 })
    expect(v.bounce).toEqual({ type: 'ok', msgFees: 22221n, fwdFees: 44446n })
    expect(v.outMsgs).toHaveLength(1)
    expect(v.outMsgs[0]).toMatchObject({ bounced: true, bounce: false, dest: v.inMsg!.src })
    expect(describeExitCode(211)).toMatch(/^Custom error thrown by the contract/)
  })

  it('balance change formula matches the indexer where it reports both balances', () => {
    for (const name of cases) {
      const v3 = fx[name].v3 as unknown as V3Tx
      const b = v3.account_state_before?.balance
      const a = v3.account_state_after?.balance
      if (!a || !b) continue
      expect(balanceChange(txFromBoc(fx[name].raw)), name).toBe(BigInt(a) - BigInt(b))
    }
  })

  it('rejects BOCs that are not transactions', () => {
    // a message body (text comment "hello") is a valid BOC but not a transaction
    expect(() => txFromBoc('te6cckEBAQEACwAAEgAAAABoZWxsb5oNank=')).toThrow(/not a transaction/)
    expect(() => txFromBoc('nope')).toThrow(/valid BOC/)
  })
})

describe('exit codes', () => {
  it('wallet-specific meanings (from wallet sources)', () => {
    expect(describeExitCode(33, 'v4r2')).toMatch(/seqno/)
    expect(describeExitCode(36, 'v4r2')).toMatch(/expired/)
    expect(describeExitCode(35, 'v3r2')).toMatch(/signature.*expired/)
    expect(describeExitCode(135, 'v5r1')).toMatch(/invalid signature/)
    expect(describeExitCode(133, 'v5r1')).toMatch(/seqno/)
    // without a wallet, 133 is the Tact code
    expect(describeExitCode(133)).toMatch(/Tact: contract stopped/)
    expect(describeResultCode(37)).toMatch(/Not enough/)
  })
})
