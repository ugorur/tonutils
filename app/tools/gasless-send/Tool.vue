<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import { useAccountClients } from '~/lib/accounts/api'
import type { OwnedJetton, Recipient, TonapiAccount, TonapiJettonBalance } from '~/lib/wallet-actions/core'
import { newQueryId, sortJettons, toOwnedJetton } from '~/lib/wallet-actions/core'
import OwnerBar from '~/lib/wallet-actions/OwnerBar.vue'
import RecipientInput from '~/lib/wallet-actions/RecipientInput.vue'
import { formatJettonAmount, USDT_MASTER } from '~/utils/ton/jetton'
import type { GaslessConfig, GaslessEstimate } from './logic'
import { checkEstimate, estimateRequest, gasJettons, secondsLeft, toTonConnectMessages, wrapSignedInternal } from './logic'

// Example: a real mainnet W5 wallet that holds USD₮ but almost no GRAM, sending to the old TON Foundation wallet.
const EXAMPLE_OWNER = 'UQAjJyFxTnD_YLIrxtwMA4tGaVPeOqXvAwiRbcw9woQkKX3h'
const USDT_RAW = Address.parse(USDT_MASTER).toRawString()

const tc = useTonConnect()
const { isTestnet, network } = useTonNetwork()
const tonapi = useTonapi(network)
const { tonapiPost } = useAccountClients(network)

const owner = shallowRef<Address | null>(null)
const to = ref('')
const recipient = shallowRef<Recipient | null>(null)
const amountText = ref('')
const amount = ref<bigint | null>(null)
const comment = ref('')

// ------------------------------------------------------------ config + wallet info
const config = shallowRef<GaslessConfig | null>(null)
const jettons = ref<OwnedJetton[]>([])
const account = shallowRef<TonapiAccount | null>(null)
const publicKey = ref<string | null>(null)
const selected = ref('')
const loading = ref(false)
const loadError = ref<unknown>(null)
let session = 0

