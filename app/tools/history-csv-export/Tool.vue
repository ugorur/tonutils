<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TableColumn } from '@nuxt/ui'
import type { Asset, TaEventsPage } from '~/lib/tx-user/events'
import { assetKey } from '~/lib/tx-user/events'
import type { RatePoint } from '~/lib/tx-user/rates'
import { FIAT_CURRENCIES, fetchRatePoints } from '~/lib/tx-user/rates'
import type { EventRecord, ExportFormat, FiatPrices } from './logic'
import { PAGE_LIMIT, buildRows, columnsFor, dateBounds, eventRecord, isoDay, keepRecord, presetRange, totals } from './logic'

const EXAMPLE = 'UQA1oZvigoavK2fWe1imzZKmoAx6GlzHA0efVqJFNYJ6Mwtx'
// ponytail: hard caps keep a keyless 1 req/s session bounded; raise them if people export huge wallets.
const MAX_PAGES = 300
const MAX_PRICED_TOKENS = 12

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)
const initial = presetRange('thisYear')
const from = ref(initial.from)
const to = ref(initial.to)
const format = ref<ExportFormat>('detailed')
const currency = ref<string>('USD')
const includeFailed = ref(true)
const hideSpam = ref(true)

const FORMATS = [
  { label: 'Detailed (one row per movement)', value: 'detailed' },
  { label: 'Koinly universal', value: 'koinly' }
]
const CURRENCIES = [{ label: 'No fiat values', value: 'none' }, ...FIAT_CURRENCIES.map(c => ({ label: c, value: c }))]
const PRESETS = [
  { label: 'Last 30 days', value: 'last30' },
  { label: 'This year', value: 'thisYear' },
  { label: 'Last year', value: 'lastYear' }
] as const

const rangeError = computed(() => {
  try {
    dateBounds(from.value, to.value)
    return ''
  }
  catch (e) {
    return (e as Error).message
  }
})

const records = ref<EventRecord[]>([])
const fiat = ref<FiatPrices | undefined>()
const phase = ref<'idle' | 'events' | 'prices' | 'done'>('idle')
const pages = ref(0)
const oldest = ref<number | null>(null)
const truncated = ref(false)
const error = ref<unknown>(null)
const priceError = ref(false)
const exported = ref<{ address: string, from: string, to: string } | null>(null)

let run = 0
const busy = computed(() => phase.value === 'events' || phase.value === 'prices')

function applyPreset(p: typeof PRESETS[number]['value']) {
  const r = presetRange(p)
  from.value = r.from
  to.value = r.to
}

async function start() {
  if (!parsed.value || rangeError.value) return
  const id = ++run
  const { start, end } = dateBounds(from.value, to.value)
  const viewer = parsed.value.toRawString()
  records.value = []
  fiat.value = undefined
  error.value = null
  priceError.value = false
  truncated.value = false
  pages.value = 0
  oldest.value = null
  exported.value = { address: parsed.value.toString({ bounceable: false, testOnly: isTestnet.value }), from: from.value, to: to.value }
  phase.value = 'events'
  try {
    let before: number | undefined
    while (true) {
      const page = await tonapi.get<TaEventsPage>(`accounts/${viewer}/events`, { limit: PAGE_LIMIT, start_date: start, end_date: end, before_lt: before })
      if (id !== run) return
      pages.value++
      // Pending events can change; exported rows must be final.
      records.value.push(...page.events.filter(e => !e.in_progress).map(e => eventRecord(e, viewer)))
      if (page.events.length) oldest.value = page.events.at(-1)!.timestamp
      if (!page.next_from || !page.events.length) break
      if (pages.value >= MAX_PAGES) {
        truncated.value = true
        break
      }
      before = page.next_from
    }
    if (currency.value !== 'none' && network.value === 'mainnet') await loadPrices(id)
    if (id === run) phase.value = 'done'
  }
  catch (e) {
    if (id === run) {
      error.value = e
      phase.value = records.value.length ? 'done' : 'idle'
    }
  }
}

