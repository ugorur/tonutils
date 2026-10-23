import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { summarizeFeatures } from '~/lib/dev-tonconnect/features'
import { commentBody } from '~/utils/ton/messages'
import wallets from '../tonconnect-wallets-status/fixtures/wallets-v2.2026-10-23.json'
import type { Context } from './logic'
import { previewMessages, signDataPayload, templates, unwrap, validateRequest } from './logic'

// Real wallet features from the official wallets-v2.json snapshot (2026-10-23).
const feat = (app: string) => summarizeFeatures(wallets.find(w => w.app_name === app)!.features)
const TONKEEPER = feat('tonkeeper') // 255 messages, extra currencies, no items
const SAFEPAL = feat('safepalwallet') // 1 message, no extra currencies

// The sendTransaction request example from ton-connect spec/rpc.md § Examples, verbatim.
const SPEC_ENVELOPE = String.raw`{
  "method": "sendTransaction",
  "params": [
    "{\"valid_until\":1764424242,\"network\":\"-239\",\"from\":\"Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU\",\"messages\":[{\"address\":\"Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU\",\"amount\":\"100000000\"}]}"
  ],
  "id": "42"
}`
const NOW = 1764424000
const ctx: Context = { network: 'mainnet', nowSec: NOW }

// In-message body of mainnet tx Qf8bSoXXvL1yGmYy49CuL7dA8HnpOOMbMQaZB/SUDHc= (comment "player-11"),
// read from toncenter /api/v3/transactions?account=UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI.
const ONCHAIN_COMMENT = 'te6cckEBAQEADwAAGgAAAABwbGF5ZXItMTGIvGdv'
const WALLET = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'
const WALLET_RAW = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8'

const errors = (t: string, c: Context = ctx) => validateRequest(t, c).checks.filter(x => x.level === 'error').map(x => x.title)

