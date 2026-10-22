import { Address, beginCell, Cell, storeMessage } from '@ton/core'
import { describe, expect, it } from 'vitest'
import {
  commentBody, decodeBody, excessesBody, jettonBurnBody, jettonTransferBody, messageHash,
  normalizedExtMessageHash, nftTransferBody, parseBoc
} from './messages'

const A = (raw: string) => Address.parse(raw)
const friendly = (raw: string) => A(raw).toString()

// Real mainnet message bodies (2026-10-22). Field values come from toncenter v3's own decoder
// (/api/v3/jetton/transfers, /api/v3/nft/transfers, transactions[].in_msg.message_content.decoded).

// USDT transfer with a text comment forward payload in a ref. Tx PnZsfaNVbVlQxnI3AzFrRV/R1FechFh9l89zbqljpEI=
const JT_COMMENT = 'te6cckEBAgEAqQABqA+KfqVXmsSvjcxmVjB4JngBTdg67ucpRRKBuIYtLS8TjnVsBkgT+m95KZS+qgM5+1MAEP5ht//EKERK0Hq+MUWEwhr5Uwkx/9boz9sDhCZSrCwCAwEAoAAAAABNVy05YjdmZWFjOS1hMjdiLTRjNTktODgzNy01OGZmMDk1NWNjNDU6MmZlMTJlZTYtNWI0Ny00ZDdkLWE0ZWMtY2JiNTk4NGU5ZTc5MUpLMg=='
const JT_COMMENT_FIELDS = {
  queryId: 6312574085990475350n,
  amount: 492135n,
  destination: '0:A6EC1D777394A28940DC4316969789C73AB6032409FD37BC94CA5F55019CFDA9',
  response: '0:43F986DFFF10A1112B41EAF8C51613086BE54C24C7FF5BA33F6C0E10994AB0B0',
  forwardTon: 1n,
  text: 'MW-9b7feac9-a27b-4c59-8837-58ff0955cc45:2fe12ee6-5b47-4d7d-a4ec-cbb5984e9e79'
}
// USDT transfer, query_id 0, no forward amount or payload. Tx rxSwe2oQ8FOnr67J1do/kLYtI92j1XMsVwFLFf0+Uvs=
const JT_PLAIN = 'te6cckEBAQEAVgAAqA+KfqUAAAAAAAAAAEARUZgIAZyon+SFNw0bobIF2Otmozk1N1Ol0tkGEXCm0+VoD1bvADd0QeLrEK7ga+edYRSEwsQGA2lwWmFDKof8DHlkMP6EQCktpPw='
// NFT transfer with comment "Ref#He2wM2Dlm". Tx Z1aejMsPJHtzvhKvDgCLmHz+NXzx80sTmAoooUDrTBs=
const NFT_COMMENT = 'te6cckEBAgEAZwABoV/MPRTgJrdIAUC4bYACsCbEc1tiu6s78hjIPz36Yln9cMyeQx6YfL+dOyvNgPADyacA2FOw8MKMZv4aEEZqnqPb35arm4Nzo1nmR9VYCOQgOAEAIgAAAABSZWYjSGUyd00yRGxtOoVBig=='
// NFT transfer, query_id 34, empty inline forward payload. Tx M9LN8zTuV58uBCBmKfURLj7nEt57RTPejPGkHNMfoAs=
const NFT_PLAIN = 'te6cckEBAQEAUgAAn1/MPRQAAAAAAAAAIoAVME1teZvA4CbKEsqubuAtOgcI1HOVqAYnuB6VHDDksFAB0CpW6HNTKbRoM4u8AsipV8Vq2YXa25O8A6uf8mdFWeAIcm4Xvw=='

describe('decodeBody (on-chain bodies)', () => {
  it('jetton transfer with comment payload', () => {
    const d = decodeBody(JT_COMMENT)
    expect(d.name).toBe('jetton_transfer')
    expect(d.opHex).toBe('0x0f8a7ea5')
    expect(d.fields).toMatchObject({
      query_id: JT_COMMENT_FIELDS.queryId,
      amount: JT_COMMENT_FIELDS.amount,
      destination: friendly(JT_COMMENT_FIELDS.destination),
      response_destination: friendly(JT_COMMENT_FIELDS.response),
      custom_payload: null,
      forward_ton_amount: 1n
    })
    expect(d.fields.forward_payload).toMatchObject({ name: 'text_comment', fields: { text: JT_COMMENT_FIELDS.text } })
  })

  it('jetton transfer without payload', () => {
    const d = decodeBody(JT_PLAIN)
    expect(d.fields).toMatchObject({
      query_id: 0n,
      amount: 18160000n,
      destination: friendly('0:CE544FF2429B868DD0D902EC75B3519C9A9BA9D2E96C8308B85369F2B407AB77'),
      response_destination: friendly('0:DDD1078BAC42BB81AF9E758452130B10180DA5C169850CAA1FF031E590C3FA11'),
      forward_ton_amount: 0n,
      forward_payload: null
    })
  })

  it('NFT transfer with comment', () => {
    const d = decodeBody(NFT_COMMENT)
    expect(d.name).toBe('nft_transfer')
    expect(d.fields).toMatchObject({
      query_id: 16151798633497409645n,
      new_owner: friendly('0:158136239ADB15DD59DF90C641F9EFD312CFEB8664F218F4C3E5FCE9D95E6C07'),
      response_destination: friendly('0:F269C03614EC3C30A319BF8684119AA7A8F6F7E5AAE6E0DCE8D67991F5560239'),
      forward_amount: 1n
    })
    expect(d.fields.forward_payload).toMatchObject({ name: 'text_comment', fields: { text: 'Ref#He2wM2Dlm' } })
  })

  it('accepts hex BOC and testnet address form', () => {
    const hex = Buffer.from(NFT_PLAIN, 'base64').toString('hex')
    const d = decodeBody(hex, { testOnly: true })
    expect(d.fields.query_id).toBe(34n)
    expect(d.fields.new_owner).toBe(A('0:A9826B6BCCDE07013650965573770169D03846A39CAD40313DC0F4A8E1872582').toString({ testOnly: true }))
  })

  it('never throws', () => {
    expect(decodeBody('not a boc').name).toBe('invalid')
    expect(decodeBody(new Cell()).name).toBe('empty')
    expect(decodeBody(beginCell().storeUint(0xdeadbeef, 32).endCell()).name).toBe('unknown')
    const broken = decodeBody(beginCell().storeUint(0x0f8a7ea5, 32).storeUint(1, 8).endCell())
    expect(broken.name).toBe('jetton_transfer')
    expect(broken.error).toMatch(/does not match/)
  })
})

