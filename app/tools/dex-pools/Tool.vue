<script setup lang="ts">
import { POPULAR, defiJson, formatPrice, formatUsd } from '~/lib/prices-defi/assets'
import type { DexPair, StonfiPool, StonfiPoolInfo } from './logic'
import { csvRows, dedustFeePct, dexLabel, poolAppUrl, searchUrl, stonfiPoolInfo, tonPairs } from './logic'

const tonapi = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()

const query = ref('')
const searched = ref('')
const pairs = ref<DexPair[]>([])
// DexScreener answers at most 30 pairs per query: past that the list is a sample, not every pool.
const capped = ref(false)
const loading = ref(false)
const error = ref<unknown>(null)
const open = ref<string | null>(null)

let seq = 0
async function search(q = query.value) {
  q = q.trim()
  if (!q) return
  query.value = q
  const id = ++seq
  loading.value = true
  error.value = null
  open.value = null
  try {
    const res = await defiJson<{ pairs: DexPair[] | null }>(searchUrl(q), 'DexScreener')
    if (id !== seq) return
    pairs.value = tonPairs(res.pairs)
    capped.value = (res.pairs?.length ?? 0) >= 30
    searched.value = q
  }
  catch (e) {
    if (id === seq) error.value = e
  }
  finally {
    if (id === seq) loading.value = false
  }
}

// ---- details for the opened pool
interface Detail { state: 'loading' | 'ok' | 'error', stonfi?: StonfiPoolInfo, dedustFee?: number, error?: unknown }
const details = reactive<Record<string, Detail>>({})

async function loadDetail(p: DexPair) {
  details[p.pairAddress] = { state: 'loading' }
  try {
    if (p.dexId === 'stonfi') {
      const r = await defiJson<{ pool: StonfiPool }>(`https://api.ston.fi/v1/pools/${encodeURIComponent(p.pairAddress)}`, 'STON.fi')
      details[p.pairAddress] = { state: 'ok', stonfi: stonfiPoolInfo(r.pool) }
    }
    else if (p.dexId === 'dedust') {
      const r = await tonapi.get<{ decoded: { trade_fee_numerator: string, trade_fee_denominator: string } }>(`blockchain/accounts/${encodeURIComponent(p.pairAddress)}/methods/get_trade_fee`)
      details[p.pairAddress] = { state: 'ok', dedustFee: dedustFeePct(r.decoded) }
    }
    else details[p.pairAddress] = { state: 'ok' }
  }
  catch (e) {
    details[p.pairAddress] = { state: 'error', error: e }
  }
}

function toggle(p: DexPair) {
  open.value = open.value === p.pairAddress ? null : p.pairAddress
  if (open.value && details[p.pairAddress]?.state !== 'ok') loadDetail(p)
}

