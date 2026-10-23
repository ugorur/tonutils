import { Address, Cell, loadMessageRelaxed } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { GaslessEstimate } from './logic'
import { estimateMessageHex, explainGaslessError, readEstimate } from './logic'

// Real tonapi exchange, mainnet 2026-10-22: POST /v2/gasless/estimate/<USD₮ master> for W5 wallet 0:aacb8abf…
// (USD₮ wallet 0:49b24b1e…) sending 1 USD₮ to 0:5023537c…. tonapi answered with this estimate; its first message
// payload is tonapi's own re-serialization of the jetton_transfer we sent.
const RELAY = '0:7ae5056c3fd9406f9bbbe7c7089cd4c40801d9075486cbedb7ce12df119eacf1'
const RESPONSE: GaslessEstimate = {
  protocol_name: 'gasless',
  relay_address: RELAY,
  commission: '5577',
  from: '0:aacb8abf0b0f1fd988d2c1344aa67c78e7cfafb3c67f112a75546a7978771804',
  valid_until: 1792699185,
  messages: [
    { address: '0:49b24b1ed404af7411a26990015789298cf89b996bfeea6610469f8238678f36', amount: '50000000', payload: 'b5ee9c720101010100560000a80f8a7ea5000000000000000030f4240800a046a6f8cf3fcc4e905537858af0d57497d1f2ec958abc11bc602ffd7da74a1f001eb9415b0ff6501be6eef9f1c227353102007641d521b2fb6df384b7c467ab3c4202' },
    { address: '0:49b24b1ed404af7411a26990015789298cf89b996bfeea6610469f8238678f36', amount: '5000000', payload: 'b5ee9c720101010100540000a40f8a7ea518e0f23144e98a84215c9800f5ca0ad87fb280df3777cf8e1139a9881003b20ea90d97db6f9c25be233d59e3001eb9415b0ff6501be6eef9f1c227353102007641d521b2fb6df384b7c467ab3c40' }
  ]
}

describe('estimateMessageHex', () => {
  it('builds the internal message tonapi accepted; its body equals tonapi\'s echo bit for bit', () => {
    const hex = estimateMessageHex({
      jettonWallet: Address.parse('0:49b24b1ed404af7411a26990015789298cf89b996bfeea6610469f8238678f36'),
      destination: Address.parse('0:5023537c679fe627482a9bc2c5786aba4be8f9764ac55e08de3017febed3a50f'),
      relay: Address.parse(RELAY),
      amount: 1_000_000n
    })
    const msg = loadMessageRelaxed(Cell.fromHex(hex).beginParse())
    expect(msg.info.type).toBe('internal')
    expect(msg.info.dest!.toString()).toBe(Address.parse(RESPONSE.messages[0]!.address).toString())
    expect(msg.body.equals(Cell.fromHex(RESPONSE.messages[0]!.payload!))).toBe(true)
  })
})

describe('readEstimate', () => {
  it('splits the relayed messages into your transfer and the relayer fee', () => {
    const v = readEstimate(RESPONSE, 1_000_000n, RELAY)
    expect(v.commission).toBe(5577n)
    expect(v.totalJettons).toBe(1_005_577n)
    expect(v.messages.map(m => m.role)).toEqual(['transfer', 'fee'])
    expect(v.messages[1]!.body!.fields.amount).toBe(5577n)
  })
})

describe('explainGaslessError', () => {
  it('maps tonapi error 40004 (seen for a v4r2 wallet) to a W5 hint', () => {
    expect(explainGaslessError({ error: 'failed to determine wallet version: invalid wallet address', error_code: 40004 })).toMatch(/W5/)
    expect(explainGaslessError({ error: 'something else' })).toBeNull()
  })
})
