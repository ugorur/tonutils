import type { Cell } from '@ton/core'
import type { SignDataPayload, SignDataResponse, TonConnectUI, Wallet } from '@tonconnect/ui'
import type { TonNetwork } from './useTonNetwork'

/** TonConnect / TON global network ids. */
export const TON_CHAIN_ID: Record<TonNetwork, string> = { mainnet: '-239', testnet: '-3' }

export interface ConnectedAccount {
  /** Raw form, 0:<hex>. */
  address: string
  /** Non-bounceable user-friendly form (UQ… on mainnet, 0Q… on testnet). */
  friendly: string
  /** '-239' mainnet, '-3' testnet. */
  chain: string
  network: TonNetwork | null
  /** Hex, as advertised by the wallet. Not authoritative for signature checks. */
  publicKey?: string
  /** Base64 BOC of the wallet's StateInit. */
  walletStateInit: string
  device: Wallet['device']
  /** Wallet app name and icon, when the wallet list knows it. */
  walletName: string
  walletImage?: string
}

export interface TonConnectMessage {
  /** Destination. User-friendly (EQ…/UQ…) keeps its bounce flag; raw 0:… is sent bounceable. */
  address: string
  /** nanoGRAM. */
  amount: bigint | string
  /** Body: a Cell or a base64 BOC. Build with ~/utils/ton/messages. */
  payload?: Cell | string
  /** StateInit to deploy the destination: a Cell or a base64 BOC. */
  stateInit?: Cell | string
}

export interface SendResult {
  /** Signed external message, base64 BOC, as returned by the wallet. */
  boc: string
  /** TEP-467 normalized external message hash, hex. Pass it to waitForTransaction or explorers. */
  hash: string
}

export class TonConnectNetworkError extends Error {
  constructor(readonly walletNetwork: string, readonly siteNetwork: TonNetwork) {
    super(`Your wallet is on ${walletNetwork} but TonUtils is set to ${siteNetwork}. Switch the network in the header, or disconnect and reconnect your wallet on ${siteNetwork}.`)
    this.name = 'TonConnectNetworkError'
  }
}

// One TonConnectUI per page (the SDK keeps a single bridge connection). Client only.
const ui = shallowRef<TonConnectUI | null>(null)
const account = shallowRef<ConnectedAccount | null>(null)
/** True once the previous session (if any) has been restored. */
const restored = ref(false)
let loading: Promise<TonConnectUI> | null = null

const networkOf = (chain: string): TonNetwork | null =>
  chain === TON_CHAIN_ID.mainnet ? 'mainnet' : chain === TON_CHAIN_ID.testnet ? 'testnet' : null

function toBase64(x: Cell | string | undefined): string | undefined {
  if (x === undefined) return undefined
  return typeof x === 'string' ? x : x.toBoc().toString('base64')
}

/**
 * Wallet connection through TonConnect (@tonconnect/ui, loaded lazily on the client).
 *
 *   const tc = useTonConnect()
 *   await tc.connect()
 *   const { hash } = await tc.sendTransaction({ messages: [{ address, amount: 50_000_000n, payload }] })
 *   const trace = await tc.waitForTransaction(hash)
 *
 * Every wallet tool must render <TxPreview :messages> before calling sendTransaction, and wrap its UI in <WalletGate>.
 */
