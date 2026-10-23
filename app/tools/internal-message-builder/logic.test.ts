// Rebuilds real mainnet out messages (found inside wallet requests, see payload-decoder/vectors.ts) from their
// toncenter-decoded fields and checks the bytes match exactly.
import { Address, beginCell, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { HIGHLOAD_INTERNAL, W5_EXTENSION, W5_EXTERNAL } from '../payload-decoder/vectors'
import { stateInitCell } from '~/lib/payloads/message'
import { buildBody, buildOutputs, buildStateInit, initAddressCheck, messageRelaxedCell, tonConnectMessage, tonConnectRequest, transferLink } from './logic'

/** out_list with one action: refs = [prev (empty), out_msg]. */
const firstOutMsg = (outList: Cell) => outList.refs[1]!

describe('messageRelaxedCell reproduces real wallet messages', () => {
  it('W5 extension request: comment, non-bounceable (toncenter: value 2352986186, text UDCEA0B7A6)', () => {
    const real = firstOutMsg(Cell.fromBase64(W5_EXTENSION).refs[0]!)
    const built = messageRelaxedCell({
      to: Address.parseRaw('0:341ED5FC13D653CCC39A81A432329B76A5DF31D9FEA273DAA416B77E48E04FEE'),
      value: 2352986186n,
      bounce: false,
      body: buildBody('comment', 'UDCEA0B7A6'),
      init: null
    })
    expect(built.hash().toString('hex')).toBe(real.hash().toString('hex'))
  })

  it('W5 external request: bounceable message with a contract body', () => {
    const real = firstOutMsg(Cell.fromBase64(W5_EXTERNAL).refs[0]!)
    // toncenter: delete_dns_record query_id 1792698375, key e8d4…3b1b, no value ref.
    const body = beginCell().storeUint(0x4eb1f0f9, 32).storeUint(1792698375n, 64)
      .storeUint(BigInt('0xE8D44050873DBA865AA7C170AB4CCE64D90839A34DCFD6CF71D14E0205443B1B'), 256).endCell()
    const built = messageRelaxedCell({
      to: Address.parseRaw('0:47EE508A366041C24B854F13CB0D6E2D25B860D4BA29056D32C14CF41C7C028B'),
      value: 20000000n,
      bounce: true,
      body,
      init: null
    })
    expect(built.hash().toString('hex')).toBe(real.hash().toString('hex'))
  })

  it('highload v3: message with StateInit from code + data BOCs (toncenter decoded values)', () => {
    const real = firstOutMsg(Cell.fromBase64(HIGHLOAD_INTERNAL).refs[0]!)
    const init = buildStateInit({
      codeBoc: 'te6ccgEBAQEAGgAAMP8AIJgh10mDCLnyQN+Ahfgz0O0eIO1T2Q==',
      dataBoc: 'te6ccgEBAQEAKwAAUgAAAAAAf/9/EYz2tulBJ1atOygaXjwX95Jj0BPQmgXjJsHlWeZjIv8I'
    })
    const to = Address.parseRaw('0:0D5AB8D2665C8A86B3371ECE305289476FDE489AB27BE4BE86270B95762A4FD8')
    // This sender stored the StateInit in a ref (refs = [init, body]); @ton/core inlines it when it fits,
    // so compare the StateInit cell itself and the deploy address rather than the whole message.
    expect(stateInitCell(init!).hash().equals(real.refs[0]!.hash())).toBe(true)
    expect(initAddressCheck({ to, init })?.matches).toBe(true)
  })
})

describe('exports', () => {
  const to = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs') // USDT master
  const spec = { to, value: 50000000n, bounce: false, body: buildBody('comment', 'hi there'), init: null }

  it('TonConnect message uses the chosen bounce flag and network form', () => {
    expect(tonConnectMessage(spec, 'mainnet')).toEqual({
      address: 'UQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_p0p',
      amount: '50000000',
      payload: spec.body!.toBoc().toString('base64')
    })
    expect(tonConnectMessage({ ...spec, bounce: true }, 'testnet').address).toBe(to.toString({ testOnly: true }))
    expect(tonConnectRequest(spec, 'testnet', 1800000000)).toMatchObject({ validUntil: 1800000000, network: '-3' })
  })

  it('ton:// link carries text for comments and bin/init otherwise', () => {
    expect(transferLink(spec, 'mainnet', 'hi there')).toBe('ton://transfer/UQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_p0p?amount=50000000&text=hi%20there')
    const link = new URL(transferLink({ ...spec, init: { code: spec.body, data: null } }, 'mainnet'))
    const bin = link.searchParams.get('bin')!
    expect(bin).toMatch(/^[\w-]+$/) // url-safe, unpadded
    expect(Cell.fromBoc(Buffer.from(bin, 'base64url'))[0]!.equals(spec.body!)).toBe(true)
    expect(link.searchParams.get('init')).toMatch(/^[\w-]+$/)
  })

  it('outputs hash the message cell', () => {
    const o = buildOutputs(spec, 'mainnet')
    expect(o.messageHash).toBe(Cell.fromBase64(o.messageBoc).hash().toString('hex'))
    expect(o.stateInitBoc).toBeNull()
  })

  it('rejects a broken StateInit', () => {
    expect(() => buildStateInit({ stateInitBoc: buildBody('comment', 'not a state init')!.toBoc().toString('base64') })).toThrow(/Not a StateInit/)
    expect(() => buildBody('boc', 'nope')).toThrow(/Not a valid BOC/)
  })
})
