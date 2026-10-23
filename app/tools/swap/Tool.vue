<script setup lang="ts">
import { Cell } from '@ton/core'
import type { SendResult, TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import AssetPicker from '~/lib/prices-defi/AssetPicker.vue'
import type { Asset, TonapiJettonMeta } from '~/lib/prices-defi/assets'
import { NATIVE, POPULAR, applySlippage, assetFromTonapi, assetKey, defiJson, formatPrice, ids } from '~/lib/prices-defi/assets'
import type { DexContracts, SwapCoffeeRoute, SwapCoffeeTx } from '~/lib/prices-defi/swapcoffee'
import { DEDUST_FACTORY, SWAP_COFFEE, checkSwapTxs, dedustAssetSlice, routeBody, routeOutUnits, routeParts, stonfiContracts, toMessages, transactionsBody } from '~/lib/prices-defi/swapcoffee'
import { HIGH_IMPACT, assetParam, balanceProblem } from './logic'

const tc = useTonConnect()
const toncenter = useToncenter('mainnet')
const tonapi = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()
const route = useRoute()

const from = ref<Asset>(NATIVE)
const to = ref<Asset>(POPULAR.find(p => p.symbol === 'USD₮')!)
const amount = ref('')
const units = ref<bigint | null>(null)
const slippage = ref(0.01)
const SLIPPAGES = [0.005, 0.01, 0.03]

// ---- prefill from ?from=&to=&amount= (the quote tool links here)
async function assetFromParam(v: unknown): Promise<Asset | null> {
  const p = assetParam(v)
  if (!p) return null
  if (p === 'native') return NATIVE
  return POPULAR.find(a => a.address === p) ?? assetFromTonapi(await tonapi.get<TonapiJettonMeta>(`jettons/${p}`))
}
onMounted(async () => {
  try {
    const [f, t] = await Promise.all([assetFromParam(route.query.from), assetFromParam(route.query.to)])
    if (f) from.value = f
    if (t) to.value = t
  }
  catch { /* keep defaults */ }
  if (typeof route.query.amount === 'string' && /^\d+(\.\d+)?$/.test(route.query.amount)) amount.value = route.query.amount
})

// ---- balances of the connected wallet
const balances = ref<{ gram: bigint, jetton?: bigint, jettonWallet?: string } | null>(null)
const balanceError = ref<unknown>(null)
async function loadBalances() {
  const w = tc.wallet.value
  if (!w || isTestnet.value) return
  balanceError.value = null
  try {
    const acc = await toncenter.v3<{ balance: string }>('account', { address: w.address })
    const b: { gram: bigint, jetton?: bigint, jettonWallet?: string } = { gram: BigInt(acc.balance ?? 0) }
    if (from.value.kind === 'jetton') {
      const jw = await toncenter.v3<{ jetton_wallets: { address: string, balance: string }[] }>('jetton/wallets', { owner_address: w.address, jetton_address: from.value.address, limit: 1 })
      b.jetton = BigInt(jw.jetton_wallets[0]?.balance ?? 0)
      b.jettonWallet = jw.jetton_wallets[0]?.address
    }
    balances.value = b
  }
  catch (e) {
    // toncenter v3 /account answers 404 for a never-used wallet.
    if (e instanceof TonApiError && e.status === 404) balances.value = { gram: 0n, jetton: 0n }
    else balanceError.value = e
  }
}
watch(() => [tc.wallet.value?.address, assetKey(from.value)], () => {
  balances.value = null
  loadBalances()
}, { immediate: true })

const fromBalance = computed(() => (balances.value ? (from.value.kind === 'native' ? balances.value.gram : balances.value.jetton ?? 0n) : null))
function setMax() {
  if (fromBalance.value === null) return
  // Keep 0.3 GRAM for gas when paying in GRAM.
  const max = from.value.kind === 'native' ? fromBalance.value - 300_000_000n : fromBalance.value
  amount.value = max > 0n ? formatAmount(max, from.value.decimals, { group: false }) : '0'
}

// ---- route + messages
const quote = ref<SwapCoffeeRoute | null>(null)
const txs = ref<SwapCoffeeTx[]>([])
const quotedAt = ref<Date | null>(null)
const busy = ref(false)
const error = ref<unknown>(null)
const ack = ref(false)
const ackUnverified = ref(false)

function clearTxs() {
  txs.value = []
  dexes.value = null
  buildError.value = null
  ack.value = false
  ackUnverified.value = false
  sent.value = null
  trace.value = null
  sendError.value = null
}
function reset() {
  quote.value = null
  clearTxs()
}
watch(() => [assetKey(from.value), assetKey(to.value), amount.value, slippage.value], reset)

function flip() {
  ;[from.value, to.value] = [to.value, from.value]
}

const same = computed(() => assetKey(from.value) === assetKey(to.value))
const canQuote = computed(() => !!units.value && units.value > 0n && !same.value && !isTestnet.value)

// Step 1: route (no wallet needed).
async function getRoute() {
  if (!canQuote.value) return
  reset()
  busy.value = true
  error.value = null
  try {
    const r = await defiJson<SwapCoffeeRoute>(`${SWAP_COFFEE}/v1/route`, 'swap.coffee', { post: true, body: routeBody(from.value, to.value, Number(amount.value)) })
    if (!r.paths?.length || !r.output_amount) throw new Error('No route found for this pair and amount. Try a smaller amount or another token.')
    quote.value = r
    quotedAt.value = new Date()
  }
  catch (e) {
    error.value = routeError(e)
  }
  finally {
    busy.value = false
  }
}

// The only contracts swap funds may enter, from sources independent of swap.coffee:
// STON.fi's router list (routers + pTON wallets) and the DeDust factory's vault for the input asset.
const dexes = shallowRef<DexContracts | null>(null)
let stonfi: ReturnType<typeof stonfiContracts> | null = null
async function loadDexes(f: Asset): Promise<DexContracts> {
  stonfi ??= stonfiContracts(await defiJson<{ router_list: { address: string, pton_wallet_address?: string }[] }>('https://api.ston.fi/v1/routers', 'STON.fi'))
  const res = await rateLimitedJson<{ exit_code: number, stack: { type: string, value: string }[] }>(
    `${toncenter.baseUrl()}/v3/runGetMethod`,
    { provider: 'toncenter' },
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: DEDUST_FACTORY, method: 'get_vault_address', stack: [{ type: 'slice', value: dedustAssetSlice(f) }] }) }
  )
  const cell = res.exit_code === 0 ? res.stack[0]?.value : undefined
  return { ...stonfi, dedustVault: cell ? Cell.fromBase64(cell).beginParse().loadAddress() : null }
}