export function useTonConnect() {
  const { network } = useTonNetwork()
  const toncenter = useToncenter()
  const manifestUrl = `${useRuntimeConfig().public.siteUrl}/tonconnect-manifest.json`

  function getUi(): Promise<TonConnectUI> {
    if (import.meta.server) return Promise.reject(new Error('TonConnect is client-only'))
    loading ??= import('@tonconnect/ui').then(({ TonConnectUI, toUserFriendlyAddress }) => {
      const instance = new TonConnectUI({ manifestUrl, analytics: { mode: 'off' } })
      instance.onStatusChange((w) => {
        if (!w) {
          account.value = null
          return
        }
        const net = networkOf(w.account.chain)
        account.value = {
          address: w.account.address,
          friendly: toUserFriendlyAddress(w.account.address, net === 'testnet'),
          chain: w.account.chain,
          network: net,
          publicKey: w.account.publicKey,
          walletStateInit: w.account.walletStateInit,
          device: w.device,
          walletName: (w as { name?: string }).name ?? w.device.appName,
          walletImage: 'imageUrl' in w ? w.imageUrl : undefined
        }
      })
      instance.connectionRestored.finally(() => (restored.value = true))
      ui.value = instance
      return instance
    })
    return loading
  }

  const connected = computed(() => !!account.value)
  /** Connected, but on the other network than the site switch. */
  const networkMismatch = computed(() => !!account.value && account.value.network !== network.value)

  async function connect() {
    const instance = await getUi()
    if (instance.connected) return
    // Ask wallets to connect on the site's network; the SDK rejects a wallet on the other chain.
    instance.setConnectionNetwork(TON_CHAIN_ID[network.value])
    await instance.openModal()
  }

  async function disconnect() {
    const instance = await getUi()
    if (instance.connected) await instance.disconnect()
  }

  async function ready(): Promise<TonConnectUI> {
    const instance = await getUi()
    const acc = account.value
    if (!instance.connected || !acc) throw new Error('Connect a wallet first.')
    if (acc.network !== network.value) throw new TonConnectNetworkError(acc.network ?? `chain ${acc.chain}`, network.value)
    return instance
  }

  async function normalizeMessages(messages: TonConnectMessage[]) {
    if (!messages.length) throw new Error('Nothing to send.')
    const { Address } = await import('@ton/core')
    const testOnly = network.value === 'testnet'
    return messages.map((m) => {
      const isRaw = /^-?\d+:[0-9a-f]{64}$/i.test(m.address.trim())
      const address = isRaw ? Address.parse(m.address).toString({ bounceable: true, testOnly, urlSafe: true }) : m.address.trim()
      const amount = BigInt(m.amount)
      if (amount < 0n) throw new Error('Amount cannot be negative.')
      return { address, amount: amount.toString(), payload: toBase64(m.payload), stateInit: toBase64(m.stateInit) }
    })
  }

  /**
   * Asks the wallet to sign and broadcast. Resolves after the wallet returns the signed message
   * (not after it lands on chain: use waitForTransaction). Throws when not connected, on network
   * mismatch, or when the user rejects (TonConnect's UserRejectsError).
   */
  async function sendTransaction(req: { messages: TonConnectMessage[], /** unix seconds, default now + 5 min */ validUntil?: number }): Promise<SendResult> {
    const instance = await ready()
    const res = await instance.sendTransaction({
      validUntil: req.validUntil ?? Math.floor(Date.now() / 1000) + 300,
      network: TON_CHAIN_ID[network.value],
      messages: await normalizeMessages(req.messages)
    })
    const { normalizedExtMessageHash } = await import('~/utils/ton/messages')
    return { boc: res.boc, hash: normalizedExtMessageHash(res.boc) }
  }

  /** TonConnect signData (text, binary or cell). The network is filled in from the site switch. */
  async function signData(payload: SignDataPayload): Promise<SignDataResponse> {
    const instance = await ready()
    return instance.signData({ ...payload, network: TON_CHAIN_ID[network.value] })
  }

  /**
   * Signs an internal message WITHOUT broadcasting (TonConnect 5 signMessage, used for gasless relays).
   * Returns the signed internal message BOC. Not every wallet supports it: check `supportsSignMessage`.
   */
  async function signMessage(req: { messages: TonConnectMessage[], validUntil?: number }): Promise<{ internalBoc: string }> {
    const instance = await ready()
    return instance.signMessage({
      validUntil: req.validUntil ?? Math.floor(Date.now() / 1000) + 300,
      network: TON_CHAIN_ID[network.value],
      messages: await normalizeMessages(req.messages)
    })
  }

  const supportsSignMessage = computed(() =>
    !!account.value?.device.features.some(f => typeof f === 'object' && f.name === 'SignMessage'))

  /**
   * Polls toncenter v3 /traces until the trace started by this external message is complete.
   * Accepts the signed BOC from sendTransaction or a message hash (hex or base64).
   * Throws after `timeoutMs` (the transaction may still land later).
   */
  async function waitForTransaction(extMsgBocOrHash: string, opts: { timeoutMs?: number, intervalMs?: number } = {}) {
    const { timeoutMs = 120_000, intervalMs = 4_000 } = opts
    let hash = extMsgBocOrHash.trim()
    if (!/^[0-9a-f]{64}$/i.test(hash) && !/^[\w+/-]{43}=?$/.test(hash)) {
      const { normalizedExtMessageHash } = await import('~/utils/ton/messages')
      hash = normalizedExtMessageHash(hash)
    }
    // toncenter takes base64 (verified); convert hex.
    if (/^[0-9a-f]{64}$/i.test(hash)) hash = btoa(String.fromCharCode(...hash.match(/../g)!.map(b => Number.parseInt(b, 16))))
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const res = await toncenter.v3<{ traces: TonTrace[] }>('traces', { msg_hash: hash, limit: 1 }).catch((e: unknown) => {
        if (e instanceof TonApiError && (e.isRateLimit || e.status >= 500 || e.status === 0)) return { traces: [] }
        throw e
      })
      const trace = res.traces[0]
      if (trace && trace.trace_info.trace_state === 'complete') return trace
      await new Promise(r => setTimeout(r, intervalMs))
    }
    throw new Error(`Not confirmed after ${Math.round(timeoutMs / 1000)} s. It may still land: check the explorer link.`)
  }

  return {
    /** Loads @tonconnect/ui and returns the singleton. Client only. */
    getUi,
    /** The TonConnectUI instance once loaded (null on the server and before first use). */
    ui: readonly(ui),
    wallet: readonly(account),
    connected,
    restored: readonly(restored),
    networkMismatch,
    supportsSignMessage,
    connect,
    disconnect,
    sendTransaction,
    signData,
    signMessage,
    waitForTransaction
  }
}

/** Subset of a toncenter v3 trace (see /api/v3/traces). */
export interface TonTrace {
  trace_id: string
  external_hash: string
  start_utime: number
  end_utime: number
  is_incomplete: boolean
  trace_info: { trace_state: 'complete' | 'pending' | string, messages: number, transactions: number, pending_messages: number }
  trace: unknown
  transactions_order: string[]
  transactions: Record<string, { hash: string, account: string, description?: { aborted?: boolean, compute_ph?: { exit_code?: number, success?: boolean } } }>
}
