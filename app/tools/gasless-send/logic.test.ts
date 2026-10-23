import { Address, beginCell, Cell, internal, loadMessage, loadMessageRelaxed, storeMessageRelaxed, type StateInit } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { decodeBody, parseBoc } from '~/utils/ton/messages'
import type { GaslessEstimate } from './logic'
import { checkEstimate, estimateRequest, gasJettons, secondsLeft, toTonConnectMessages, wrapSignedInternal } from './logic'

// Real tonapi responses, 2026-10-22. GET /v2/gasless/config (first entries):
const CONFIG = { relay_address: '0:7ae5056c3fd9406f9bbbe7c7089cd4c40801d9075486cbedb7ce12df119eacf1', gas_jettons: [{ master_id: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe' }, { master_id: '0:589d4ac897006b5aaa7fae5f95c5e481bd34765664df0b831a9d0eb9ee7fc150' }] }
// POST /v2/gasless/estimate/<USD₮ master> for W5 wallet 0:23272171…2429 (public key from tonapi
// /accounts/{id}/publickey), sending 0.1 USD₮ to 0:83dfd552…31a8. tonapi accepted the request and returned:
const ESTIMATE: GaslessEstimate = {
  protocol_name: 'gasless',
  relay_address: '0:7ae5056c3fd9406f9bbbe7c7089cd4c40801d9075486cbedb7ce12df119eacf1',
  commission: '5532',
  from: '0:232721714e70ff60b22bc6dc0c038b466953de3aa5ef0308916dcc3dc2842429',
  valid_until: 1792700278,
  messages: [
    { address: '0:00027a18fcd55288b8bc1b88865a15bbf3f8a7bdb030be044036e790ccb69fb4', amount: '50000000', payload: 'b5ee9c720101010100560000a80f8a7ea5000000000000000030186a080107bfaaa5cc6e5368e5f9799188bd798cd22e04ab16d1d8ea4fc37480741e6351001eb9415b0ff6501be6eef9f1c227353102007641d521b2fb6df384b7c467ab3c4202' },
    { address: '0:00027a18fcd55288b8bc1b88865a15bbf3f8a7bdb030be044036e790ccb69fb4', amount: '5000000', payload: 'b5ee9c720101010100540000a40f8a7ea518e0f32fc63cd0602159c800f5ca0ad87fb280df3777cf8e1139a9881003b20ea90d97db6f9c25be233d59e3001eb9415b0ff6501be6eef9f1c227353102007641d521b2fb6df384b7c467ab3c40' }
  ]
}
const OWNER = Address.parse('0:232721714E70FF60B22BC6DC0C038B466953DE3AA5EF0308916DCC3DC2842429')
const JETTON_WALLET = Address.parse('0:00027A18FCD55288B8BC1B88865A15BBF3F8A7BDB030BE044036E790CCB69FB4') // toncenter v3 /jetton/wallets
const RECIPIENT = Address.parse('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')

describe('gasless estimate', () => {
  it('lists the fee jettons from the config as raw addresses', () => {
    expect([...gasJettons(CONFIG)]).toEqual(['0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', '0:589d4ac897006b5aaa7fae5f95c5e481bd34765664df0b831a9d0eb9ee7fc150'])
  })

  it('builds the request tonapi accepted: its transfer comes back unchanged as the first message to sign', () => {
    const req = estimateRequest({ owner: OWNER, publicKey: '867f9814e14ac80282268cdd452c18e6ee6d702d3d24527ae973b3a2ff895419', jettonWallet: JETTON_WALLET, amount: 100_000n, destination: RECIPIENT, relay: Address.parse(CONFIG.relay_address) })
    expect(req.wallet_address).toBe(OWNER.toRawString())
    const msg = loadMessageRelaxed(Cell.fromHex(req.messages[0]!.boc).beginParse())
    expect(msg.info.type).toBe('internal')
    if (msg.info.type !== 'internal') return
    expect([msg.info.dest.toRawString(), msg.info.value.coins.toString(), msg.info.bounce]).toEqual([ESTIMATE.messages[0]!.address, ESTIMATE.messages[0]!.amount, true])
    expect(msg.body.hash().equals(Cell.fromHex(ESTIMATE.messages[0]!.payload!).hash())).toBe(true)
  })

  it('turns the estimate into TonConnect messages; the second one pays the commission to the relay', () => {
    const msgs = toTonConnectMessages(ESTIMATE)
    expect(msgs.map(m => [m.address, m.amount])).toEqual([[ESTIMATE.messages[0]!.address, 50_000_000n], [ESTIMATE.messages[1]!.address, 5_000_000n]])
    const fee = decodeBody(msgs[1]!.payload as string)
    expect(fee.name).toBe('jetton_transfer')
    expect(fee.fields.amount).toBe(5532n)
    expect(Address.parse(fee.fields.destination as string).toRawString()).toBe(CONFIG.relay_address)
    expect(secondsLeft(ESTIMATE, 1792700278_000 - 30_000)).toBe(30)
  })

  it('accepts the real estimate and refuses a relayer answer that changes what gets signed', () => {
    const relay = Address.parse(CONFIG.relay_address)
    const req = estimateRequest({ owner: OWNER, publicKey: '867f9814e14ac80282268cdd452c18e6ee6d702d3d24527ae973b3a2ff895419', jettonWallet: JETTON_WALLET, amount: 100_000n, destination: RECIPIENT, relay })
    expect(checkEstimate(ESTIMATE, req, relay)).toBeNull()
    const [m0, m1] = ESTIMATE.messages
    expect(checkEstimate({ ...ESTIMATE, commission: '1' }, req, relay)).toMatch(/other than its fee/)
    expect(checkEstimate({ ...ESTIMATE, messages: [m1!, m1!] }, req, relay)).toMatch(/changed the transfer/)
    expect(checkEstimate({ ...ESTIMATE, messages: [m0!, { ...m1!, address: RECIPIENT.toRawString() }] }, req, relay)).toMatch(/unexpected contract/)
    expect(checkEstimate(ESTIMATE, req, RECIPIENT)).toMatch(/other than its fee/)
    expect(checkEstimate({ ...ESTIMATE, messages: [{ ...m0!, amount: '5000000000' }, m1!] }, req, relay)).toMatch(/more GRAM/)
  })
})

describe('wrapSignedInternal', () => {
  // On-chain W5 internal_signed body ("sint", 0x73696e74) relayed to 0:730c04e8…34c0 in trace
  // fwv3c4Q2epfaUcfLgtLon1En+0n+ziWV4OZs2Xvhzyk= (toncenter v3 /traces, 2026-10-22).
  const SINT = 'te6cckECCQEAAYkAAaFzaW50f///EWrab8oAAAADl++VqrwHDq8DygnucnBaeZRCoxj8Mclw2h0wT0ODTnu66ThnE0tH0CAqNM7YED4KQkVKKbgF6jr+ZSzWzoI7AyABAgoOw8htAwIDAgoOw8htAwQFAWhiAGJi6YsS8Ac2J1MZHmbr+zCKJMuD7dhkOVMpKWFM8bCyIC+vCAAAAAAAAAAAAAAAAAABBwAAAWhiAGJi6YsS8Ac2J1MZHmbr+zCKJMuD7dhkOVMpKWFM8bCyIBfXhAAAAAAAAAAAAAAAAAABBgCqD4p+pe/kbVQbmCL4QBxRCNgAWie1pHn/BILRe9l714SYTUGq6hjzVwLBrg8mf8ByXN0AHrlBWw/2UBvm7vnxwic1MQIAdkHVIbL7bfOEt8RnqzxCAgGmD4p+pe/kbVQbmCL4IbnIAPXKCth/soDfN3fPjhE5qYgQA7IOqQ2X22+cJb4jPVnjAB65QVsP9lAb5u758cInNTECAHZB1SGy+23zhLfEZ6s8QgMIAAiHjabj2C3WHg=='
  const WALLET = Address.parse('0:730C04E89F78055043D535A2F5E78F8A705E92FB2E206FB7D7487FE9D20134C0')

  it('puts the signed body into an external message to the same wallet', () => {
    const body = parseBoc(SINT)
    expect(body.beginParse().loadUint(32)).toBe(0x73696E74)
    const internalBoc = beginCell().store(storeMessageRelaxed(internal({ to: WALLET, value: 0n, bounce: true, body }))).endCell().toBoc().toString('base64')
    const { hex, hash } = wrapSignedInternal(internalBoc)
    const ext = loadMessage(Cell.fromHex(hex).beginParse())
    expect(ext.info.type).toBe('external-in')
    expect(ext.info.dest!.toString()).toBe(WALLET.toString())
    expect(ext.body.hash().equals(body.hash())).toBe(true)
    expect(ext.init ?? null).toBeNull()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('keeps the StateInit of a wallet that is not deployed yet', () => {
    const init: StateInit = { code: beginCell().storeUint(1, 8).endCell(), data: beginCell().storeUint(2, 8).endCell() }
    const internalBoc = beginCell().store(storeMessageRelaxed(internal({ to: WALLET, value: 0n, init, body: parseBoc(SINT) }))).endCell().toBoc().toString('base64')
    const ext = loadMessage(Cell.fromHex(wrapSignedInternal(internalBoc).hex).beginParse())
    expect(ext.init?.code?.hash().equals(init.code!.hash())).toBe(true)
  })
})