async function loadPrices(id: number) {
  phase.value = 'prices'
  // Capture the currency: the select stays usable during the lookup.
  const cur = currency.value
  const kept = records.value.filter(r => keepRecord(r, { includeFailed: true, hideSpam: true }))
  if (!kept.length) return
  const count = new Map<string, { asset: Asset, n: number }>()
  for (const r of kept) {
    for (const m of r.movements) {
      const c = count.get(assetKey(m.asset)) ?? { asset: m.asset, n: 0 }
      c.n++
      count.set(assetKey(m.asset), c)
    }
  }
  // The fee is always in GRAM, so its price is always needed.
  count.set('native', { asset: count.get('native')?.asset ?? { symbol: COIN_SYMBOL, decimals: COIN_DECIMALS }, n: Infinity })
  const assets = [...count.values()].sort((a, b) => b.n - a.n).slice(0, MAX_PRICED_TOKENS).map(c => c.asset)
  const times = kept.map(r => r.time)
  const lo = Math.min(...times)
  const hi = Math.max(...times)
  const points = new Map<string, RatePoint[]>()
  for (const a of assets) {
    try {
      const pts = await fetchRatePoints(tonapi.get, a, cur, lo, hi)
      if (id !== run) return
      if (pts.length) points.set(assetKey(a), pts)
    }
    catch {
      if (id !== run) return
      priceError.value = true
    }
  }
  if (id === run) fiat.value = { currency: cur, points }
}

function cancel() {
  run++
  // Stopping during the price lookup keeps every event; only stopping the event download truncates.
  if (phase.value === 'events') truncated.value = true
  phase.value = records.value.length ? 'done' : 'idle'
}

function useExample() {
  input.value = EXAMPLE
  // A very active wallet (~100 events a day): two days keeps the example quick.
  from.value = isoDay(new Date(Date.now() - 86_400_000))
  to.value = isoDay(new Date())
  // AddressInput reports the parsed address on the next tick.
  nextTick(start)
}

// Re-price the loaded history when the currency changes after a fetch.
watch(currency, async () => {
  // A running price lookup is restarted with the new currency; a running event download picks it up itself.
  if ((phase.value !== 'done' && phase.value !== 'prices') || !records.value.length) return
  const id = ++run
  fiat.value = undefined
  priceError.value = false
  if (currency.value !== 'none' && network.value === 'mainnet') await loadPrices(id)
  if (id === run) phase.value = 'done'
})

watch(network, () => {
  run++
  records.value = []
  phase.value = 'idle'
})

const opts = computed(() => ({ format: format.value, network: network.value, includeFailed: includeFailed.value, hideSpam: hideSpam.value, fiat: fiat.value }))
const rows = computed(() => buildRows(records.value, opts.value))
const columns = computed(() => columnsFor(opts.value))
const sum = computed(() => totals(records.value, opts.value))
const spamCount = computed(() => records.value.filter(r => r.spam).length)
const filename = computed(() => (exported.value ? `ton-${exported.value.address.slice(0, 8)}-${exported.value.from}_${exported.value.to}${format.value === 'koinly' ? '-koinly' : ''}` : 'ton-history'))

