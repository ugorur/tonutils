import { describe, expect, it } from 'vitest'
import { Address } from '@ton/core'
import {
  COMMENT_BODY_BOC, COMMENT_BODY_HASH_B64, EXT_MSG1_BOC, EXT_MSG2_BOC, INT_MSG2_BOC, INT_MSG2_BODY_HASH_B64,
  TX1_IN_MSG_BODY_HASH_B64, TX1_IN_MSG_HASH_B64, TX1_IN_MSG_HASH_NORM_B64,
  TX2_IN_MSG_BODY_HASH_B64, TX2_IN_MSG_HASH_B64, TX2_IN_MSG_HASH_NORM_B64, TX2_OUT_MSG_HASH_B64
} from '~/lib/boc-basics/vectors'
import { analyzeMessage, lookupHash } from './logic'

const h = (b64: string) => Buffer.from(b64, 'base64').toString('hex')

// Expected hashes are toncenter v3's in_msg.hash / hash_norm / message_content.hash for real mainnet transactions.
describe('analyzeMessage', () => {
  it.each([
    ['W5 transfer (TX1)', EXT_MSG1_BOC, TX1_IN_MSG_HASH_B64, TX1_IN_MSG_HASH_NORM_B64, TX1_IN_MSG_BODY_HASH_B64, '0:237ECDDEFAE81C647F95E2E86FD842DBEB14B466AD8483C65DDA8A578F588E0B'],
    ['wallet transfer (TX2)', EXT_MSG2_BOC, TX2_IN_MSG_HASH_B64, TX2_IN_MSG_HASH_NORM_B64, TX2_IN_MSG_BODY_HASH_B64, '0:D8652D3922FCB2EE7B0C94294B6F426F9DF2A00FD06769C086067FFF804C49FE']
  ])('external-in %s: full, normalized and body hash match toncenter', (_, boc, full, norm, body, dest) => {
    const r = analyzeMessage(boc)
    if (r.kind === 'not-a-message') throw new Error('parsed as body')
    expect(r.kind).toBe('external-in')
    expect(r.hash).toBe(h(full))
    expect(r.normalizedHash).toBe(h(norm))
    expect(r.bodyHash).toBe(h(body))
    expect(r.src).toBeNull()
    expect(r.dest!.length).toBe(48)
    expect(lookupHash(r)).toBe(h(norm))
    expect(Address.parse(r.dest!).toRawString().toUpperCase()).toBe(dest)
  })

  it('accepts hex input', () => {
    const r = analyzeMessage(Buffer.from(EXT_MSG1_BOC, 'base64').toString('hex'))
    expect(r.hash).toBe(h(TX1_IN_MSG_HASH_B64))
  })

  it('internal message (TX2 out_msg): value, bounce, op and hashes match toncenter', () => {
    const r = analyzeMessage(INT_MSG2_BOC)
    if (r.kind === 'not-a-message') throw new Error('parsed as body')
    expect(r.kind).toBe('internal')
    expect(r.hash).toBe(h(TX2_OUT_MSG_HASH_B64))
    expect(r.normalizedHash).toBeNull()
    expect(r.bodyHash).toBe(h(INT_MSG2_BODY_HASH_B64))
    expect(r.value).toBe(20000000n)
    expect(r.bounce).toBe(true)
    expect(r.bodyOp.opHex).toBe('0x487a8e81')
    expect(lookupHash(r)).toBe(r.hash)
  })

  it('reports a bare body (real comment) as not a message, with its cell hash', () => {
    const r = analyzeMessage(COMMENT_BODY_BOC)
    expect(r.kind).toBe('not-a-message')
    expect(r.hash).toBe(h(COMMENT_BODY_HASH_B64))
    expect(r.bodyOp.opHex).toBe('0x00000000')
  })

  it('throws on garbage', () => {
    expect(() => analyzeMessage('not a boc!')).toThrow()
  })
})