const pct = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`)
const amt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 4 }))
// No GRAM chip: GRAM is in thousands of pools and DexScreener returns 30 arbitrary ones. USD₮ lists the GRAM/USD₮ pools.
const chips = POPULAR.filter(p => p.kind === 'jetton').map(p => ({ label: p.symbol, q: p.address }))

function stonfiItems(s: StonfiPoolInfo) {
  return [
    { label: 'Swap fee', value: `${s.totalFee}%`, hint: `${s.lpFee}% to liquidity providers + ${s.protocolFee}% protocol`, copy: false },
    { label: 'LP APY (1d / 7d / 30d)', value: [s.apy.d1, s.apy.d7, s.apy.d30].map(x => (x === null ? '—' : `${x.toFixed(2)}%`)).join(' / '), hint: 'Annualised from recent fees; past yield, not a promise. Excludes impermanent loss.', copy: false },
    { label: 'TVL (STON.fi)', value: formatUsd(s.tvlUsd), copy: false },
    { label: 'Router', value: s.router, hint: `STON.fi ${s.version}${s.deprecated ? ' · deprecated pool' : ''}` }
  ]
}
</script>

<template>
  <div class="space-y-5">
    <UAlert v-if="isTestnet" color="info" variant="subtle" icon="i-lucide-info" title="Mainnet pools" description="DEX pools and prices shown here are on mainnet." />

    <form class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="search()">
      <UFormField label="Token" hint="Symbol, name or jetton master address" class="flex-1">
        <UInput v-model="query" size="lg" class="w-full" placeholder="e.g. NOT or EQAvlWFD…" autocomplete="off" icon="i-lucide-search" />
      </UFormField>
      <UButton type="submit" label="Find pools" size="lg" :loading="loading" :disabled="!query.trim()" />
    </form>
    <div class="flex flex-wrap items-center gap-1.5 text-xs">
      <span class="text-muted">Popular:</span>
      <UButton v-for="c in chips" :key="c.q" :label="c.label" size="xs" color="neutral" variant="outline" @click="search(c.q)" />
    </div>

    <ErrorNotice :error="error" title="Search failed" @retry="search()" />
    <LoadingState v-if="loading && !pairs.length" label="Looking up pools…" />

    <p v-if="searched && !loading && !pairs.length && !error" class="rounded-lg border border-dashed border-default p-5 text-sm text-muted">
      No TON pools found for “{{ searched }}”. For a new token, paste its jetton master address.
    </p>

    <section v-if="pairs.length" class="space-y-2" aria-live="polite">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          {{ pairs.length }} pool{{ pairs.length === 1 ? '' : 's' }} on TON
        </h3>
        <CsvExportButton :rows="csvRows(pairs)" :filename="`pools-${searched.slice(0, 12)}`" />
      </div>
      <p v-if="capped" class="text-xs text-muted">
        DexScreener returns at most 30 pools per search, so this list may miss some. Search by jetton master address to see one token's pools.
      </p>

      <div class="hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-3 px-3 text-xs text-muted md:grid">
        <span>Pair</span><span class="text-right">Price</span><span class="text-right">Liquidity</span><span class="text-right">Volume 24h</span><span class="text-right">Change 24h</span>
      </div>

      <ul class="space-y-2">
        <li v-for="p in pairs" :key="p.pairAddress" class="rounded-lg border border-default" :data-testid="`pool-${p.pairAddress}`">
          <button type="button" class="grid w-full grid-cols-2 gap-x-3 gap-y-1 p-3 text-left hover:bg-elevated/50 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] md:items-center" :aria-expanded="open === p.pairAddress" @click="toggle(p)">
            <span class="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
              <UIcon :name="open === p.pairAddress ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 shrink-0 text-muted" />
              <span class="truncate font-medium text-highlighted">{{ p.baseToken.symbol }}/{{ p.quoteToken.symbol }}</span>
              <UBadge :label="dexLabel(p.dexId)" size="sm" variant="subtle" :color="p.dexId === 'stonfi' ? 'primary' : 'neutral'" />
            </span>
            <span class="text-sm md:text-right"><span class="text-xs text-muted md:hidden">Price </span><span class="font-mono">{{ p.priceUsd ? `$${formatPrice(Number(p.priceUsd))}` : '—' }}</span></span>
            <span class="text-sm md:text-right"><span class="text-xs text-muted md:hidden">Liquidity </span><span class="font-mono">{{ formatUsd(p.liquidity?.usd) }}</span></span>
            <span class="text-sm md:text-right"><span class="text-xs text-muted md:hidden">Vol 24h </span><span class="font-mono">{{ formatUsd(p.volume?.h24) }}</span></span>
            <span class="text-sm md:text-right"><span class="text-xs text-muted md:hidden">24h </span><span class="font-mono" :class="(p.priceChange?.h24 ?? 0) > 0 ? 'text-success' : (p.priceChange?.h24 ?? 0) < 0 ? 'text-error' : ''">{{ pct(p.priceChange?.h24) }}</span></span>
          </button>

          <div v-if="open === p.pairAddress" class="space-y-3 border-t border-default p-3">
            <div>
              <div class="text-xs text-muted">
                Pool contract
              </div>
              <AddressLink :address="p.pairAddress" />
            </div>
            <KeyValue
              :items="[
                { label: 'Reserves', value: `${amt(p.liquidity?.base)} ${p.baseToken.symbol} + ${amt(p.liquidity?.quote)} ${p.quoteToken.symbol}`, copy: false },
                { label: `Price in ${p.quoteToken.symbol}`, value: p.priceNative ? `1 ${p.baseToken.symbol} = ${formatPrice(Number(p.priceNative), 8)} ${p.quoteToken.symbol}` : '—', copy: false },
                { label: 'Trades 24h', value: p.txns?.h24 ? `${p.txns.h24.buys} buys · ${p.txns.h24.sells} sells` : '—', copy: false },
                ...(p.pairCreatedAt ? [{ label: 'Created', value: new Date(p.pairCreatedAt).toLocaleDateString(), copy: false }] : [])
              ]"
            />
            <LoadingState v-if="details[p.pairAddress]?.state === 'loading'" :label="`Reading ${dexLabel(p.dexId)} pool details…`" />
            <ErrorNotice v-else-if="details[p.pairAddress]?.state === 'error'" :error="details[p.pairAddress]!.error" title="Could not load pool details" @retry="loadDetail(p)" />
            <KeyValue v-else-if="details[p.pairAddress]?.stonfi" :items="stonfiItems(details[p.pairAddress]!.stonfi!)" />
            <KeyValue v-else-if="details[p.pairAddress]?.dedustFee !== undefined" :items="[{ label: 'Swap fee', value: `${details[p.pairAddress]!.dedustFee}%`, hint: 'Read from the pool contract (get_trade_fee).', copy: false }]" />
            <div class="flex flex-wrap items-center gap-2">
              <UButton v-if="poolAppUrl(p)" :to="poolAppUrl(p)!" target="_blank" rel="noopener" :label="`Open on ${dexLabel(p.dexId)}`" trailing-icon="i-lucide-external-link" size="xs" color="neutral" variant="outline" />
              <UButton v-if="p.url?.startsWith('https://dexscreener.com/')" :to="p.url" target="_blank" rel="noopener" label="DexScreener chart" trailing-icon="i-lucide-external-link" size="xs" color="neutral" variant="outline" />
              <UButton :to="`/tools/swap-quote`" label="Compare swap quotes" icon="i-lucide-git-compare-arrows" size="xs" color="neutral" variant="ghost" />
            </div>
          </div>
        </li>
      </ul>
    </section>

    <p class="text-xs text-dimmed">
      Pool list, prices and volume from DexScreener (reserves are read from the chain). Fees and APY from STON.fi's API, or from the DeDust pool contract. Anyone can create a pool: a token name proves nothing, check the address.
    </p>
  </div>
</template>