// Step 2: messages for the connected wallet, rebuilt when the route or the wallet changes.
const building = ref(false)
const buildError = ref<unknown>(null)
async function buildTxs() {
  const w = tc.wallet.value
  const r = quote.value
  clearTxs()
  if (!w || !r || tc.networkMismatch.value) return
  building.value = true
  try {
    const [built, d] = await Promise.all([
      defiJson<{ transactions: SwapCoffeeTx[] }>(`${SWAP_COFFEE}/v2/route/transactions`, 'swap.coffee', { post: true, body: transactionsBody(w.friendly, slippage.value, r) }),
      loadDexes(from.value)
    ])
    if (quote.value === r) {
      dexes.value = d
      txs.value = built.transactions ?? []
    }
  }
  catch (e) {
    buildError.value = routeError(e)
  }
  finally {
    building.value = false
  }
}
watch(() => [quote.value, tc.wallet.value?.address, tc.networkMismatch.value], buildTxs)

function routeError(e: unknown) {
  return e instanceof TonApiError && e.provider === ('swap.coffee' as string) && e.status >= 400 && e.status < 500 ? new Error(`swap.coffee could not route this swap (${(e.body as { error?: string } | undefined)?.error ?? e.status}).`) : e
}

const outUnits = computed(() => (quote.value ? routeOutUnits(quote.value, to.value.decimals) : 0n))
const minOut = computed(() => applySlippage(outUnits.value, slippage.value))
const impact = computed(() => Math.abs(quote.value?.price_impact ?? 0))
const parts = computed(() => (quote.value ? routeParts(quote.value) : []))
const messages = computed<TonConnectMessage[]>(() => toMessages(txs.value))
const gas = computed(() => (from.value.kind === 'native'
  ? messages.value.reduce((s, m) => s + BigInt(m.amount), 0n) - (units.value ?? 0n)
  : messages.value.reduce((s, m) => s + BigInt(m.amount), 0n)))
