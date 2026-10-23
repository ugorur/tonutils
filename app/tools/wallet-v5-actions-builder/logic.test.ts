// Real W5 bodies (payload-decoder/vectors.ts, toncenter-decoded fields) are rebuilt byte for byte;
// extended actions are cross-checked against @ton/ton's WalletContractV5R1 (an independent implementation).
import type { W5Action } from './logic'
import { Address, Cell, internal, loadMessage, loadMessageRelaxed, SendMode } from '@ton/core'
import { WalletContractV5R1 } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import { commentBody } from '~/utils/ton/messages'
import { EXT_MESSAGE, W5_EXTENSION, W5_EXTERNAL, W5_INTERNAL } from '../payload-decoder/vectors'
import { attachSignature, buildRequest, externalMessage, safeMode, walletIdV5R1 } from './logic'

const raw = (a: string) => Address.parseRaw(a)
/** Body cells of the real out messages, in send order (out_list stores the last action at the root). */
function outBodies(outList: Cell): Cell[] {
  const list: Cell[] = []
  let c = outList
  while (c.refs.length === 2) {
    const msg = loadMessageRelaxed(c.refs[1]!.beginParse())
    list.unshift(msg.body)
    c = c.refs[0]!
  }
  return list
}

describe('walletIdV5R1', () => {
  it('mainnet default is 2147483409 (toncenter wallet_id of real W5 requests)', () => {
    expect(walletIdV5R1('mainnet')).toBe(2147483409)
  })

  it('matches @ton/ton for testnet and other workchains/subwallets', async () => {
    for (const [globalId, workchain, subwallet] of [[-3, 0, 0], [-239, -1, 0], [-239, 0, 7]] as const) {
      const w = WalletContractV5R1.create({ publicKey: Buffer.alloc(32, 1), walletId: { networkGlobalId: globalId, context: { workchain, subwalletNumber: subwallet, walletVersion: 'v5r1' } } })
      let signed: Cell | null = null
      const args = { seqno: 1, timeout: 1, messages: [], sendMode: 3, signer: async (c: Cell) => { signed = c; return Buffer.alloc(64) } }
      await w.createTransfer(args as unknown as Parameters<typeof w.createTransfer>[0])
      expect(walletIdV5R1(globalId, workchain, subwallet)).toBe(signed!.beginParse().skip(32).loadUint(32))
    }
  })
})

describe('buildRequest reproduces real mainnet W5 bodies', () => {
  it('external signed: one action, mode 3 (tx XnIuXrob…)', () => {
    const real = Cell.fromBase64(W5_EXTERNAL)
    const [body] = outBodies(real.refs[0]!)
    const req = buildRequest({
      auth: 'external',
      walletId: 2147483409,
      validUntil: 1792698674,
      seqno: 19,
      actions: [{ type: 'send', mode: 3, message: { to: raw('0:47EE508A366041C24B854F13CB0D6E2D25B860D4BA29056D32C14CF41C7C028B'), value: 20000000n, bounce: true, body: body!, init: null } }]
    })
    const signed = attachSignature(req.unsigned, 'F82FE5928EE6ABA81FCF58D1DE3D2032CB30DC8D69DB16B1A9154589E979F2B46F4897A01D0E99A0D03CC513FC56D27256BFEF725C3AC9787AC25BEF7311A401')
    expect(signed.hash().toString('hex')).toBe(real.hash().toString('hex'))
  })

  it('internal signed: two actions keep their order (message pR9s0Hui…)', () => {
    const real = Cell.fromBase64(W5_INTERNAL)
    const bodies = outBodies(real.refs[0]!)
    const to = raw('0:35B633523EB18C00E0EF661790C2F210D0846F253DAB2C7CC0F59BEB18F9947A')
    const req = buildRequest({
      auth: 'internal',
      walletId: 2147483409,
      validUntil: 1792698732,
      seqno: 24,
      actions: [
        { type: 'send', mode: 3, message: { to, value: 2000000n, bounce: true, body: bodies[0]!, init: null } },
        { type: 'send', mode: 3, message: { to, value: 100000000n, bounce: true, body: bodies[1]!, init: null } }
      ]
    })
    const signed = attachSignature(req.unsigned, '0F98E919692112CEF9B9400B74A98722C18A044BC6382B207D49D872B07CCF402946B69C1DA689E37FBA8FBF04B60747DA4B20AAF8F20EE985AA3F8B1686DE0D')
    expect(signed.equals(real)).toBe(true)
  })

  it('extension request with a comment (message 9iigvbFd…)', () => {
    const req = buildRequest({
      auth: 'extension',
      walletId: 0,
      validUntil: 0,
      seqno: 0,
      queryId: 0n,
      actions: [{ type: 'send', mode: 3, message: { to: raw('0:341ED5FC13D653CCC39A81A432329B76A5DF31D9FEA273DAA416B77E48E04FEE'), value: 2352986186n, bounce: false, body: commentBody('UDCEA0B7A6'), init: null } }]
    })
    expect(req.signingHash).toBeNull()
    expect(req.unsigned.equals(Cell.fromBase64(W5_EXTENSION))).toBe(true)
  })

  it('externalMessage wraps a body exactly like the real external of tx XKOsK/kV…', () => {
    const real = Cell.fromBase64(EXT_MESSAGE)
    const m = loadMessage(real.beginParse())
    if (m.info.type !== 'external-in') throw new Error('fixture')
    expect(externalMessage(m.info.dest, m.body).equals(real)).toBe(true)
  })
})

