<script setup lang="ts">
import { Address } from '@ton/core'
import AssetPicker from '~/lib/prices-defi/AssetPicker.vue'
import type { Asset } from '~/lib/prices-defi/assets'
import { NATIVE, POPULAR, assetKey, defiJson, ids } from '~/lib/prices-defi/assets'
import type { SwapCoffeeRoute } from '~/lib/prices-defi/swapcoffee'
import { SWAP_COFFEE, routeBody } from '~/lib/prices-defi/swapcoffee'
import type { DedustHop, LivePool, Quote, StonfiSimulation } from './logic'
import { dedustPlanBody, dedustQuote, rankQuotes, shortfall, stonfiQuote, stonfiSimulateUrl, swapCoffeeQuote } from './logic'

const tonapi = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()

const from = ref<Asset>(NATIVE)
const to = ref<Asset>(POPULAR.find(p => p.symbol === 'USD₮')!)
const amount = ref('10')
const units = ref<bigint | null>(null)
const slippage = ref(0.01)
const SLIPPAGES = [0.005, 0.01, 0.03]

type Source = Quote['source']
interface Result { source: Source, state: 'loading' | 'ok' | 'error', quote?: Quote, error?: unknown }
const results = ref<Result[]>([])
const ran = ref<{ from: Asset, to: Asset, amount: string } | null>(null)

const same = computed(() => assetKey(from.value) === assetKey(to.value))
const canRun = computed(() => !!units.value && units.value > 0n && !same.value)

function flip() {
  ;[from.value, to.value] = [to.value, from.value]
}

function symbolOf(dedustAsset: string): string {
  if (dedustAsset === 'native') return COIN_SYMBOL
  const raw = dedustAsset.replace(/^jetton:/, '')
  const hit = [from.value, to.value, ...POPULAR].find(a => a.kind === 'jetton' && Address.parse(a.address).toRawString() === raw)
  return hit?.symbol ?? `${raw.slice(0, 6)}…`
}

async function dedust(f: Asset, t: Asset, u: bigint, s: number): Promise<Quote> {
  const plan = await defiJson<DedustHop[][]>('https://api.dedust.io/v2/routing/plan', 'DeDust', { post: true, body: dedustPlanBody(f, t, u) })
  const hops = plan[0]
  if (!hops?.length) throw new Error('DeDust has no pool route for this pair.')
  const live: LivePool[] = []
  for (const h of hops) {
    const [res, fee] = await Promise.all([
      tonapi.get<{ decoded: { reserve0: string, reserve1: string } }>(`blockchain/accounts/${h.pool.address}/methods/get_reserves`),
      tonapi.get<{ decoded: { trade_fee_numerator: string, trade_fee_denominator: string } }>(`blockchain/accounts/${h.pool.address}/methods/get_trade_fee`)
    ])
    live.push({ reserves: [BigInt(res.decoded.reserve0), BigInt(res.decoded.reserve1)], feeNum: BigInt(fee.decoded.trade_fee_numerator), feeDen: BigInt(fee.decoded.trade_fee_denominator) })
  }
  return dedustQuote(hops, live, f, t, u, s, symbolOf)
}

const sources: Record<Source, (f: Asset, t: Asset, u: bigint, s: number, amt: string) => Promise<Quote>> = {
  'STON.fi': async (f, t, u, s) => stonfiQuote(await defiJson<StonfiSimulation>(stonfiSimulateUrl(f, t, u, s), 'STON.fi', { post: true }), f, t, u),
  'DeDust': dedust,
  'swap.coffee': async (f, t, _u, s, amt) => swapCoffeeQuote(await defiJson<SwapCoffeeRoute>(`${SWAP_COFFEE}/v1/route`, 'swap.coffee', { post: true, body: routeBody(f, t, Number(amt)) }), f, t, s)
}

let seq = 0
async function run() {
  if (!canRun.value) return
  const id = ++seq
  const [f, t, u, s, amt] = [from.value, to.value, units.value!, slippage.value, amount.value.trim()]
  ran.value = { from: f, to: t, amount: amt }
  results.value = (Object.keys(sources) as Source[]).map(source => ({ source, state: 'loading' }))
  await Promise.all(results.value.map(async (_r, i) => {
    const source = results.value[i]!.source
    try {
      const quote = await sources[source](f, t, u, s, amt)
      if (id === seq) results.value[i] = { source, state: 'ok', quote }
    }
    catch (e) {
      const err = e instanceof TonApiError && (e.status === 400 || e.status === 404) ? new Error(`${source} has no route for this pair or amount.`) : e
      if (id === seq) results.value[i] = { source, state: 'error', error: err }
    }
  }))
}

const ranked = computed(() => rankQuotes(results.value.flatMap(r => (r.quote ? [r.quote] : []))))
const best = computed(() => ranked.value[0])
const pending = computed(() => results.value.filter(r => r.state !== 'ok'))
const impactColor = (x: number | null) => (x === null ? 'neutral' : x >= 0.05 ? 'error' : x >= 0.01 ? 'warning' : 'success')
const pct = (x: number | null, d = 2) => (x === null ? '—' : `${(x * 100).toFixed(d)}%`)

