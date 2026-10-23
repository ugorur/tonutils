import { describe, expect, it } from 'vitest'
import { fromV2Stack } from '~/lib/network/stack'
import ple from '~/lib/network/fixtures/participant-list.json'
import past from './election-1792691976.json'
import { countdown, electionPhase, parseParticipantList, simulateElection } from './logic'

// Config 15/16/17 on mainnet (toncenter getConfigParam, cross-checked with tonapi /v2/blockchain/config).
const LIMITS = { minValidators: 75, maxValidators: 400, minStake: 300000000000000n, maxStake: 10000000000000000n, minTotalStake: 75000000000000000n, maxStakeFactor: 294912 }
const T15 = { electedFor: 65536, startBefore: 32768, endBefore: 8192 }

describe('parseParticipantList (elector participant_list_extended, seqno 100816944)', () => {
  const e = parseParticipantList(fromV2Stack(ple.stack))!
  it('header matches elections.toncenter.com for election 1792757512', () => {
    // elections.toncenter.com/getElections?limit=1, same minute: election_id 1792757512, elect_close 1792749320,
    // min_stake 300000000000000, total_stake 671137761442900319, finished false.
    expect(e.electAt).toBe(1792757512)
    expect(e.electClose).toBe(1792749320)
    expect(e.minStake).toBe(300000000000000n)
    expect(e.totalStake).toBe(671137761442900319n)
    expect(e.finished).toBe(false)
    expect(e.failed).toBe(false)
  })
  it('participants match elections.toncenter.com', () => {
    expect(e.participants[0]).toEqual({
      pubkey: '000b521c791254fcc97f2e2f9870c482e48c9432cba3bc0c308e41c4f51a94c1',
      stake: 2240695198470000n,
      maxFactor: 294912,
      // Ef-Qm4FoiISlFW78mkpkWktL60Cmdk6J20rBhb068cNZNuT0 in raw form
      wallet: '-1:909b81688884a5156efc9a4a645a4b4beb40a6764e89db4ac185bd3af1c35936',
      adnl: 'f3d500e14638d54bfc638966c021db4cf293b7978bd963325a2391519308b94f'
    })
    expect(e.participants[1]!.pubkey).toBe('0163846a4e69433a930e80ac533b3ecb430536a2570e79647e209057cd03b528')
    expect(e.participants[1]!.stake).toBe(1117110198470000n)
  })
  it('no election open → null', () => {
    // testnet participant_list_extended on 2026-10-23: all zeros and an empty list
    expect(parseParticipantList([0n, 0n, 0n, 0n, [], 0n, 0n])).toBeNull()
  })
})

describe('simulateElection (elector try_elect)', () => {
  it('reproduces the real outcome of election 1792691976', () => {
    const ps = past.participants.map(([s, f]) => ({ stake: BigInt(s as string), maxFactor: f as number }))
    const r = simulateElection(ps, LIMITS)
    // tonapi /v2/blockchain/validators for that round: 380 validators, smallest stake 820344198470000.
    expect(r.count).toBe(past.elected.count)
    expect(r.minStake).toBe(BigInt(past.elected.min_stake))
    expect(r.elected.size).toBe(380)
    expect(r.effectiveTotal).toBeLessThanOrEqual(BigInt(past.elected.total_stake))
  })
  it('fails below the minimum validator count', () => {
    expect(simulateElection([{ stake: 10n ** 15n, maxFactor: 196608 }], LIMITS).count).toBe(0)
  })
})

describe('electionPhase', () => {
  // Current round started 1792691976 (config 34 utime_since); next round 1792757512.
  it('open during the window', () => {
    expect(electionPhase(1792691976, T15, 1792741874)).toEqual({ phase: 'open', opensAt: 1792724744, closesAt: 1792749320, nextRound: 1792757512 })
  })
  it('waiting before it opens, closed after it closes', () => {
    expect(electionPhase(1792691976, T15, 1792700000).phase).toBe('waiting')
    expect(electionPhase(1792691976, T15, 1792750000).phase).toBe('closed')
  })
  it('rolls forward when the round is over', () => {
    expect(electionPhase(1792691976, T15, 1792757513).nextRound).toBe(1792757512 + 65536)
  })
  it('countdown', () => {
    expect(countdown(7446)).toBe('2 h 4 min')
    expect(countdown(90000)).toBe('1 d 1 h')
    expect(countdown(0)).toBe('now')
  })
})
