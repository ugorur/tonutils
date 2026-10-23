import { Address, beginCell, Cell, comment, loadMessage, SendMode } from '@ton/core'
import { signVerify } from '@ton/crypto'
import { describe, expect, it } from 'vitest'
import { analyzeExternal, buildRawExternal, buildSignedTransfer, explainBroadcastError, keyFromSecret, parseWalletBody, walletContract } from './logic'

// Real mainnet external message: the in_msg of tx XKOsK/kVKVgGjx+Rw6XspRzSGRIzWh38VJ/Qi17HfOs=
// (account 0:237ECDDE…8E0B, lt 111675474000018, toncenter v2 getTransactions). Hashes below are toncenter v3's
// in_msg.hash and hash_norm for that transaction.
const EXT = 'te6cckEBBAEAtwAB5YgARv2bvfXQOMj/K8XQ37CFt9YpaM1bCQeMu7UUrx6xHBYDm0s7c///+ItW0eaoAAAB5CBfLEi6PixJ9991D8zSe/d3gi7Pj57R0cU4iVwhK/vIiya64/bNT2+xvkT0NGvikmTSdzMPVureRTR+a7WzjhkBAgoOw8htAwIDAAAAaEIARWOPmDau6/g+o7oB8cA0JA8Ydp4r1vLJ0/cFVdbgcayhNfG0AAAAAAAAAAAAAAAAAADnczte'
const b64hex = (b64: string) => Buffer.from(b64, 'base64').toString('hex')

describe('analyzeExternal (real mainnet message)', () => {
  const info = analyzeExternal(EXT)
  it('matches toncenter hashes and destination', () => {
    expect(info.hash).toBe(b64hex('JSebXWCxDwOQQcBPBOd8JtHffr1xD/JWRjWpsM48Wyg='))
    expect(info.normHash).toBe(b64hex('ya8Vdvn6VrVLTz4wd+gzNUb5pH0tBqjXXoaxYxCo/4c='))
    expect(info.dest.toRawString().toUpperCase()).toBe('0:237ECDDEFAE81C647F95E2E86FD842DBEB14B466AD8483C65DDA8A578F588E0B')
    expect(info.hasInit).toBe(false)
  })
  it('reads the W5 body and its one out message', () => {
    expect(info.wallet?.kind).toBe('w5')
    expect(info.wallet?.messages).toHaveLength(1)
    expect(info.wallet?.messages[0]!.mode).toBe(3)
  })
  it('rejects bodies and internal messages', () => {
    expect(() => analyzeExternal(comment('hi').toBoc().toString('base64'))).toThrow(/not a message/)
  })
})

describe('parseWalletBody (real mainnet v3r2 / v4r2 externals)', () => {
  // toncenter v3 /transactions (2026-10-23). Expected dest/value are the transaction's own out_msgs.
  it('v3r2 (code hash hNr6RJ+Y…): mode byte follows seqno, no op byte', () => {
    // tx Ki20g/OHPtSQ0890kV5azp5raSqkBxZT+7/UFXjkHlk=, account 0:E4532963…55F6; out_msg value 49881332 = 0.05 minus fees (mode 2)
    const w = parseWalletBody(Cell.fromBase64('te6cckEBAwEA3gABmnit7Zbo+p5iiqA3KoooMhpWn9nNXW4S3OaQHn0/2HijVEolRiEQhHHr8txvpfzdCjRT8PYP638VdqnDbk0bsQcpqaMXattJEQAAAA0CAQFoYgBDL3eqj26nmn+qc5ytac8C7I6RPvturtHNbaa0a1oBRSAX14QAAAAAAAAAAAAAAAAAAQIAqg+KfqUAAAAAAAAAAEAhE8YIAHY2X6zlADwKC+zhbNGRWikECPVxMWwv7ar8dN1LZj0xADkUyljzrU0n+5RC5UJcrFOKstCm+BFtYywHah8vt1V9ggJKwCoB'))
    expect(w).toMatchObject({ kind: 'v3/v4', walletId: 698983191 })
    expect(w!.messages).toHaveLength(1)
    expect(w!.messages[0]).toMatchObject({ mode: 2, value: 50_000_000n, bounce: true })
    expect(Address.parse(w!.messages[0]!.dest!).toRawString().toUpperCase()).toBe('0:865EEF551EDD4F34FF54E7395AD39E05D91D227DF6DD5DA39ADB4D68D6B4028A')
    expect(w!.messages[0]!.body.name).toBe('jetton_transfer')
  })
  it('v4r2 deploy (seqno 0): op byte 0 then mode 3', () => {
    // tx oJVyo1r+mzuB4ExLhV8X6keevWqj7Ebl7TjC7phrOX0=, account 0:C713A05C…1AC5 (uninit before); out_msg value 158007246
    const w = parseWalletBody(Cell.fromBase64('te6cckEBBAEA+QABnBiQlQd1aij8TIhNfFiQ7SzBQxxNnwjJ+ZR53bwxNr+eQVOCzKmbzA5sxb6QrAWcX5reOI+5ZQChpQXoyANgkAMpqaMXattzBAAAAAAAAwEBaGIATILYX0rS2pBtHcl98bE8ZIKwThm0aIEzf9kbS56C48QgS1f+cAAAAAAAAAAAAAAAAAECAagPin6lAAAAAAAAAAA3pA4IAVZ+UqaOWBvxZUqmtxj8wO0ePg95fDhW7NB7Q20lhpK9AA9RzpyVZnSd+4tTygJMyACfxINcE3VQbjewphvrs1/FwgMDADAAAAAANTVGMzQwMTEwNEQ2QzREQTM0RTkJkS0k'))
    expect(w).toMatchObject({ kind: 'v3/v4', seqno: 0 })
    expect(w!.messages[0]).toMatchObject({ mode: 3, value: 158_007_246n })
    expect(Address.parse(w!.messages[0]!.dest!).toRawString().toUpperCase()).toBe('0:9905B0BE95A5B520DA3B92FBE36278C905609C3368D10266FFB236973D05C788')
  })
})