const check = computed(() => (txs.value.length && units.value ? checkSwapTxs(txs.value, { from: from.value, units: units.value, owner: tc.wallet.value?.address, jettonWallet: balances.value?.jettonWallet, dexes: dexes.value ?? undefined }) : { errors: [], notes: [], unverified: 0 }))
const balanceIssue = computed(() => (balances.value && units.value && txs.value.length ? balanceProblem(from.value, units.value, gas.value, balances.value) : null))
const blocked = computed(() => !txs.value.length || check.value.errors.length > 0 || !!balanceIssue.value || (impact.value >= HIGH_IMPACT && !ack.value) || (check.value.unverified > 0 && !ackUnverified.value))

// ---- send
const sent = ref<SendResult | null>(null)
const trace = ref<TonTrace | null>(null)
const sending = ref(false)
const waiting = ref(false)
const sendError = ref<unknown>(null)
const failed = computed(() => (trace.value ? Object.values(trace.value.transactions).filter(x => x.description?.aborted || x.description?.compute_ph?.success === false).length : 0))

async function send() {
  if (blocked.value) return
  sending.value = true
  sendError.value = null
  try {
    sent.value = await tc.sendTransaction({ messages: messages.value })
  }
  catch (e) {
    sendError.value = e
    return
  }
  finally {
    sending.value = false
  }
  waiting.value = true
  try {
    trace.value = await tc.waitForTransaction(sent.value.hash)
    loadBalances()
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    waiting.value = false
  }
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="isTestnet"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Swaps run on mainnet only"
      description="DEX liquidity and the swap.coffee router exist on mainnet. Switch the network in the header to mainnet to swap."
    />

    <div v-else class="space-y-5">
      <div class="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <AssetPicker v-model="from" label="You pay" />
        <UButton icon="i-lucide-arrow-left-right" color="neutral" variant="outline" size="lg" class="justify-self-center" aria-label="Swap tokens" @click="flip" />
        <AssetPicker v-model="to" label="You get" />
      </div>

      <div class="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <AmountInput v-model="amount" v-model:nano="units" label="Amount you pay" :unit="from.symbol" :decimals="from.decimals" placeholder="0.0" />
          <div v-if="tc.wallet.value" class="mt-1 flex items-center gap-2 text-xs text-muted">
            <span>Balance:
              <TokenAmount v-if="fromBalance !== null" :nano="fromBalance" :decimals="from.decimals" :symbol="from.symbol" :max-decimals="4" />
              <template v-else>…</template>
            </span>
            <UButton v-if="fromBalance" label="Max" size="xs" variant="link" class="p-0" @click="setMax" />
          </div>
        </div>
        <UFormField label="Slippage tolerance">
          <div class="flex gap-1">
            <UButton v-for="s in SLIPPAGES" :key="s" :label="pct(s, 1)" size="lg" :color="slippage === s ? 'primary' : 'neutral'" :variant="slippage === s ? 'solid' : 'outline'" @click="slippage = s" />
          </div>
        </UFormField>
      </div>
      <p v-if="same" class="text-sm text-error">
        Pick two different tokens.
      </p>
      <ErrorNotice :error="balanceError" title="Could not read your balance" @retry="loadBalances" />

      <UButton icon="i-lucide-route" :label="quote ? 'Refresh route' : 'Get best route'" size="lg" :loading="busy" :disabled="!canQuote" @click="getRoute" />
      <ErrorNotice :error="error" title="No route" @retry="getRoute" />

      <section v-if="quote" class="space-y-4">
        <div class="rounded-lg border border-default p-4">
          <div class="text-sm text-muted">
            You get about
          </div>
          <div class="text-2xl text-highlighted" data-testid="swap-out">
            <TokenAmount :nano="outUnits" :decimals="to.decimals" :symbol="to.symbol" :max-decimals="6" />
          </div>
          <dl class="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                Minimum received ({{ pct(slippage, 1) }} slippage)
              </dt>
              <dd><TokenAmount :nano="minOut" :decimals="to.decimals" :symbol="to.symbol" :max-decimals="6" /></dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                Price impact
              </dt>
              <dd><UBadge :color="impact >= HIGH_IMPACT ? 'error' : impact >= 0.01 ? 'warning' : 'success'" variant="subtle" :label="pct(impact)" /></dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                Rate
              </dt>
              <dd class="font-mono">
                1 {{ from.symbol }} = {{ formatPrice(quote.output_amount / quote.input_amount) }} {{ to.symbol }}
              </dd>
            </div>
            <div v-if="quote.input_usd" class="flex justify-between gap-3">
              <dt class="text-muted">
                Value
              </dt>
              <dd class="font-mono">
                ${{ formatPrice(quote.input_usd) }} → ${{ formatPrice(quote.output_usd ?? 0) }}
              </dd>
            </div>
          </dl>
          <ul class="mt-3 space-y-1 text-sm">
            <li v-for="(p, i) in parts" :key="i" class="flex flex-wrap items-center gap-x-2">
              <UIcon name="i-lucide-route" class="size-4 text-muted" />
              <span v-if="parts.length > 1" class="font-mono text-xs text-muted">{{ Math.round(p.share * 100) }}%</span>
              <span>{{ p.symbols.join(' → ') }}</span>
              <span class="text-muted">via {{ [...new Set(p.dexes)].join(' + ') }}</span>
            </li>
          </ul>
          <p class="mt-2 text-xs text-dimmed">
            Route by swap.coffee at {{ quotedAt?.toLocaleTimeString() }}. Prices move; refresh if you wait. If the price moves past your slippage, the DEX refunds you (minus gas).
          </p>
        </div>

        <WalletGate purpose="swap tokens">
          <template #default="{ wallet }">
            <div class="space-y-4">
              <LoadingState v-if="building" label="Building the swap messages for your wallet…" />
              <ErrorNotice :error="buildError" title="Could not build the swap" @retry="buildTxs" />

              <UAlert v-for="e in check.errors" :key="e" color="error" variant="subtle" icon="i-lucide-shield-alert" title="Blocked: the messages failed a safety check" :description="e" />
              <UAlert v-for="n in check.notes" :key="n" color="info" variant="subtle" icon="i-lucide-info" :description="n" />
              <UAlert v-if="balanceIssue" color="warning" variant="subtle" icon="i-lucide-wallet" :title="balanceIssue" />

              <TxPreview v-if="messages.length" :messages="messages" />

              <UCheckbox v-if="check.unverified" v-model="ackUnverified" color="warning" :label="`${check.unverified} message(s) use a DEX format TonUtils cannot read, so it could not check who receives the output. I checked the messages above.`" />
              <UCheckbox v-if="impact >= HIGH_IMPACT" v-model="ack" color="error" :label="`I understand the price impact is ${pct(impact)}: I get noticeably less than the market rate.`" />

              <div class="flex flex-wrap items-center gap-3">
                <UButton icon="i-lucide-send" :label="`Swap in ${wallet.walletName || 'wallet'}`" size="lg" :loading="sending" :disabled="blocked || !!sent" @click="send" />
                <UButton :to="`https://app.ston.fi/swap?ft=${ids.app(from)}&tt=${ids.app(to)}&fa=${amount}`" target="_blank" rel="noopener" label="Or swap on STON.fi" trailing-icon="i-lucide-external-link" size="sm" color="neutral" variant="ghost" />
              </div>
              <ErrorNotice :error="sendError" title="Swap not sent" />

              <div v-if="sent" class="space-y-3 rounded-lg border border-default p-4" aria-live="polite">
                <LoadingState v-if="waiting" label="Sent. Waiting for the swap to finish on-chain (up to 2 minutes)…" />
                <template v-else-if="trace">
                  <UAlert v-if="failed" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Part of the swap did not go through" :description="`${failed} transaction(s) in the chain failed, usually because the price moved past your slippage. The DEX refunds the tokens minus gas. Check the explorer.`" />
                  <UAlert v-else color="success" variant="subtle" icon="i-lucide-circle-check" title="Swap finished" :description="`All ${trace.transactions_order.length} transactions succeeded.`" />
                  <ExplorerLinks kind="tx" :value="trace.external_hash" />
                </template>
                <ExplorerLinks v-else kind="tx" :value="sent.hash" />
              </div>
            </div>
          </template>
        </WalletGate>
      </section>
    </div>

    <p class="text-xs text-dimmed">
      Routing by the swap.coffee aggregator across STON.fi, DeDust and other TON DEXes. TonUtils checks the messages before you sign (amount, your own jetton wallet, gas cap, that your funds enter a real STON.fi router or DeDust vault, and that the output and refunds come back to your wallet) and shows them decoded; your wallet signs them. Compare prices first with the
      <ULink to="/tools/swap-quote" class="underline">swap quote tool</ULink>.
    </p>
  </div>
</template>
