import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { decodeParam } from '~/lib/network/config'
import { fromV2Stack } from '~/lib/network/stack'
import cfg from '~/lib/network/fixtures/config-params.json'
import lp from '~/lib/network/fixtures/list-proposals.json'
import { parseProposals, proposalStatus, roundProgress } from './logic'

// list_proposals on the config contract at mc seqno 100282600 (two proposals submitted by
// -1:398ec8b0… in tx 9YXgO5wW… / qeEuMVik…, 2026-10-20). Validator set of that round: config 34 at the
// same seqno (toncenter getConfigParam): its cell hash is the vset_id below, total_weight 1152921504606846792.
const VSET = { vsetHash: BigInt('19232482487210032940036914273234988906205451062647602801611104111689868527781').toString(16).padStart(64, '0'), totalWeight: 1152921504606846792n }
const NORMAL = { minWins: 2, maxLoses: 5 } // config 11 normal_params

describe('parseProposals (mainnet seqno 100282600)', () => {
  const ps = parseProposals(fromV2Stack(lp.stack))
  it('two open proposals: params 30 and 8', () => {
    expect(ps.map(p => p.paramId)).toEqual([30, 8])
    expect(ps[1]).toMatchObject({ expiresAt: 1793522962, critical: false, ifHash: null, voters: [], weightRemaining: 864691128455135094n, roundsRemaining: 6, wins: 0, losses: 0 })
    expect(ps[1]!.hash).toBe(BigInt('90204518975225675524011150916391344014241991314498458096741087087570593321786').toString(16).padStart(64, '0'))
    expect(ps[1]!.vsetId).toBe(VSET.vsetHash)
  })
  it('the param 8 proposal is the global version now live on mainnet', () => {
    const proposed = decodeParam(8, Cell.fromBase64(ps[1]!.value!))
    const live = decodeParam(8, Cell.fromBase64(cfg.params['8']))
    expect(proposed.json).toMatchObject({ version: 16, capabilities: 1006n })
    expect(proposed.hash).toBe(live.hash)
  })
  it('round progress: nobody voted yet, ¾ of the weight still required', () => {
    const r = roundProgress(ps[1]!, VSET)
    // muldiv(total_weight, 3, 4) equals the contract's untouched weight_remaining
    expect(r).toEqual({ sameRound: true, required: 864691128455135094n, collected: 0n, percent: 0, wonRound: false })
    expect(roundProgress(ps[1]!, { ...VSET, vsetHash: '00' }).sameRound).toBe(false)
  })
  it('half the votes in → 50%', () => {
    const half = { ...ps[1]!, weightRemaining: 864691128455135094n / 2n }
    expect(roundProgress(half, VSET).percent).toBe(50)
    expect(roundProgress({ ...ps[1]!, weightRemaining: -5n }, VSET).wonRound).toBe(true)
  })
  it('status text', () => {
    expect(proposalStatus(ps[1]!, NORMAL, 1792519600)).toBe('Needs 2 more winning rounds · 6 rounds left · 0/5 lost')
    expect(proposalStatus(ps[1]!, NORMAL, 1793522962)).toBe('Expired')
  })
  it('empty list (mainnet now)', () => {
    expect(parseProposals(fromV2Stack([['list', { '@type': 'tvm.list', 'elements': [] }]]))).toEqual([])
  })
})
