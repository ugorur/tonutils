<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import JettonPicker from '~/lib/jettons-read/JettonPicker.vue'
import type { TonapiJetton } from '~/lib/jettons-read/core'
import { friendly, jettonBasics, toRaw, verificationInfo } from '~/lib/jettons-read/core'
import { loadUplot } from '~/utils/lazy'
import { USDT_MASTER } from '~/utils/ton/jetton'
import type { DexPair, ToncenterJettonMaster } from './logic'
import { chartColumns, isRenounced, marketCap, metadataSource, parseDiff, topPools, trustSignals, usd } from './logic'

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const toncenter = useToncenter()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const masterRaw = computed(() => {
  try {
    return input.value.trim() ? toRaw(input.value) : null
  }
  catch {
    return null
  }
})

const loading = ref(false)
const error = ref<unknown>(null)
const jetton = ref<TonapiJetton | null>(null)
const master = ref<ToncenterJettonMaster | null>(null)
const governed = ref(false)
const price = ref<{ usd?: number, diff24h?: number, diff7d?: number } | null>(null)
const pairs = ref<DexPair[] | null>(null)
const marketError = ref('')
let runId = 0

async function lookup() {
  const raw = masterRaw.value
  if (!raw) return
  const id = ++runId
  loading.value = true
  error.value = null
  jetton.value = null
  master.value = null
  governed.value = false
  price.value = null
  pairs.value = null
  marketError.value = ''
  try {
    // tonapi and toncenter have separate queues, so these run side by side.
    const tcPromise = Promise.all([
      toncenter.v3<{ jetton_masters: ToncenterJettonMaster[] }>('jetton/masters', { address: raw }).then(r => r.jetton_masters[0] ?? null, () => null),
      toncenter.v3<{ jetton_wallets: { address: string }[], address_book: Record<string, { interfaces?: string[] }> }>('jetton/wallets', { jetton_address: raw, limit: 1 })
        .then(r => Object.values(r.address_book ?? {}).some(b => b.interfaces?.includes('jetton_wallet_governed')), () => false)
    ])
    let j: TonapiJetton
    try {
      j = await tonapi.get<TonapiJetton>(`jettons/${raw}`)
    }
    catch (e) {
      if ((e as { status?: number }).status === 404) throw new Error('This address is not a jetton master. Paste the token contract address (not your wallet or a jetton wallet).')
      throw e
    }
    if (id !== runId) return
    jetton.value = j
    const [m, gov] = await tcPromise
    if (id !== runId) return
    master.value = m
    governed.value = gov
    if (!isTestnet.value) loadMarket(raw, id)
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

async function loadMarket(raw: string, id: number) {
  const ds = fetch(`https://api.dexscreener.com/latest/dex/tokens/${friendly(raw)}`)
    .then(r => (r.ok ? r.json() : null))
    .then((r: { pairs?: DexPair[] } | null) => r?.pairs ?? [], () => null)
  try {
    const r = await tonapi.get<{ rates: Record<string, { prices?: Record<string, number>, diff_24h?: Record<string, string>, diff_7d?: Record<string, string> }> }>('rates', { tokens: raw, currencies: 'usd' })
    const rate = Object.values(r.rates ?? {})[0]
    if (id === runId) price.value = { usd: rate?.prices?.USD, diff24h: parseDiff(rate?.diff_24h?.USD), diff7d: parseDiff(rate?.diff_7d?.USD) }
  }
  catch {
    if (id === runId) marketError.value = 'Price is unavailable right now.'
  }
  const p = await ds
  if (id === runId) pairs.value = p
  if (id === runId && price.value?.usd) loadChart()
}

// ---------- chart ----------
const RANGES = [{ label: '7d', value: 7 }, { label: '30d', value: 30 }, { label: '1y', value: 365 }]
const range = ref(30)
const chartEl = ref<HTMLElement>()
const chartLoading = ref(false)
const chartEmpty = ref(false)
let plot: { destroy: () => void, setSize: (s: { width: number, height: number }) => void } | null = null
let resize: ResizeObserver | null = null

async function loadChart() {
  if (!jetton.value) return
  const id = runId
  chartLoading.value = true
  chartEmpty.value = false
  try {
    const now = Math.floor(Date.now() / 1000)
    const r = await tonapi.get<{ points: [number, number][] }>('rates/chart', { token: jetton.value.metadata.address, currency: 'usd', start_date: now - range.value * 86400, end_date: now, points_count: 200 })
    if (id !== runId) return
    const [x, y] = chartColumns(r.points ?? [])
    chartEmpty.value = x.length < 2
    if (chartEmpty.value) return
    const UPlot = await loadUplot()
    await nextTick()
    const el = chartEl.value
    if (!el || id !== runId) return
    plot?.destroy()
    const axis = getComputedStyle(el).color
    const grid = 'rgba(127,127,127,0.15)'
    plot = new UPlot({
      width: el.clientWidth,
      height: 200,
      legend: { show: false },
      cursor: { y: false },
      scales: { x: { time: true } },
      series: [{}, { label: 'USD', stroke: '#0098ea', width: 2, fill: 'rgba(0,152,234,0.10)', value: (_u: unknown, v: number) => usd(v) }],
      axes: [
        { stroke: axis, grid: { stroke: grid }, ticks: { stroke: grid } },
        { stroke: axis, grid: { stroke: grid }, ticks: { stroke: grid }, size: 72, values: (_u: unknown, vals: number[]) => vals.map(v => usd(v)) }
      ]
    }, [x, y], el)
    resize?.disconnect()
    resize = new ResizeObserver(() => plot?.setSize({ width: el.clientWidth, height: 200 }))
    resize.observe(el)
  }
  catch {
    if (id === runId) chartEmpty.value = true
  }
  finally {
    if (id === runId) chartLoading.value = false
  }
}
watch(range, loadChart)
onBeforeUnmount(() => {
  resize?.disconnect()
  plot?.destroy()
})

// ---------- derived ----------
const basics = computed(() => (jetton.value ? jettonBasics(jetton.value) : null))
const supply = computed(() => BigInt(jetton.value?.total_supply ?? '0'))
// null when toncenter could not be reached: unknown, not "on-chain".
const source = computed(() => (master.value ? metadataSource(master.value.jetton_content) : null))
const adminRaw = computed(() => master.value ? master.value.admin_address : jetton.value?.admin?.address ?? null)
const signals = computed(() => jetton.value
  ? trustSignals({ verification: jetton.value.verification, admin: adminRaw.value, mintable: jetton.value.mintable, governed: governed.value, source: source.value })
  : [])
const cap = computed(() => (price.value?.usd && basics.value ? marketCap(supply.value, basics.value.decimals, price.value.usd) : null))
const pools = computed(() => topPools(pairs.value))
const diffClass = (d: number) => (d < 0 ? 'text-error' : d > 0 ? 'text-success' : 'text-muted')
// Third-party URL: only follow plain https links (no javascript: etc.).
const safeUrl = (u: string) => (/^https:\/\//i.test(u) ? u : undefined)
const masterFriendly = computed(() => (basics.value ? friendly(basics.value.raw, { testnet: isTestnet.value }) : ''))

const details = computed<KeyValueItem[]>(() => {
  if (!jetton.value || !basics.value) return []
  const items: KeyValueItem[] = [
    { label: 'Master address', value: masterFriendly.value },
    { label: 'Raw address', value: basics.value.raw },
    { label: 'Total supply', value: `${formatAmount(supply.value, basics.value.decimals)} ${basics.value.symbol}` },
    { label: 'Total supply in base units', value: jetton.value.total_supply },
    { label: 'Decimals', value: String(basics.value.decimals), hint: `1 ${basics.value.symbol} = 10^${basics.value.decimals} base units` },
    { label: 'Mintable flag', value: jetton.value.mintable ? 'Yes' : 'No', copy: false, mono: false, hint: 'Reported by the contract\'s get_jetton_data. Without an admin nobody can mint, whatever this says.' },
  ]
  const src = source.value
  if (src) items.push({ label: 'Metadata', value: src.uri ?? src.label, mono: !!src.uri, copy: !!src.uri, hint: src.uri ? `${src.label}${src.mutable ? ': hosted on a web server' : ''}` : 'Name, symbol and logo are stored in the contract itself.' })
  if (master.value?.jetton_wallet_code_hash) items.push({ label: 'Jetton wallet code hash', value: master.value.jetton_wallet_code_hash, hint: governed.value ? 'Governed wallet code: the admin can lock holders\' wallets.' : undefined })
  return items
})

const SIGNAL_STYLE = {
  good: { icon: 'i-lucide-circle-check', class: 'text-success' },
  info: { icon: 'i-lucide-info', class: 'text-info' },
  warn: { icon: 'i-lucide-triangle-alert', class: 'text-warning' },
  bad: { icon: 'i-lucide-shield-alert', class: 'text-error' }
} as const

const poolColumns = [
  { accessorKey: 'pair', header: 'Pool' },
  { accessorKey: 'liquidity', header: 'Liquidity' },
  { accessorKey: 'volume24h', header: 'Volume 24h' }
]

function tryExample() {
  input.value = USDT_MASTER
  lookup()
}

onMounted(() => {
  if (masterRaw.value) lookup()
})
watch(network, () => {
  if (jetton.value) lookup()
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <JettonPicker v-model="input" @pick="lookup" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" icon="i-lucide-search" label="Look up token" :loading="loading" :disabled="!masterRaw" />
        <UButton v-if="!isTestnet" label="Try an example (USD₮)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
    </form>

    <LoadingState v-if="loading && !jetton" label="Loading token…" />
    <ErrorNotice :error="error" title="Could not load the token" @retry="lookup" />

    <template v-if="jetton && basics">
      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex flex-wrap items-start gap-4">
          <UAvatar :src="basics.image" :alt="basics.symbol" size="3xl" />
          <div class="min-w-0 flex-1 basis-48">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-lg font-semibold break-words text-highlighted">
                {{ basics.name }}
              </h2>
              <UBadge color="neutral" variant="outline" :label="basics.symbol" />
              <UBadge :color="verificationInfo(basics.verification).color" variant="subtle" :label="verificationInfo(basics.verification).label" />
            </div>
            <p v-if="jetton.metadata.description" class="mt-1 text-sm break-words text-muted">
              {{ jetton.metadata.description }}
            </p>
            <div class="mt-2">
              <ExplorerLinks kind="jetton" :value="masterFriendly" />
            </div>
          </div>
        </div>

        <div v-if="!isTestnet" class="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div class="text-xs text-muted">
              Price
            </div>
            <div class="text-xl font-semibold text-highlighted">
              {{ price?.usd ? usd(price.usd) : price ? 'No price' : marketError || '…' }}
            </div>
            <div v-if="price?.diff24h !== undefined" class="text-xs">
              <span :class="diffClass(price.diff24h)">{{ price.diff24h > 0 ? '+' : '' }}{{ price.diff24h }}% 24h</span>
              <template v-if="price.diff7d !== undefined">
                · <span :class="diffClass(price.diff7d)">{{ price.diff7d > 0 ? '+' : '' }}{{ price.diff7d }}% 7d</span>
              </template>
            </div>
          </div>
          <div v-if="cap">
            <div class="text-xs text-muted">
              Fully diluted value
            </div>
            <div class="text-xl font-semibold text-highlighted">
              {{ usd(cap, { compact: true }) }}
            </div>
            <div class="text-xs text-dimmed">
              supply × price
            </div>
          </div>
          <div>
            <div class="text-xs text-muted">
              Holders
            </div>
            <div class="text-xl font-semibold text-highlighted">
              {{ jetton.holders_count.toLocaleString('en-US') }}
            </div>
            <NuxtLink :to="`/tools/jetton-holders?address=${masterFriendly}`" class="text-xs text-primary hover:underline">
              See top holders
            </NuxtLink>
          </div>
        </div>
      </section>

      <section>
        <h3 class="text-sm font-semibold text-highlighted">
          Safety checks
        </h3>
        <ul class="mt-2 space-y-2">
          <li v-for="s in signals" :key="s.title" class="flex gap-2.5 text-sm">
            <UIcon :name="SIGNAL_STYLE[s.level].icon" class="mt-0.5 size-4 shrink-0" :class="SIGNAL_STYLE[s.level].class" />
            <div>
              <span class="font-medium text-highlighted">{{ s.title }}.</span>{{ ' ' }}<span class="text-muted">{{ s.text }}</span>
            </div>
          </li>
        </ul>
        <div v-if="adminRaw && !isRenounced(adminRaw)" class="mt-3 text-sm">
          <span class="text-xs text-muted">Admin address</span>
          <div>
            <AddressLink :address="adminRaw" :bounceable="false" />
          </div>
        </div>
      </section>

      <section>
        <h3 class="text-sm font-semibold text-highlighted">
          Details
        </h3>
        <KeyValue :items="details" />
      </section>

      <section v-if="!isTestnet && price?.usd">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Price chart (USD)
          </h3>
          <UTabs v-model="range" :content="false" :items="RANGES" size="xs" />
        </div>
        <div class="relative mt-2 min-h-[200px] text-muted">
          <div ref="chartEl" class="w-full" />
          <LoadingState v-if="chartLoading" label="Loading chart…" class="absolute inset-x-0 top-0" />
          <p v-if="chartEmpty && !chartLoading" class="absolute inset-x-0 top-0 text-sm">
            No price history for this range.
          </p>
        </div>
        <p class="mt-1 text-xs text-dimmed">
          Prices from tonapi.
        </p>
      </section>

      <section v-if="!isTestnet && pairs">
        <h3 class="text-sm font-semibold text-highlighted">
          DEX pools
        </h3>
        <UTable :data="pools" :columns="poolColumns" class="mt-2" :ui="{ td: 'py-2 px-2 sm:px-4', th: 'py-2 px-2 sm:px-4' }">
          <template #pair-cell="{ row }">
            <div>
              <a :href="safeUrl(row.original.url)" target="_blank" rel="noopener" class="text-sm text-highlighted hover:text-primary">{{ row.original.pair }}</a>
              <div class="text-xs text-muted">
                {{ row.original.dex }} · <AddressLink :address="row.original.address" no-links />
              </div>
            </div>
          </template>
          <template #liquidity-cell="{ row }">
            <span class="whitespace-nowrap">{{ usd(row.original.liquidity, { compact: true }) }}</span>
          </template>
          <template #volume24h-cell="{ row }">
            <span class="whitespace-nowrap">{{ usd(row.original.volume24h, { compact: true }) }}</span>
          </template>
          <template #empty>
            <span class="text-sm text-muted">No DEX pools with liquidity found.</span>
          </template>
        </UTable>
        <p class="mt-1 text-xs text-dimmed">
          Pools on STON.fi, DeDust and other TON DEXes, from DexScreener. Deep liquidity makes a token easier to sell.
        </p>
      </section>
    </template>
  </div>
</template>