describe('extended actions match @ton/ton', () => {
  const ext1 = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
  const ext2 = raw('0:059a3528654a8a14404660510c6effa6eb5b054ad8007d447c27a8490f0514d3')
  const msg = { to: ext2, value: 1n, bounce: false, body: commentBody('x'), init: null }
  const wallet = WalletContractV5R1.create({ publicKey: Buffer.alloc(32, 2), walletId: { networkGlobalId: -239 } })

  it('extension auth: mixed sends and 3 extended actions', () => {
    const actions: W5Action[] = [
      { type: 'send', mode: 1, message: msg },
      { type: 'add_extension', address: ext1 },
      { type: 'remove_extension', address: ext2 },
      { type: 'set_signature_allowed', allowed: false }
    ]
    const ours = buildRequest({ auth: 'extension', walletId: 0, validUntil: 0, seqno: 0, queryId: 5n, actions }).unsigned
    const theirs = wallet.createRequest({
      authType: 'extension',
      seqno: 0,
      queryId: 5n,
      actions: [
        { type: 'sendMsg', mode: 1, outMsg: internal({ to: ext2, value: 1n, bounce: false, body: commentBody('x') }) },
        { type: 'addExtension', address: ext1 },
        { type: 'removeExtension', address: ext2 },
        { type: 'setIsPublicKeyEnabled', isEnabled: false }
      ]
    } as unknown as Parameters<typeof wallet.createRequest>[0]) as Cell
    expect(ours.equals(theirs)).toBe(true)
  })

  it('external signed: unsigned cell, signing hash and +2 mode patch', async () => {
    let toSign: Cell | null = null
    const sig = Buffer.alloc(64, 7)
    const theirs = await wallet.createRequest({
      authType: 'external',
      seqno: 9,
      timeout: 1800000000,
      signer: async (c: Cell) => { toSign = c; return sig },
      actions: [{ type: 'addExtension', address: ext1 }, { type: 'sendMsg', mode: SendMode.PAY_GAS_SEPARATELY, outMsg: internal({ to: ext2, value: 1n, bounce: false, body: commentBody('x') }) }]
    })
    const req = buildRequest({ auth: 'external', walletId: walletIdV5R1('mainnet'), validUntil: 1800000000, seqno: 9, actions: [{ type: 'add_extension', address: ext1 }, { type: 'send', mode: 1, message: msg }] })
    expect(req.unsigned.equals(toSign!)).toBe(true)
    expect(req.signingHash).toBe(toSign!.hash().toString('hex'))
    expect(attachSignature(req.unsigned, sig.toString('hex')).equals(theirs)).toBe(true)
    expect(safeMode(1, 'external')).toBe(3)
    expect(safeMode(1, 'internal')).toBe(1)
  })

  it('validates input', () => {
    expect(() => buildRequest({ auth: 'external', walletId: 1, validUntil: 1, seqno: 0, actions: [] })).toThrow(/at least one/)
    expect(() => attachSignature(Cell.EMPTY, 'abcd')).toThrow(/64 bytes/)
  })
})