function example(f: Asset, t: Asset, a: string) {
  from.value = f
  to.value = t
  amount.value = a
  nextTick(run)
}
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="isTestnet" color="info" variant="subtle" icon="i-lucide-info" title="Mainnet DEXes" description="STON.fi, DeDust and swap.coffee quote mainnet pools only. These quotes are for mainnet." />

    <div class="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <AssetPicker v-model="from" label="You pay" />
      <UButton icon="i-lucide-arrow-left-right" color="neutral" variant="outline" size="lg" class="justify-self-center" aria-label="Swap tokens" @click="flip" />
      <AssetPicker v-model="to" label="You get" />
    </div>

    <div class="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <AmountInput v-model="amount" v-model:nano="units" label="Amount you pay" :unit="from.symbol" :decimals="from.decimals" />
      <UFormField label="Slippage tolerance">
        <div class="flex gap-1">
          <UButton v-for="s in SLIPPAGES" :key="s" :label="pct(s, 1)" size="lg" :color="slippage === s ? 'primary' : 'neutral'" :variant="slippage === s ? 'solid' : 'outline'" @click="slippage = s" />
        </div>
      </UFormField>
    </div>
    <p v-if="same" class="text-sm text-error">
      Pick two different tokens.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <UButton icon="i-lucide-git-compare-arrows" label="Compare quotes" size="lg" :disabled="!canRun" :loading="pending.some(r => r.state === 'loading')" @click="run" />
      <span class="text-sm text-muted">Try:</span>
      <UButton :label="`100 ${COIN_SYMBOL} → USD₮`" size="xs" color="neutral" variant="outline" @click="example(NATIVE, POPULAR.find(p => p.symbol === 'USD₮')!, '100')" />
      <UButton label="500 USD₮ → NOT" size="xs" color="neutral" variant="outline" @click="example(POPULAR.find(p => p.symbol === 'USD₮')!, POPULAR.find(p => p.symbol === 'NOT')!, '500')" />
      <UButton :label="`1M DOGS → ${COIN_SYMBOL}`" size="xs" color="neutral" variant="outline" @click="example(POPULAR.find(p => p.symbol === 'DOGS')!, NATIVE, '1000000')" />
    </div>

    <section v-if="ran" class="space-y-3" aria-live="polite">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        {{ ran.amount }} {{ ran.from.symbol }} → {{ ran.to.symbol }}
      </h3>

      <article v-for="q in ranked" :key="q.source" class="rounded-lg border p-4" :class="q === best ? 'border-primary' : 'border-default'" :data-testid="`quote-${q.source}`">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="font-display font-semibold text-highlighted">{{ q.source }}</span>
            <UBadge v-if="q === best" label="Best" color="primary" variant="solid" size="sm" />
            <UBadge v-else :label="q.out === best!.out ? 'Same as best' : shortfall(q, best!) < 0.0001 ? '−<0.01%' : `−${pct(shortfall(q, best!))}`" color="neutral" variant="subtle" size="sm" />
          </div>
          <UButton :to="q.link" target="_blank" rel="noopener" :label="`Open ${q.source}`" trailing-icon="i-lucide-external-link" size="xs" color="neutral" variant="ghost" />
        </div>
        <div class="mt-2 text-2xl text-highlighted">
          <TokenAmount :nano="q.out" :decimals="ran.to.decimals" :symbol="ran.to.symbol" :max-decimals="6" />
        </div>
        <dl class="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-3">
            <dt class="text-muted">
              Minimum received
            </dt>
            <dd><TokenAmount :nano="q.minOut" :decimals="ran.to.decimals" :symbol="ran.to.symbol" :max-decimals="6" /></dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted">
              Price impact
            </dt>
            <dd><UBadge :color="impactColor(q.impact)" variant="subtle" :label="pct(q.impact)" /></dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted">
              Fee
            </dt>
            <dd class="text-right">
              {{ q.fee }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted">
              Gas attached
            </dt>
            <dd class="text-right">
              <template v-if="q.gas !== null">
                ~<TokenAmount :nano="q.gas" :max-decimals="3" />
              </template>
              <template v-else>
                —
              </template>
            </dd>
          </div>
        </dl>
        <p class="mt-3 text-sm break-words text-default">
          <UIcon name="i-lucide-route" class="mr-1 inline size-4 align-text-bottom text-muted" />{{ q.route }}
        </p>
        <p v-for="w in q.warnings" :key="w" class="mt-1 text-xs text-warning">
          {{ w }}
        </p>
      </article>

      <div v-for="r in pending" :key="r.source" class="rounded-lg border border-dashed border-default p-4">
        <LoadingState v-if="r.state === 'loading'" :label="`Asking ${r.source}…`" />
        <ErrorNotice v-else :error="r.error" :title="`${r.source}: no quote`" @retry="run" />
      </div>

      <div v-if="best" class="flex flex-wrap items-center gap-3 pt-2">
        <UButton :to="`/tools/swap?from=${ids.swapCoffee(ran.from)}&to=${ids.swapCoffee(ran.to)}&amount=${ran.amount}`" icon="i-lucide-repeat" label="Swap with your wallet" />
        <span class="text-xs text-dimmed">Quotes move with every trade. Gas is attached to the swap and mostly refunded.</span>
      </div>
    </section>

    <p class="text-xs text-dimmed">
      STON.fi quotes come from its simulate API. DeDust's route comes from its API and is re-priced with live pool reserves read on-chain through tonapi, because the API's reserves can lag. swap.coffee is an aggregator that may split a trade across several DEXes.
    </p>
  </div>
</template>
