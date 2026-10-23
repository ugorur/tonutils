import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildNftBody, recommendedAttach, senderProblem } from './logic'

// Real mainnet bodies from toncenter /api/v3/messages?opcode=… (2026-10-22). Expected field values are
// toncenter's `message_content.decoded`, an independent decoder.
const A = (raw: string) => Address.parse(raw)
const hashOf = (boc: string) => Cell.fromBase64(boc).hash().toString('hex')

describe('TEP-62 NFT', () => {
  it('rebuilds a real nft transfer bit for bit', () => {
    // msg FcubZ0oNcYYr2BNnIz540qOIT/pq/hOq+ucoHE+Y9bA= to item 0:ADECAB4E…, tx XbOZEh09xgrG7wazyW7s7t8/7HFOhvUAOhmnLfHPa88=
    const body = buildNftBody({
      action: 'transfer',
      p: {
        queryId: 14n,
        newOwner: A('0:D3FA1E5CA4D74FAE40EDF7A0920B6CE49548FD9D083D5253E00432BC503072B0'),
        responseDestination: A('0:B2ACBE1EEE7A47F3C8F540EE492003F9116B7A56C04B882D0FD07A593720C060'),
        forwardAmount: 0n,
        forwardPayload: null,
        customPayload: null
      }
    })
    expect(body.hash().toString('hex')).toBe(hashOf('te6cckEBAQEAUgAAn1/MPRQAAAAAAAAADoAaf0PLlJrp9cgdvvQSQW2ckqkfs6EHqkp8AIZXigYOVhACyrL4e7npH88j1QO5JIAP5EWt6VsBLiC0P0HpZNyDAYAI9JYpEA=='))
  })
  it('rebuilds a real get_static_data', () => {
    // msg e/hkLcf6p/uMfHLdSLq6n0iyBRRP/6gw2Mc6eJhqEV4=, tx Dk88/tjZLRFOL7C5w8b7d5F6flyjH4dnKHrpaw3e97s=
    expect(buildNftBody({ action: 'static', p: { queryId: 0n } }).hash().toString('hex')).toBe(hashOf('te6cckEBAQEADgAAGC/LJqIAAAAAAAAAAPNsrk0='))
  })
})

describe('TEP-85 SBT', () => {
  const REQUEST = 'te6cckEBAgEAUwABW9DDv+oAAAAAAAAAAIAQ+LOO0wwvp8Fls58+8nUEqTIc5OJT3xXYCxnsd6Cc7bgBAEBNw0ytoy0oB2XuG6TnK9+q6/glmxIHmD81mDAKHmmxBvwaeIU='
  const requestParams = {
    queryId: 0n,
    dest: A('0:87C59C7698617D3E0B2D9CF9F793A8254990E727129EF8AEC058CF63BD04E76D'),
    forwardPayload: Cell.fromBase64('te6ccgEBAQEAIgAAQE3DTK2jLSgHZe4bpOcr36rr+CWbEgeYPzWYMAoeabEG'),
    withContent: true
  }
  it('rebuilds a real request_owner bit for bit', () => {
    // msg aUTWIgiESJThLdXaW3NCCCiDAPuFGFKyQvDDI+qwE88= to SBT 0:0153E19D…, tx NxfxPgx/35HGHVGtAAGixL8zVOOwXo2Km0ABKFKvXCg=
    expect(buildNftBody({ action: 'request', p: requestParams }).hash().toString('hex')).toBe(hashOf(REQUEST))
  })
  it('prove_ownership has the request_owner layout with op 0x04ded148 (TEP-85 TL-B)', () => {
    // No well-formed prove_ownership exists on chain to copy; TEP-85 gives both ops the same fields.
    const prove = buildNftBody({ action: 'prove', p: requestParams }).beginParse()
    const real = Cell.fromBase64(REQUEST).beginParse()
    expect(prove.loadUint(32)).toBe(0x04ded148)
    expect(real.loadUint(32)).toBe(0xd0c3bfea)
    expect(prove.asCell().hash().equals(real.asCell().hash())).toBe(true)
  })
  it('rebuilds real destroy and revoke', () => {
    // destroy: msg PhPHHzQioVerxca/9v8Cjq/fPK+piEQgH4OPnnuM9N8=; revoke: msg 3vqdmuh4ZKsSfvJEXSO/ftT5XkoMch4AHbOjhdEhS0I=
    expect(buildNftBody({ action: 'destroy', p: { queryId: 7649875229101n } }).hash().toString('hex')).toBe(hashOf('te6cckEBAQEADgAAGB8EU3oAAAb1IBh5rc1eooc='))
    expect(buildNftBody({ action: 'revoke', p: { queryId: 1792659274n } }).hash().toString('hex')).toBe(hashOf('te6cckEBAQEADgAAGG+J9eMAAAAAatnPSswlg5s='))
  })
})

describe('helpers', () => {
  const me = A('0:D3FA1E5CA4D74FAE40EDF7A0920B6CE49548FD9D083D5253E00432BC503072B0')
  const other = A('0:B2ACBE1EEE7A47F3C8F540EE492003F9116B7A56C04B882D0FD07A593720C060')
  it('warns when the sender is not the owner or the item is on sale', () => {
    expect(senderProblem('transfer', { owner: other }, me)).toMatch(/not the owner/)
    expect(senderProblem('transfer', { owner: me }, me)).toBeNull()
    expect(senderProblem('transfer', { owner: other, onSale: true }, me)).toMatch(/sale/)
    expect(senderProblem('request', { owner: other }, me)).toBeNull()
  })
  it('recommends forward + 0.05 GRAM for transfers', () => {
    expect(recommendedAttach('transfer', 1n)).toBe(50_000_001n)
    expect(recommendedAttach('destroy')).toBe(50_000_000n)
  })
})