describe('builders reproduce on-chain bodies bit for bit', () => {
  it('jettonTransferBody with comment', () => {
    const f = JT_COMMENT_FIELDS
    const cell = jettonTransferBody({
      queryId: f.queryId,
      amount: f.amount,
      destination: A(f.destination),
      responseDestination: A(f.response),
      forwardTonAmount: f.forwardTon,
      forwardPayload: f.text
    })
    expect(cell.hash().toString('base64')).toBe(parseBoc(JT_COMMENT).hash().toString('base64'))
  })

  it('jettonTransferBody without payload', () => {
    const cell = jettonTransferBody({
      amount: 18160000n,
      destination: A('0:CE544FF2429B868DD0D902EC75B3519C9A9BA9D2E96C8308B85369F2B407AB77'),
      responseDestination: A('0:DDD1078BAC42BB81AF9E758452130B10180DA5C169850CAA1FF031E590C3FA11')
    })
    expect(cell.equals(parseBoc(JT_PLAIN))).toBe(true)
  })

  it('nftTransferBody with comment', () => {
    const cell = nftTransferBody({
      queryId: 16151798633497409645n,
      newOwner: A('0:158136239ADB15DD59DF90C641F9EFD312CFEB8664F218F4C3E5FCE9D95E6C07'),
      responseDestination: A('0:F269C03614EC3C30A319BF8684119AA7A8F6F7E5AAE6E0DCE8D67991F5560239'),
      forwardAmount: 1n,
      forwardPayload: 'Ref#He2wM2Dlm'
    })
    expect(cell.equals(parseBoc(NFT_COMMENT))).toBe(true)
  })

  it('comment, excesses and burn round-trip through the decoder', () => {
    expect(decodeBody(commentBody('hello')).fields.text).toBe('hello')
    expect(decodeBody(excessesBody(7n))).toMatchObject({ name: 'excesses', fields: { query_id: 7n } })
    expect(decodeBody(jettonBurnBody({ amount: 5n, responseDestination: null }))).toMatchObject({
      name: 'jetton_burn', fields: { query_id: 0n, amount: 5n, response_destination: null, custom_payload: null }
    })
  })
})

describe('external message hashes (toncenter v3 /messages hash + hash_norm)', () => {
  it.each([
    ['0:76710CA0ECEEE38AEA86C1260B250952E6F281506FDB5D5EFD2E88742D4C2856', 'te6cckEBAwEA4AABmu8GAjRJWE0Q2YNKNDP/8QYdAltGV2xP/XgGwpdVvNxbAKqghktsaRbz8rqpRmoWUVy2ajCYVmnoWp1RTIk+bwQpqaMXatuG9AAAADgDAQFoQgAkdPRWby6TVhNuC9Z6XZPZ/h5HPpa8/3Aa/3OUHPM34CAX14QAAAAAAAAAAAAAAAAAAQIArg+KfqURCVpNlZgBW2GWLnNQEggA/B8wFA+b5TkhP7cZQwfyuLVdr92xmodRr56XL2ySHpUAHZxDKDs7uOK6obBJgslCVLm8oFQb9tdXv0uiHQtTChWCAimRV18=', 'ydowlff1fwb13APAuJyghdJlq97r3JTY2amWdUnhtu0=', 'TqTfEoYvWtYmLT0Bkz0iePyJLMd9rQQTKCH79svxVRE='],
    ['0:D06466DA163D85CF6157D550419D1507330E332029CAD3AE5BE22E13090C819D', 'te6cckEBAgEArAABnBZ0QHHuB/O7QyEjj9Ru9s/1xqc/4XHpBYwBc2h8+TYxx9dNITCWZzMf/7GzoNCW9MAGEWObFRiTbpCKgEHzLAUpqaMXato16AAAAHYAAwEAskIAQpIh/CzP81LtGn8hgk1icF9Zg43ZX9qzGvVKEJQ+FB0hDRRHAAAAAAAAAAAAAAAAAAAAAAAANTAgVGVsZWdyYW0gU3RhcnMgCgpSZWYjZFJDNHBiSnVuDd2Rxw==', 'Xbw2KtNv2plTHebIuBWFl9OCj1smuRgDxqq4iwizFCk=', 'YKdjyiXYnRxnKyw1KqXT/c3yoaGBPgRL2DJa+j55EVk=']
  ])('%s', (dest, body, hash, hashNorm) => {
    const msg = beginCell().store(storeMessage({
      info: { type: 'external-in', src: null, dest: A(dest), importFee: 0n },
      init: null,
      body: parseBoc(body)
    })).endCell()
    const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64')
    expect(b64(messageHash(msg))).toBe(hash)
    expect(b64(normalizedExtMessageHash(msg.toBoc().toString('base64')))).toBe(hashNorm)
  })
})
