<script setup lang="ts">
import AssetPicker from '~/lib/prices-defi/AssetPicker.vue'
import type { Asset } from '~/lib/prices-defi/assets'
import { FIATS, NATIVE, POPULAR, assetKey, fiatAsset, formatPrice } from '~/lib/prices-defi/assets'
import type { TonapiRates } from './logic'
import { convert, priceChange, ratesQuery } from './logic'

const tonapi = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()

const amount = ref('1')
const from = ref<Asset>(NATIVE)
const to = ref<Asset>(fiatAsset('USD'))
const rates = ref<TonapiRates | null>(null)
const loadedAt = ref<Date | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

const value = computed(() => {
  const n = Number(amount.value.replace(/[\s,]/g, ''))
  return amount.value.trim() && Number.isFinite(n) && n >= 0 ? n : null
})

let seq = 0
async function load() {
  const id = ++seq
  loading.value = true
  error.value = null
  try {
    const r = await tonapi.get<TonapiRates>('rates', ratesQuery([from.value, to.value, POPULAR.find(p => p.symbol === 'USD₮')!]))
    if (id !== seq) return
    rates.value = r
    loadedAt.value = new Date()
  }
  catch (e) {
    if (id === seq) error.value = e
  }
  finally {
    if (id === seq) loading.value = false
  }
}
watch(() => [assetKey(from.value), assetKey(to.value)], load, { immediate: true })

function flip() {
  ;[from.value, to.value] = [to.value, from.value]
}

const result = computed(() => (rates.value && value.value !== null ? convert(value.value, from.value, to.value, rates.value) : null))
const unit = computed(() => (rates.value ? convert(1, from.value, to.value, rates.value) : null))
const missing = computed(() => rates.value && unit.value === null)

// Change of the token side priced in the other side (fiat or GRAM).
const change = computed(() => {
  if (!rates.value) return null
  const [token, other] = from.value.kind === 'fiat' ? [to.value, from.value] : [from.value, to.value]
  const quote = other.kind === 'jetton' ? fiatAsset('USD') : other
  const c = priceChange(token, quote, rates.value)
  return c && { token, quote, ...c }
})

const others = computed(() => {
  if (!rates.value || value.value === null) return []
  const list = [NATIVE, POPULAR.find(p => p.symbol === 'USD₮')!, ...FIATS]
  return list
    .filter(a => assetKey(a) !== assetKey(from.value))
    .map(a => ({ a, v: convert(value.value!, from.value, a, rates.value!) }))
    .filter(x => x.v !== null)
})

const fmt = (n: number | null) => (n === null ? '—' : formatPrice(n, 8))
const pct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
const pctColor = (n: number | null) => (n === null || n === 0 ? 'neutral' : n > 0 ? 'success' : 'error')

function example(fromA: Asset, toA: Asset, amt: string) {
  from.value = fromA
  to.value = toA
  amount.value = amt
}
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="isTestnet" color="info" variant="subtle" icon="i-lucide-info" title="Mainnet prices" description="Testnet coins have no market value. These are live mainnet prices." />

    <div class="grid items-end gap-4 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_minmax(0,1fr)]">
      <UFormField label="Amount">
        <UInput v-model="amount" inputmode="decimal" size="lg" class="w-full" :ui="{ base: 'font-mono' }" autocomplete="off" aria-label="Amount to convert" />
      </UFormField>
      <AssetPicker v-model="from" label="From" fiat />
      <UButton icon="i-lucide-arrow-left-right" color="neutral" variant="outline" size="lg" class="justify-self-center" aria-label="Swap from and to" @click="flip" />
      <AssetPicker v-model="to" label="To" fiat />
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted">Try:</span>
      <UButton :label="`100 ${COIN_SYMBOL} → EUR`" size="xs" color="neutral" variant="outline" @click="example(NATIVE, fiatAsset('EUR'), '100')" />
      <UButton label="1M NOT → USD" size="xs" color="neutral" variant="outline" @click="example(POPULAR.find(p => p.symbol === 'NOT')!, fiatAsset('USD'), '1000000')" />
      <UButton :label="`50 USD → ${COIN_SYMBOL}`" size="xs" color="neutral" variant="outline" @click="example(fiatAsset('USD'), NATIVE, '50')" />
      <UButton :label="`1000 TRY → USD₮`" size="xs" color="neutral" variant="outline" @click="example(fiatAsset('TRY'), POPULAR.find(p => p.symbol === 'USD₮')!, '1000')" />
    </div>

    <ErrorNotice :error="error" title="Could not load prices" @retry="load" />
    <LoadingState v-if="loading && !rates" label="Loading live prices…" />

    <UAlert v-if="missing" color="warning" variant="subtle" icon="i-lucide-circle-help" title="No price for this token" description="tonapi has no market price for this jetton. It may have no liquid DEX pool yet. Check the DEX pool explorer." />

    <section v-if="rates && unit !== null" class="space-y-4" aria-live="polite">
      <div class="rounded-lg border border-default p-5">
        <div class="text-sm text-muted">
          {{ value ?? '—' }} {{ from.symbol }} =
        </div>
        <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="font-mono text-3xl font-semibold break-all text-highlighted" data-testid="result">{{ fmt(result) }}</span>
          <span class="text-lg text-muted">{{ to.symbol }}</span>
          <CopyButton v-if="result !== null" :value="fmt(result).replace(/,/g, '')" size="xs" />
        </div>
        <div class="mt-2 space-y-0.5 font-mono text-sm text-muted">
          <div>1 {{ from.symbol }} = {{ fmt(unit) }} {{ to.symbol }}</div>
          <div>1 {{ to.symbol }} = {{ fmt(1 / unit) }} {{ from.symbol }}</div>
        </div>
        <div v-if="change" class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted">{{ change.token.symbol }} in {{ change.quote.symbol }}:</span>
          <UBadge :color="pctColor(change.d24)" variant="subtle" :label="`24h ${pct(change.d24)}`" />
          <UBadge :color="pctColor(change.d7)" variant="subtle" :label="`7d ${pct(change.d7)}`" />
          <UBadge :color="pctColor(change.d30)" variant="subtle" :label="`30d ${pct(change.d30)}`" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-dimmed">
        <span>Market rates from tonapi.io<span v-if="loadedAt">, loaded {{ loadedAt.toLocaleTimeString() }}</span>. Indicative only: a real trade also pays DEX fees and price impact.</span>
        <UButton icon="i-lucide-refresh-cw" label="Refresh" size="xs" color="neutral" variant="ghost" :loading="loading" @click="load" />
      </div>

      <div v-if="others.length">
        <h3 class="mb-2 font-display text-sm font-semibold text-highlighted">
          {{ value }} {{ from.symbol }} in other currencies
        </h3>
        <ul class="grid gap-x-6 sm:grid-cols-2">
          <li v-for="o in others" :key="assetKey(o.a)" class="flex items-center justify-between gap-3 border-b border-default py-1.5 text-sm">
            <span class="min-w-0 truncate"><span class="font-medium">{{ o.a.symbol }}</span> <span class="text-muted">{{ o.a.name }}</span></span>
            <span class="font-mono tabular-nums">{{ fmt(o.v) }}</span>
          </li>
        </ul>
      </div>
    </section>

    <p class="text-xs text-dimmed">
      {{ COIN_RENAME_NOTE }} Price sites may still list it as TON or Toncoin.
    </p>
  </div>
</template>
