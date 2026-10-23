// Testnet hub: verified faucet / explorer / API links, testnet address forms and status parsing.
// Every link was opened on 2026-10-23 (HTTP 200, content checked). Imports @ton/core: client / logic only.
import { Address } from '@ton/core'
import { COIN_SYMBOL } from '~/utils/currency'

export interface HubLink { name: string, url: string, detail: string }

export const FAUCETS: HubLink[] = [
  { name: 'Testgiver TON Bot', url: 'https://t.me/testgiver_ton_bot', detail: `The faucet in the official TON docs. Solve a captcha, paste a testnet address, get 2 test ${COIN_SYMBOL}. Once per hour.` },
  { name: 'Acton faucet (CLI)', url: 'https://ton-blockchain.github.io/acton/docs/wallets#fund-a-wallet-on-testnet', detail: 'From the TON toolchain: run "acton wallet airdrop <name> --net testnet". Does a small proof of work on your machine instead of a captcha.' },
  { name: 'Chainstack faucet', url: 'https://faucet.chainstack.com/ton-testnet-faucet', detail: `Web faucet run by Chainstack. Tops a wallet up to 1 test ${COIN_SYMBOL} every 24 hours; asks for a free Chainstack API key.` },
  { name: 'TONX API faucet', url: 'https://faucet.tonxapi.com', detail: 'Web faucet run by TONX API for its users. One claim every 12 hours.' }
]

export const EXPLORERS: HubLink[] = [
  { name: 'Tonviewer testnet', url: 'https://testnet.tonviewer.com', detail: 'Tonkeeper\'s explorer: traces, jettons, NFTs.' },
  { name: 'Tonscan testnet', url: 'https://testnet.tonscan.org', detail: 'Classic explorer with raw transaction data.' }
]

export const DOCS: HubLink[] = [
  { name: 'How to get coins on testnet', url: 'https://docs.ton.org/ecosystem/wallet-apps/get-coins', detail: 'Official TON docs walkthrough of the Testgiver bot.' },
  { name: 'Testnet global config', url: 'https://ton.org/testnet-global.config.json', detail: 'Liteserver and DHT list for tonlib, lite-client and nodes.' }
]

export interface ApiBase { name: string, url: string, note: string }
export const API_BASES: ApiBase[] = [
  { name: 'toncenter API v2', url: 'https://testnet.toncenter.com/api/v2/', note: 'Same methods as mainnet. Keyless: about 1 request per second.' },
  { name: 'toncenter API v2 JSON-RPC (TonClient)', url: 'https://testnet.toncenter.com/api/v2/jsonRPC', note: 'Endpoint for TonClient in @ton/ton.' },
  { name: 'toncenter API v3 (indexer)', url: 'https://testnet.toncenter.com/api/v3/', note: 'Transactions, traces, jettons, NFTs.' },
  { name: 'tonapi v2', url: 'https://testnet.tonapi.io/v2/', note: 'Same paths as tonapi.io. Keyless: about 1 request per second.' }
]

export const TONCLIENT_SNIPPET = `import { TonClient } from '@ton/ton'

const client = new TonClient({
  endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
})`

/** TON global_id of testnet (config param 19); mainnet is -239. */
export const TESTNET_GLOBAL_ID = -3

export interface TestnetForms {
  raw: string
  /** Testnet, non-bounceable (0Q…): give this to a faucet for a new wallet. */
  nonBounceable: string
  /** Testnet, bounceable (kQ…/kf…): for contracts. */
  bounceable: string
  mainnetNonBounceable: string
  /** The input already carried the testnet flag. */
  inputIsTestnet: boolean
  inputIsRaw: boolean
}

/** Testnet (and mainnet) user-friendly forms of any address (TEP-2: test-only flag 0x80 in the tag byte). */
export function testnetForms(input: string): TestnetForms {
  const s = input.trim()
  if (!s) throw new Error('Enter an address.')
  let a: Address
  let testOnly = false
  let isRaw = false
  if (Address.isRaw(s)) {
    a = Address.parseRaw(s)
    isRaw = true
  }
  else if (Address.isFriendly(s)) {
    const f = Address.parseFriendly(s)
    a = f.address
    testOnly = f.isTestOnly
  }
  else {
    throw new Error('Not a TON address. Use EQ…, UQ…, kQ…, 0Q… or 0:<64 hex>.')
  }
  return {
    raw: a.toRawString(),
    nonBounceable: a.toString({ testOnly: true, bounceable: false }),
    bounceable: a.toString({ testOnly: true, bounceable: true }),
    mainnetNonBounceable: a.toString({ testOnly: false, bounceable: false }),
    inputIsTestnet: testOnly,
    inputIsRaw: isRaw
  }
}

/** toncenter v3 /masterchainInfo, the part we use. */
export interface MasterchainInfo { last: { seqno: number, global_id: number, gen_utime: string | number } }

export interface TestnetStatus { seqno: number, ageSec: number, isTestnet: boolean, fresh: boolean }

/** Seconds since the last masterchain block; testnet blocks come every few seconds, so > 60 s means a stall. */
export function parseStatus(info: MasterchainInfo, nowSec = Math.floor(Date.now() / 1000)): TestnetStatus {
  const age = Math.max(0, nowSec - Number(info.last.gen_utime))
  return { seqno: info.last.seqno, ageSec: age, isTestnet: info.last.global_id === TESTNET_GLOBAL_ID, fresh: age <= 60 }
}
