<script setup lang="ts">
import type { Address } from '@ton/core'
import type { BalanceDiff } from './logic'
import { balanceDiff, dateRange, percentChange, stepPath } from './logic'

const EXAMPLE = { address: 'UQCIyU4WDsGc3jL_5y2bXrNKwiSyiSmyL12YLYQDnWvMRqYo', from: '2026-10-01', to: '2026-10-14' }

const route = useRoute()
const tc = useToncenter()
const { network, isTestnet } = useTonNetwork()

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400_000))

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)
const fromDay = ref(daysAgo(30))
const toDay = ref(iso(new Date()))
const today = iso(new Date())

const range = computed(() => dateRange(fromDay.value, toDay.value))
const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const result = shallowRef<BalanceDiff | null>(null)
let session = 0

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'This year', days: -1 }
]
function preset(days: number) {
  toDay.value = today
  fromDay.value = days < 0 ? `${new Date().getFullYear()}-01-01` : daysAgo(days)
}

async function run() {
  if (!parsed.value || !range.value) return
  const my = ++session
  loading.value = true
  error.value = null
  result.value = null
  try {
    const r = await balanceDiff(tc.v2, tc.v3, parsed.value.toRawString(), range.value.from, range.value.to, {
      onProgress: (s) => {
        if (my === session) progress.value = s
      }
    })
    if (my === session) result.value = r
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example() {
  input.value = EXAMPLE.address
  fromDay.value = EXAMPLE.from
  toDay.value = EXAMPLE.to
  nextTick(run)
}

watch(network, () => {
  session++
  result.value = null
  loading.value = false
})
onMounted(() => {
  if (input.value) nextTick(run)
})

const fmtDate = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const pct = computed(() => (result.value ? percentChange(result.value) : null))
const tone = (v: bigint) => (v > 0n ? 'text-success' : v < 0n ? 'text-error' : 'text-highlighted')
const signed = (v: bigint, symbol = true) => {
  const abs = v < 0n ? -v : v
  return (v > 0n ? '+' : v < 0n ? '−' : '') + formatCoin(abs, { symbol, maxDecimals: abs < 100_000n ? 9 : 4 })
}

// Chart: inline SVG step line, scaled to a fixed viewBox and stretched to the container width.
const W = 600
const H = 160
const chart = computed(() => (result.value && result.value.series.length > 1 ? stepPath(result.value.series, W, H) : null))

const dayRows = computed(() => (result.value?.days ?? []).slice().reverse())
const csvRows = computed<CsvRow[]>(() => (result.value?.days ?? []).map(d => ({
  date: d.day,
  transactions: d.txs,
  [`change_${COIN_SYMBOL}`]: formatUnits(d.change),
  [`balance_end_${COIN_SYMBOL}`]: formatUnits(d.balance)
})))
const friendly = computed(() => parsed.value?.toString({ bounceable: false, testOnly: isTestnet.value }) ?? '')
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="run">
      <AddressInput v-model="input" label="Wallet address" placeholder="UQ… / EQ… / 0:…" @parsed="parsed = $event" />
      <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <UFormField label="From (start of day)">
          <UInput v-model="fromDay" type="date" :max="toDay" class="w-full" size="lg" />
        </UFormField>
        <UFormField label="To (end of day)">
          <UInput v-model="toDay" type="date" :min="fromDay" :max="today" class="w-full" size="lg" />
        </UFormField>
        <UButton type="submit" label="Compare" icon="i-lucide-chart-line" size="lg" :loading="loading" :disabled="!parsed || !range" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton v-for="p in PRESETS" :key="p.label" :label="p.label" size="xs" color="neutral" variant="outline" @click="preset(p.days)" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-1" @click="example" />
      </div>
      <p v-if="fromDay && toDay && !range" class="text-sm text-error">
        The end date must be on or after the start date.
      </p>
      <p class="text-xs text-muted">
        Dates use your local time zone. Balances are in {{ COIN_SYMBOL }} (formerly {{ COIN_FORMER }}) only; tokens are not counted.
      </p>
    </form>

    <LoadingState v-if="loading" :label="progress || 'Reading balances…'" />
    <ErrorNotice :error="error" title="Could not compare balances" @retry="run" />

    <template v-if="result">
      <section class="space-y-4" aria-labelledby="bd-summary">
        <h3 id="bd-summary" class="sr-only">
          Summary
        </h3>
        <div class="text-sm">
          <AddressLink :address="friendly" />
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-default p-4">
            <div class="text-xs text-muted">
              Balance on {{ fmtDate(result.start.time) }}
            </div>
            <TokenAmount :nano="result.start.balance" :max-decimals="4" class="mt-1 block text-lg" />
          </div>
          <div class="rounded-lg border border-default p-4">
            <div class="text-xs text-muted">
              Balance on {{ fmtDate(result.end.time) }}
            </div>
            <TokenAmount :nano="result.end.balance" :max-decimals="4" class="mt-1 block text-lg" />
          </div>
          <div class="rounded-lg border border-default p-4" data-testid="bd-change">
            <div class="text-xs text-muted">
              Change
            </div>
            <div class="mt-1 font-mono text-lg tabular-nums" :class="tone(result.change)" :title="formatCoin(result.change)">
              {{ signed(result.change) }}
            </div>
            <div v-if="pct" class="text-xs text-muted">
              {{ pct }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div class="text-xs text-muted">
              Received
            </div>
            <TokenAmount :nano="result.received" :max-decimals="4" />
          </div>
          <div>
            <div class="text-xs text-muted">
              Sent
            </div>
            <TokenAmount :nano="result.sent" :max-decimals="4" />
          </div>
          <div>
            <div class="text-xs text-muted">
              Network fees
            </div>
            <TokenAmount :nano="result.fees" :max-decimals="6" />
          </div>
          <div>
            <div class="text-xs text-muted">
              Transactions
            </div>
            <span class="font-mono">{{ result.txCount }}</span>
          </div>
        </div>

        <UAlert
          v-if="result.truncated"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Very busy wallet"
          :description="`Only the first ${result.txCount} transactions were loaded. The start, end and change above are exact (read from the chain); received, sent, fees, the chart and the daily table cover only the loaded part. Pick a shorter range for full detail.`"
        />
        <p v-else-if="result.reconciled" class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-badge-check" class="size-4 text-success" />
          Start balance + every transaction in between = end balance, to the last nano{{ COIN_SYMBOL }}.
        </p>
        <UAlert
          v-else
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Totals do not add up exactly"
          description="The indexer may be missing a transaction in this range. The start, end and change are still read directly from the chain."
        />
      </section>

      <section v-if="chart" class="space-y-2" aria-labelledby="bd-chart">
        <h3 id="bd-chart" class="font-display text-sm font-semibold text-highlighted">
          Balance over time
        </h3>
        <div class="flex gap-2">
          <div class="flex flex-col justify-between py-0.5 text-right text-xs text-muted">
            <TokenAmount :nano="chart.max" :max-decimals="2" :symbol="''" />
            <TokenAmount :nano="chart.min" :max-decimals="2" :symbol="''" />
          </div>
          <svg
            :viewBox="`-2 -4 ${W + 4} ${H + 8}`"
            preserveAspectRatio="none"
            class="h-40 min-w-0 flex-1 rounded-md border border-default bg-elevated/40"
            role="img"
            :aria-label="`Balance from ${formatCoin(result.start.balance)} to ${formatCoin(result.end.balance)}`"
          >
            <path :d="chart.d" fill="none" stroke="var(--ui-primary)" stroke-width="2" vector-effect="non-scaling-stroke" />
          </svg>
        </div>
        <div class="flex justify-between pl-12 text-xs text-muted">
          <span>{{ fmtDate(result.start.time) }}</span>
          <span>{{ fmtDate(result.end.time) }}</span>
        </div>
      </section>

      <section v-if="dayRows.length" class="space-y-2" aria-labelledby="bd-days">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="bd-days" class="font-display text-sm font-semibold text-highlighted">
            Days with activity
          </h3>
          <CsvExportButton :rows="csvRows" :filename="`balance-${friendly.slice(0, 8)}-${fromDay}-${toDay}`" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-xs text-muted">
              <tr>
                <th class="py-2 pr-3 font-medium">
                  Day
                </th>
                <th class="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                  Txs
                </th>
                <th class="py-2 pr-3 text-right font-medium">
                  Change, {{ COIN_SYMBOL }}
                </th>
                <th class="py-2 text-right font-medium">
                  End-of-day balance
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="d in dayRows" :key="d.day">
                <td class="py-2 pr-3 whitespace-nowrap">
                  {{ d.day }}
                </td>
                <td class="hidden py-2 pr-3 text-right font-mono sm:table-cell">
                  {{ d.txs }}
                </td>
                <td class="py-2 pr-3 text-right font-mono whitespace-nowrap" :class="tone(d.change)">
                  {{ signed(d.change, false) }}
                </td>
                <td class="py-2 text-right">
                  <TokenAmount :nano="d.balance" :max-decimals="4" symbol="" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p v-else class="text-sm text-muted">
        No transactions in this range: the balance did not change.
      </p>
    </template>
  </div>
</template>