describe('validateRequest', () => {
  it('accepts the spec example envelope and converts it to the SDK shape', () => {
    const r = validateRequest(SPEC_ENVELOPE, ctx)
    expect(r.checks.filter(c => c.level === 'error')).toEqual([])
    expect(r.request).toEqual({
      validUntil: 1764424242,
      network: '-239',
      from: '-1:0000000000000000000000000000000000000000000000000000000000000000',
      messages: [{ address: 'Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU', amount: '100000000' }]
    })
    expect(r.total).toBe(100000000n)
  })

  it('the spec example is expired after valid_until and wrong on testnet', () => {
    expect(errors(SPEC_ENVELOPE, { ...ctx, nowSec: 1764424243 })).toContain('validUntil is in the past')
    expect(errors(SPEC_ENVELOPE, { ...ctx, network: 'testnet' })[0]).toMatch(/does not match the site network/)
  })

  it('a real on-chain comment body is a valid payload', () => {
    const r = validateRequest(JSON.stringify({ validUntil: NOW + 60, messages: [{ address: WALLET, amount: '10000000', payload: ONCHAIN_COMMENT }] }), ctx)
    expect(r.request?.messages?.[0]?.payload).toBe(ONCHAIN_COMMENT)
    expect(r.checks.map(c => c.title)).toContain('network not set: using -239 (mainnet)')
  })

  it('raw destinations, number amounts, bad BOCs, milliseconds and both messages+items are reported', () => {
    expect(errors(JSON.stringify({ validUntil: NOW + 60, messages: [{ address: WALLET_RAW, amount: '1' }] }))[0]).toBe('messages[0]: raw address')
    const r = validateRequest(JSON.stringify({ validUntil: NOW + 60, messages: [{ address: WALLET, amount: 5 }] }), ctx)
    expect(r.checks.find(c => c.level === 'warn')?.title).toBe('messages[0]: amount is a number')
    expect(errors(JSON.stringify({ validUntil: NOW + 60, messages: [{ address: WALLET, amount: '1', payload: 'nope' }] }))[0]).toMatch(/payload is not a valid BOC/)
    expect(errors(JSON.stringify({ validUntil: (NOW + 60) * 1000, messages: [{ address: WALLET, amount: '1' }] }))).toContain('validUntil looks like milliseconds')
    expect(errors(JSON.stringify({ validUntil: NOW + 60, messages: [], items: [] }))).toContain('Use messages or items, not both')
    expect(errors(JSON.stringify({ validUntil: NOW + 60 }))).toContain('Add messages (or items)')
    expect(errors('{oops')).toEqual(['Not valid JSON'])
  })

  it('testnet-only addresses are refused on mainnet (TEP-2)', () => {
    // 0Q form of the same account, from testnet toncenter /api/v3/addressBook
    expect(errors(JSON.stringify({ messages: [{ address: '0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC', amount: '1' }] }))).toContain('messages[0]: testnet-only address on mainnet')
  })

  it('checks against real wallet features: SafePal takes 1 message and no extra currencies', () => {
    const two = JSON.stringify({ messages: [{ address: WALLET, amount: '1' }, { address: WALLET, amount: '2', extra_currency: { 100: '5' } }] })
    expect(errors(two, { ...ctx, features: SAFEPAL })).toEqual([
      '2 messages, but this wallet accepts at most 1',
      'messages[1]: this wallet does not support extra currencies'
    ])
    const ok = validateRequest(two, { ...ctx, features: TONKEEPER })
    expect(ok.request?.messages?.[1]?.extraCurrency).toEqual({ 100: '5' })
  })

  it('structured items need the wallet itemTypes feature, from must match the wallet', () => {
    const items = JSON.stringify({ items: [{ type: 'jetton', master: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', destination: WALLET, amount: '1000000' }] })
    expect(errors(items, { ...ctx, features: TONKEEPER })).toEqual(['items[0]: this wallet does not accept "jetton" items'])
    expect(errors(items)).toEqual([])
    expect(errors(JSON.stringify({ items: [{ type: 'nft', nftAddress: WALLET }] }))).toEqual(['items[0]: missing newOwner'])
    expect(errors(SPEC_ENVELOPE, { ...ctx, wallet: WALLET_RAW })).toContain('from is not the connected wallet')
  })

  it('unwrap passes plain objects through', () => {
    expect(unwrap('{"a":1}')).toEqual({ a: 1 })
  })
})

describe('templates', () => {
  const t = templates(WALLET, 'mainnet', NOW)
  it('all templates validate, and the comment payload equals the on-chain comment encoding', () => {
    for (const x of t) expect(errors(x.json), x.id).toEqual([])
    expect(Cell.fromBase64(ONCHAIN_COMMENT).equals(commentBody('player-11'))).toBe(true)
    const first = validateRequest(t[0]!.json, ctx).request!
    expect(first.from).toBe(WALLET_RAW)
    expect(first.messages![0]!.address).toBe(WALLET)
  })
  it('uses the 0Q form on testnet and previews ton items', () => {
    const tt = templates(WALLET, 'testnet', NOW)
    const r = validateRequest(tt[2]!.json, { ...ctx, network: 'testnet' }).request!
    expect(previewMessages(r)).toEqual([{ address: '0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC', amount: '10000000', payload: expect.any(String), stateInit: undefined }])
  })
})

describe('signDataPayload', () => {
  it('builds text, binary (hex or base64) and cell payloads (rpc.md § signData variants)', () => {
    expect(signDataPayload('text', 'Sign in to the dApp')).toEqual({ payload: { type: 'text', text: 'Sign in to the dApp' } })
    expect(signDataPayload('binary', '0xdeadbeef')).toEqual({ payload: { type: 'binary', bytes: '3q2+7w==' } })
    expect(signDataPayload('binary', '3q2+7w==')).toEqual({ payload: { type: 'binary', bytes: '3q2+7w==' } })
    expect(signDataPayload('cell', ONCHAIN_COMMENT, 'text#00000000 text:SnakeData = Comment;')).toEqual({ payload: { type: 'cell', schema: 'text#00000000 text:SnakeData = Comment;', cell: ONCHAIN_COMMENT } })
    expect('error' in signDataPayload('cell', ONCHAIN_COMMENT)).toBe(true)
    expect('error' in signDataPayload('binary', 'zz!')).toBe(true)
    expect('error' in signDataPayload('text', '  ')).toBe(true)
  })
})