const PREVIEW = 10
const previewColumns = computed<TableColumn<Record<string, unknown>>[]>(() => {
  const keep = format.value === 'koinly'
    ? ['Date', 'Sent Amount', 'Sent Currency', 'Received Amount', 'Received Currency', 'Fee Amount', 'Net Worth Amount', 'Description']
    : ['Date (UTC)', 'Type', 'Direction', 'Amount', 'Token', `Fee (${COIN_SYMBOL})`, ...(fiat.value ? [`Value (${fiat.value.currency})`] : []), 'Counterparty name', 'Comment']
  return keep.map(k => ({ accessorKey: k, header: k }))
})
const preview = computed(() => rows.value.slice(-PREVIEW).reverse())
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="start">
      <AddressInput v-model="input" label="Wallet address" placeholder="UQ… / EQ… / 0:…" @parsed="parsed = $event" />

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="From (UTC)" :error="rangeError || undefined">
          <UInput v-model="from" type="date" class="w-full" />
        </UFormField>
        <UFormField label="To (UTC, inclusive)">
          <UInput v-model="to" type="date" class="w-full" />
        </UFormField>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <UButton v-for="p in PRESETS" :key="p.value" :label="p.label" size="xs" color="neutral" variant="outline" @click="applyPreset(p.value)" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Format">
          <USelect v-model="format" :items="FORMATS" class="w-full" />
        </UFormField>
        <UFormField label="Fiat value" help="Daily rate from tonapi at the time of each transaction.">
          <USelect v-model="currency" :items="CURRENCIES" class="w-full" />
        </UFormField>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <USwitch v-model="includeFailed" label="Include failed transactions (fee only)" />
        <USwitch v-model="hideSpam" label="Leave out likely spam" />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Fetch history" icon="i-lucide-download-cloud" :loading="busy" :disabled="!parsed || !!rangeError || busy" />
        <UButton v-if="busy" label="Stop" color="neutral" variant="outline" @click="cancel" />
        <UButton label="Try an example" variant="link" size="sm" class="px-0" @click="useExample" />
      </div>
    </form>

    <div v-if="busy" class="space-y-1">
      <LoadingState :label="phase === 'events' ? `Reading events… ${records.length} so far${oldest ? `, back to ${day(oldest)}` : ''}` : `Looking up ${currency} prices…`" />
      <p class="text-xs text-muted">
        The free public API allows about one request per second, so long histories take a while (100 events per request).
      </p>
    </div>

    <ErrorNotice v-if="error" :error="error" @retry="start" />

    <template v-if="phase === 'done'">
      <UAlert
        v-if="truncated"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Export is incomplete"
        :description="`Stopped at ${oldest ? day(oldest) : 'the start'}. Narrow the date range and export it in parts to get everything.`"
      />
      <UAlert v-if="priceError" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Some prices could not be loaded" description="Those rows have empty fiat columns. Try again in a minute." />

      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-display text-sm font-semibold text-highlighted">
              {{ sum.events }} event{{ sum.events === 1 ? '' : 's' }}, {{ rows.length }} CSV row{{ rows.length === 1 ? '' : 's' }}
            </h3>
            <p class="text-xs text-muted">
              {{ exported?.from }} to {{ exported?.to }}<template v-if="hideSpam && spamCount">
                · {{ spamCount }} likely spam left out
              </template>
            </p>
          </div>
          <CsvExportButton :rows="rows" :columns="columns" :filename="filename" label="Download CSV" size="md" />
        </div>

        <p v-if="!rows.length" class="py-4 text-center text-sm text-muted">
          No {{ COIN_SYMBOL }} or token movements in this date range.
        </p>

        <div v-else class="grid gap-2 sm:grid-cols-2">
          <div v-for="t in sum.tokens" :key="assetKey(t.asset)" class="rounded-lg border border-default p-3 text-sm">
            <div class="font-medium text-highlighted">
              {{ t.asset.symbol }}
            </div>
            <div class="text-muted">
              In <TokenAmount :nano="t.received" :decimals="t.asset.decimals" :symbol="t.asset.symbol" :max-decimals="4" />
            </div>
            <div class="text-muted">
              Out <TokenAmount :nano="t.sent" :decimals="t.asset.decimals" :symbol="t.asset.symbol" :max-decimals="4" />
            </div>
          </div>
          <div class="rounded-lg border border-default p-3 text-sm">
            <div class="font-medium text-highlighted">
              Network fees paid
            </div>
            <div class="text-muted">
              <TokenAmount :nano="sum.fees" :max-decimals="6" />
            </div>
          </div>
        </div>
      </section>

      <section v-if="rows.length" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Preview (latest {{ Math.min(PREVIEW, rows.length) }} rows)
        </h3>
        <UTable :data="preview" :columns="previewColumns" class="rounded-lg border border-default" />
        <p class="text-xs text-muted">
          The file is built in your browser and is ordered oldest first. Amounts are exact (no rounding); fees are in {{ COIN_SYMBOL }} ({{ COIN_FORMER }}). This is not tax advice: check the rows before filing.
        </p>
      </section>
    </template>
  </div>
</template>