async function load() {
  const my = ++session
  loadError.value = null
  jettons.value = []
  account.value = null
  publicKey.value = null
  const o = owner.value
  if (!o) return
  loading.value = true
  try {
    const raw = o.toRawString()
    const [cfg, bal, acc] = await Promise.all([
      config.value ? Promise.resolve(config.value) : tonapi.get<GaslessConfig>('gasless/config'),
      tonapi.get<{ balances: TonapiJettonBalance[] }>(`accounts/${raw}/jettons`),
      tonapi.get<TonapiAccount>(`accounts/${raw}`)
    ])
    if (my !== session) return
    config.value = cfg
    account.value = acc
    const allowed = gasJettons(cfg)
    jettons.value = sortJettons(bal.balances.map(toOwnedJetton).filter(j => allowed.has(j.master) && j.balance > 0n))
    if (!jettons.value.some(j => j.master === selected.value)) selected.value = (jettons.value.find(j => j.master === USDT_RAW) ?? jettons.value[0])?.master ?? ''
    // The connected wallet reports its key; for a preview address ask tonapi (works for deployed wallets).
    const fromWallet = tc.wallet.value && Address.parse(tc.wallet.value.address).equals(o) ? tc.wallet.value.publicKey : undefined
    publicKey.value = fromWallet ?? (acc.status === 'active' ? (await tonapi.get<{ public_key: string }>(`accounts/${raw}/publickey`)).public_key : null)
  }
  catch (e) {
    if (my === session) loadError.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
// Re-run when the wallet connects too: the connected wallet reports the public key of an undeployed W5.
watch([owner, () => tc.wallet.value?.address], load)
watch(network, () => {
  config.value = null
  load()
})

const jetton = computed(() => jettons.value.find(j => j.master === selected.value) ?? null)
const items = computed(() => jettons.value.map(j => ({ label: `${j.symbol} · ${formatJettonAmount(j.balance, j.decimals, { maxDecimals: 4 })}`, value: j.master })))
const isW5 = computed(() => !account.value || account.value.status !== 'active' || (account.value.interfaces ?? []).some(i => i.startsWith('wallet_v5')))
const walletKind = computed(() => (account.value?.interfaces ?? []).find(i => i.startsWith('wallet_'))?.replace('wallet_', '') ?? 'unknown')

const formProblem = computed(() => {
  const j = jetton.value
  if (!j) return null
  if (amount.value !== null && amount.value <= 0n) return 'Enter an amount greater than zero.'
  if (amount.value !== null && amount.value > j.balance - j.locked) return `More than your balance (${formatJettonAmount(j.balance - j.locked, j.decimals, { symbol: j.symbol })}).`
  if (recipient.value?.account?.memo_required && !comment.value.trim()) return 'This exchange needs the memo from its deposit page in the comment field.'
  return null
})
const canQuote = computed(() => !!jetton.value && !!recipient.value && !recipient.value.blocked && amount.value !== null && !formProblem.value && !!publicKey.value && isW5.value && !!owner.value)

// ------------------------------------------------------------ quote
const estimate = shallowRef<GaslessEstimate | null>(null)
const quoting = ref(false)
const quoteError = ref<unknown>(null)
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(clock))

async function quote() {
  const j = jetton.value
  const r = recipient.value
  if (!canQuote.value || !j || !r || amount.value === null || !owner.value || !config.value) return
  quoting.value = true
  quoteError.value = null
  estimate.value = null
  try {
    const body = estimateRequest({
      owner: owner.value,
      publicKey: publicKey.value!,
      jettonWallet: Address.parse(j.wallet),
      amount: amount.value,
      destination: r.address,
      relay: Address.parse(config.value.relay_address),
      comment: comment.value,
      queryId: newQueryId()
    })
    const e = await tonapiPost<GaslessEstimate>(`gasless/estimate/${j.master}`, body)
    const bad = checkEstimate(e, body, Address.parse(config.value.relay_address))
    if (bad) throw new Error(`${bad} Nothing was signed.`)
    confirmed.value = false
    estimate.value = e
  }
  catch (e) {
    quoteError.value = e
  }
  finally {
    quoting.value = false
  }
}
// Any change to the form invalidates the quote.
watch([selected, () => recipient.value?.destination, amount, comment, owner], () => {
  estimate.value = null
  confirmed.value = false
  sent.value = null
  sendError.value = null
})

const messages = computed<TonConnectMessage[]>(() => (estimate.value ? toTonConnectMessages(estimate.value) : []))
const commission = computed(() => (estimate.value ? BigInt(estimate.value.commission) : null))
const expiresIn = computed(() => (estimate.value ? secondsLeft(estimate.value, now.value) : 0))
const afterFee = computed(() => {
  const j = jetton.value
  if (!j || commission.value === null || amount.value === null) return null
  return j.balance - j.locked - amount.value - commission.value
})

// ------------------------------------------------------------ sign + relay
const confirmed = ref(false)
const sending = ref(false)
const sendError = ref<unknown>(null)
const sent = ref<{ hash: string, external?: string } | null>(null)
const trace = shallowRef<TonTrace | null>(null)
const waiting = ref(false)

const isOwnerConnected = computed(() => !!tc.wallet.value && !!owner.value && Address.parse(tc.wallet.value.address).equals(owner.value))

async function relay(hex: string): Promise<{ protocol_name: string, external?: string }> {
  // The relayer can briefly reject while it catches up with the chain: retry like the TON docs recipe.
  let last: unknown
  for (let i = 0; i < 5; i++) {
    try {
      return await tonapiPost<{ protocol_name: string, external?: string }>('gasless/send', { wallet_public_key: publicKey.value, boc: hex })
    }
    catch (e) {
      last = e
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  throw last
}

async function send() {
  const e = estimate.value
  if (!e || !confirmed.value) return
  sending.value = true
  sendError.value = null
  try {
    const { internalBoc } = await tc.signMessage({ messages: messages.value, validUntil: e.valid_until })
    const wrapped = wrapSignedInternal(internalBoc)
    const res = await relay(wrapped.hex)
    sent.value = { hash: wrapped.hash, external: res.external }
  }
  catch (err) {
    sendError.value = err
    return
  }
  finally {
    sending.value = false
  }
  if (sent.value.external) {
    waiting.value = true
    try {
      trace.value = await tc.waitForTransaction(sent.value.external)
    }
    catch (err) {
      sendError.value = err
    }
    finally {
      waiting.value = false
    }
  }
}

function example() {
  to.value = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'
  amountText.value = '0.1'
  comment.value = `Paid without ${COIN_SYMBOL}`
}
</script>

<template>
  <div class="space-y-6">
    <OwnerBar v-model:owner="owner" :example="EXAMPLE_OWNER" example-label="Try an example (W5 wallet holding USD₮)" @example="example" />

    <LoadingState v-if="loading" label="Loading supported tokens…" />
    <ErrorNotice v-else-if="loadError" :error="loadError" title="Could not load the gasless settings" @retry="load" />

    <template v-else-if="owner && config">
      <UAlert
        v-if="!isW5"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Gasless sending needs a W5 wallet"
        :description="`This wallet is ${walletKind}. Only W5 (wallet v5) can sign a message for a relayer. Create a W5 wallet in Tonkeeper or MyTonWallet and move your tokens there, or send normally with ${COIN_SYMBOL} for fees.`"
      />
      <UAlert v-else-if="!publicKey" color="neutral" variant="subtle" icon="i-lucide-info" description="Connect this wallet to get a quote: its public key is needed and the wallet has not been used on chain yet." />
      <UAlert
        v-if="!jettons.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :description="`This wallet holds none of the ${config.gas_jettons.length} tokens the relayer accepts as fee (USD₮ and a few others). Gasless sending only works for those.`"
      />

      <div v-if="jetton" class="space-y-4">
        <UFormField label="Token (the fee is paid in it too)">
          <USelect v-model="selected" :items="items" class="w-full sm:w-80" data-testid="jetton-select" />
        </UFormField>
        <RecipientInput v-model="to" purpose="jetton" :comment="comment" :self="owner" @resolved="recipient = $event" />
        <AmountInput v-model="amountText" v-model:nano="amount" :label="`Amount (${jetton.symbol})`" :unit="jetton.symbol" :decimals="jetton.decimals" />
        <UAlert v-if="formProblem" color="error" variant="subtle" icon="i-lucide-octagon-x" :description="formProblem" />
        <UFormField label="Comment (optional)">
          <UInput v-model="comment" class="w-full" placeholder="e.g. invoice 42" />
          <template #help>
            Comments are public on chain.
          </template>
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton label="Get fee quote" icon="i-lucide-calculator" :loading="quoting" :disabled="!canQuote" data-testid="quote-button" @click="quote" />
          <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" @click="example" />
        </div>
        <ErrorNotice v-if="quoteError" :error="quoteError" title="The relayer could not quote this transfer" @retry="quote" />
      </div>

      <section v-if="estimate && commission !== null && jetton" class="space-y-4" data-testid="gasless-quote">
        <KeyValue
          :items="[
            { label: 'You send', value: formatJettonAmount(amount ?? 0n, jetton.decimals, { symbol: jetton.symbol }), mono: true, copy: false },
            { label: 'Relayer fee', value: formatJettonAmount(commission, jetton.decimals, { symbol: jetton.symbol }), mono: true, copy: false, hint: `Paid in the token as a second transfer to the relayer. No ${COIN_SYMBOL} needed.` },
            { label: 'Balance after', value: afterFee === null ? '—' : formatJettonAmount(afterFee, jetton.decimals, { symbol: jetton.symbol }), mono: true, copy: false },
            { label: 'Quote valid for', value: expiresIn > 0 ? `${expiresIn} s` : 'expired: get a new quote', copy: false }
          ]"
        />
        <UAlert v-if="afterFee !== null && afterFee < 0n" color="error" variant="subtle" icon="i-lucide-octagon-x" description="Amount plus fee is more than your balance. Lower the amount and get a new quote." />

        <TxPreview :messages="messages" />
        <p class="text-xs text-muted">
          The {{ COIN_SYMBOL }} amounts above are attached by the relayer, not taken from you: your wallet only signs, and the relayer pays the network fee.
        </p>

        <WalletGate purpose="sign the gasless transfer">
          <div class="space-y-3">
            <UAlert v-if="!isOwnerConnected" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="The connected wallet is not the one this quote is for. Clear the preview address or connect that wallet." />
            <UAlert
              v-else-if="!tc.supportsSignMessage.value"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Your wallet app cannot sign gasless messages"
              :description="`${tc.wallet.value?.walletName ?? 'This wallet'} does not offer TonConnect signMessage. Use a W5 wallet in an app that supports it (for example Tonkeeper), or send normally with ${COIN_SYMBOL} for fees.`"
            />
            <template v-else-if="!sent">
              <UCheckbox v-model="confirmed" label="I checked the recipient, amount and fee. This transfer cannot be undone." color="error" />
              <UButton
                :label="`Sign and send (no ${COIN_SYMBOL} needed)`"
                icon="i-lucide-send"
                size="lg"
                :loading="sending"
                :disabled="!confirmed || expiresIn <= 0 || (afterFee !== null && afterFee < 0n)"
                data-testid="send-button"
                @click="send"
              />
            </template>
            <ErrorNotice v-if="sendError" :error="sendError" />
            <div v-if="sent" class="space-y-2 rounded-lg border border-default p-4 text-sm">
              <ResultField label="Signed message hash (normalized)" :value="sent.hash" />
              <LoadingState v-if="waiting" label="Relayed. Waiting for the transfer to land (up to 2 minutes)…" />
              <UAlert v-else-if="trace" color="success" variant="subtle" icon="i-lucide-circle-check" title="Sent and confirmed">
                <template #description>
                  <ExplorerLinks kind="tx" :value="trace.external_hash" />
                </template>
              </UAlert>
              <template v-else>
                <UAlert color="success" variant="subtle" icon="i-lucide-circle-check" title="Submitted to the relayer" description="Check your wallet history in a minute." />
                <ExplorerLinks v-if="owner" kind="address" :value="owner.toString({ bounceable: false, testOnly: isTestnet })" />
              </template>
            </div>
          </div>
        </WalletGate>
      </section>
    </template>
  </div>
</template>