describe('signing (deterministic test key, never a real wallet)', () => {
  const SEED = '0101010101010101010101010101010101010101010101010101010101010101'
  const to = Address.parse('0:237ECDDEFAE81C647F95E2E86FD842DBEB14B466AD8483C65DDA8A578F588E0B')
  const sign = async (version: 'v5r1' | 'v4r2' | 'v3r2', seqno: number) => {
    const key = await keyFromSecret(SEED)
    const msg = buildSignedTransfer({ version, key, network: 'testnet', seqno, messages: [{ to, value: 1_000_000n, bounce: false, body: comment('test') }], sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS, validUntil: 2_000_000_000, deploy: seqno === 0 })
    return { key, msg, wallet: walletContract(version, key.publicKey, 'testnet') }
  }

  it('v4r2: signature over the rest of the body verifies with the public key', async () => {
    const { key, msg, wallet } = await sign('v4r2', 7)
    const info = analyzeExternal(msg, true)
    expect(info.dest.equals(wallet.address)).toBe(true)
    expect(info.wallet).toMatchObject({ kind: 'v3/v4', seqno: 7, validUntil: 2_000_000_000, walletId: 698983191 })
    expect(info.wallet!.messages[0]).toMatchObject({ mode: 3, value: 1_000_000n, bounce: false })
    const s = info.body.beginParse()
    const sig = s.loadBuffer(64)
    expect(signVerify(s.asCell().hash(), sig, key.publicKey)).toBe(true)
  })

  it('v3r2: no op byte, so the first byte after seqno is the send mode', async () => {
    const { key, msg } = await sign('v3r2', 5)
    const info = analyzeExternal(msg, true)
    expect(info.wallet).toMatchObject({ kind: 'v3/v4', seqno: 5, walletId: 698983191 })
    expect(info.wallet!.messages).toHaveLength(1)
    expect(info.wallet!.messages[0]).toMatchObject({ mode: 3, value: 1_000_000n })
    const s = info.body.beginParse()
    const sig = s.loadBuffer(64)
    expect(signVerify(s.asCell().hash(), sig, key.publicKey)).toBe(true)
  })

  it('W5 (testnet wallet id): signature is the last 512 bits and verifies; seqno 0 attaches StateInit', async () => {
    const { key, msg, wallet } = await sign('v5r1', 0)
    const info = analyzeExternal(msg, true)
    expect(info.hasInit).toBe(true)
    expect(info.dest.equals(wallet.address)).toBe(true)
    expect(info.wallet).toMatchObject({ kind: 'w5', seqno: 0, validUntil: 2_000_000_000 })
    const s = info.body.beginParse()
    const signed = s.loadBits(s.remainingBits - 512)
    const sig = s.loadBuffer(64)
    const rebuilt = beginCell().storeBits(signed)
    for (const r of info.body.refs) rebuilt.storeRef(r)
    expect(signVerify(rebuilt.endCell().hash(), sig, key.publicKey)).toBe(true)
  })

  it('W5 testnet and mainnet addresses differ (network id is in the wallet id)', async () => {
    const key = await keyFromSecret(SEED)
    expect(walletContract('v5r1', key.publicKey, 'testnet').address.equals(walletContract('v5r1', key.publicKey, 'mainnet').address)).toBe(false)
  })

  it('validates key input', async () => {
    await expect(keyFromSecret('abc')).rejects.toThrow()
    await expect(keyFromSecret('word '.repeat(24))).rejects.toThrow(/mnemonic/)
    await expect(keyFromSecret('00ff')).rejects.toThrow(/64 hex/)
  })
})

describe('raw external + errors', () => {
  it('wraps a body into an external-in message', () => {
    const to = Address.parse('EQAjfs3e-ugcZH-V4uhv2ELb6xS0Zq2Eg8Zd2opXj1iOC_oh')
    const m = loadMessage(buildRawExternal({ to, body: comment('x'), init: null }).beginParse())
    expect(m.info.type).toBe('external-in')
    expect(m.body.equals(comment('x'))).toBe(true)
  })
  it('explains wallet exit codes from toncenter errors', () => {
    expect(explainBroadcastError('LITE_SERVER_UNKNOWN: cannot apply external message to current state : External message was not accepted\nexitcode=33, steps=36')).toMatch(/seqno/)
    expect(explainBroadcastError('exitcode=137, steps=1')).toMatch(/\+2/)
  })
})
