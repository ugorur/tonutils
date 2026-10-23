<script setup lang="ts">
import type uPlot from 'uplot'
import AssetPicker from '~/lib/prices-defi/AssetPicker.vue'
import type { Asset } from '~/lib/prices-defi/assets'
import { FIAT_CODES, NATIVE, POPULAR, assetKey, formatPrice } from '~/lib/prices-defi/assets'
import { loadUplot } from '~/utils/lazy'
import type { Point } from './logic'
import { RANGES, chartQuery, chartStats, csvRows, normalizePoints } from './logic'

const tonapi = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()

const asset = ref<Asset>(NATIVE)
const currency = ref('USD')
const range = ref('30d')
const points = ref<Point[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
const hover = ref<Point | null>(null)

const currencyItems = computed(() => [
  ...(asset.value.kind === 'jetton' ? [{ label: `${COIN_SYMBOL} (price in ${COIN_SYMBOL})`, value: 'TON' }] : []),
  ...FIAT_CODES.map(c => ({ label: c, value: c }))
])
const unit = computed(() => (currency.value === 'TON' ? COIN_SYMBOL : currency.value))
watch(asset, (a) => {
  if (a.kind === 'native' && currency.value === 'TON') currency.value = 'USD'
})

let seq = 0
async function load() {
  const id = ++seq
  loading.value = true
  error.value = null
  try {
    const r = RANGES.find(x => x.id === range.value)!
    const token = asset.value.kind === 'native' ? 'ton' : asset.value.address
    const res = await tonapi.get<{ points: Point[] }>('rates/chart', chartQuery(token, currency.value, r))
    if (id !== seq) return
    points.value = normalizePoints(res.points ?? [])
  }
  catch (e) {
    if (id === seq) {
      error.value = e
      points.value = []
    }
  }
  finally {
    if (id === seq) loading.value = false
  }
}
watch(() => [assetKey(asset.value), currency.value, range.value], load, { immediate: true })

const stats = computed(() => chartStats(points.value))
const shown = computed(() => hover.value ?? stats.value?.last ?? null)
const fmtTime = (t: number) => new Date(t * 1000).toLocaleString(undefined, range.value === '1d' ? { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`

// ---- chart
const el = ref<HTMLElement>()
let plot: uPlot | null = null
let ro: ResizeObserver | null = null

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

async function draw() {
  if (!el.value) return
  const UPlot = await loadUplot()
  plot?.destroy()
  plot = null
  if (!points.value.length || !el.value) return
  const up = (stats.value?.change ?? 0) >= 0
  const [line, fill] = up ? ['#16a34a', 'rgba(22,163,74,0.12)'] : ['#dc2626', 'rgba(220,38,38,0.12)']
  const axis = { stroke: cssVar('--ui-text-muted', '#64748b'), grid: { stroke: cssVar('--ui-border', '#e2e8f0'), width: 1 }, ticks: { show: false } }
  plot = new UPlot({
    width: el.value.clientWidth,
    height: 300,
    legend: { show: false },
    cursor: { y: false, points: { size: 8 } },
    scales: { x: { time: true } },
    axes: [axis, { ...axis, size: 64, values: (_u, vals) => vals.map(v => formatPrice(v, 4)) }],
    series: [{}, { stroke: line, width: 2, fill, points: { show: false } }],
    hooks: {
      setCursor: [(u) => {
        const i = u.cursor.idx
        hover.value = i === null || i === undefined ? null : [u.data[0][i]!, u.data[1]![i] as number]
      }]
    }
  }, [points.value.map(p => p[0]), points.value.map(p => p[1])], el.value)
}

watch(points, () => nextTick(draw))
onMounted(() => {
  ro = new ResizeObserver(() => {
    if (plot && el.value) plot.setSize({ width: el.value.clientWidth, height: 300 })
  })
  if (el.value) ro.observe(el.value)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  plot?.destroy()
})

function example(a: Asset, c: string, r: string) {
  asset.value = a
  currency.value = c
  range.value = r
}
</script>

<template>
  <div class="space-y-5">
    <UAlert v-if="isTestnet" color="info" variant="subtle" icon="i-lucide-info" title="Mainnet prices" description="Testnet coins have no market value. This chart shows mainnet prices." />

    <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <AssetPicker v-model="asset" label="Token" />
      <UFormField label="Price in">
        <USelectMenu v-model="currency" :items="currencyItems" value-key="value" size="lg" class="w-full" />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-1" role="group" aria-label="Time range">
        <UButton v-for="r in RANGES" :key="r.id" :label="r.label" size="sm" :color="range === r.id ? 'primary' : 'neutral'" :variant="range === r.id ? 'solid' : 'ghost'" :aria-pressed="range === r.id" @click="range = r.id" />
      </div>
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="text-muted">Try:</span>
        <UButton :label="`NOT in ${COIN_SYMBOL}, 3M`" size="xs" color="neutral" variant="outline" @click="example(POPULAR.find(p => p.symbol === 'NOT')!, 'TON', '90d')" />
        <UButton :label="`${COIN_SYMBOL} in EUR, 1Y`" size="xs" color="neutral" variant="outline" @click="example(NATIVE, 'EUR', '1y')" />
      </div>
    </div>

    <ErrorNotice :error="error" title="Could not load the chart" @retry="load" />

    <div v-if="stats && shown" class="flex flex-wrap items-end justify-between gap-3" aria-live="polite">
      <div>
        <div class="text-xs text-muted">
          {{ asset.symbol }} · {{ fmtTime(shown[0]) }}
        </div>
        <div class="font-mono text-2xl font-semibold text-highlighted" data-testid="price">
          {{ formatPrice(shown[1], 6) }} <span class="font-sans text-base text-muted">{{ unit }}</span>
        </div>
      </div>
      <UBadge :color="stats.change >= 0 ? 'success' : 'error'" variant="subtle" size="lg" :label="`${pct(stats.change)} in ${RANGES.find(r => r.id === range)!.label}`" />
    </div>

    <div class="relative min-h-[300px] w-full">
      <div ref="el" class="w-full" data-testid="chart" />
      <div v-if="loading" class="absolute inset-0 grid place-items-center bg-default/60">
        <LoadingState label="Loading price history…" />
      </div>
      <p v-else-if="!points.length && !error" class="absolute inset-0 grid place-items-center text-sm text-muted">
        No price history for this token. It may have no liquid market.
      </p>
    </div>

    <KeyValue
      v-if="stats"
      :items="[
        { label: 'Range high', value: `${formatPrice(stats.high[1], 8)} ${unit}`, hint: fmtTime(stats.high[0]), copy: false },
        { label: 'Range low', value: `${formatPrice(stats.low[1], 8)} ${unit}`, hint: fmtTime(stats.low[0]), copy: false },
        { label: 'Start of range', value: `${formatPrice(stats.first[1], 8)} ${unit}`, hint: fmtTime(stats.first[0]), copy: false },
        { label: 'Latest', value: `${formatPrice(stats.last[1], 8)} ${unit}`, hint: fmtTime(stats.last[0]), copy: false }
      ]"
    />

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-dimmed">
      <span>Data from tonapi.io, up to 200 points per range. History starts in 2022. {{ COIN_RENAME_NOTE }}</span>
      <CsvExportButton :rows="csvRows(points, unit)" :filename="`${asset.symbol}-${unit}-${range}`.toLowerCase()" label="Download CSV" />
    </div>
  </div>
</template>
