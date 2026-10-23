<script setup lang="ts">
import type { PoolKind } from '~/lib/staking/pools'
import { cycleLabel, isActive, kindOf, KINDS, rawKey, ROUND_SECONDS } from '~/lib/staking/pools'
import { useNowSec, usePools } from '~/lib/staking/usePools'
import { KIND_FEES, project } from './logic'

const route = useRoute()
const { pools, loading, error, load, network } = usePools()
const api = useTonapi()
const now = useNowSec()

const CUSTOM = 'custom'
const selected = ref<string>(CUSTOM)
const amountText = ref(typeof route.query.amount === 'string' ? route.query.amount : '1000')
const apyText = ref('12')
const days = ref(365)
const compound = ref(true)
const PERIODS = [{ label: '1 month', value: 30 }, { label: '6 months', value: 182 }, { label: '1 year', value: 365 }, { label: '3 years', value: 1095 }]

const options = computed(() => pools.value.filter(p => p.verified && isActive(p, now.value)).sort((a, b) => b.total_amount - a.total_amount))
const items = computed(() => [
  ...[...options.value, ...pools.value.filter(p => p.address === selected.value && !options.value.includes(p))].map(p => ({ label: `${p.name} · ${p.apy.toFixed(2)}%`, value: p.address })),
  { label: 'Custom APY (any pool)', value: CUSTOM }
])
const pool = computed(() => pools.value.find(p => p.address === selected.value) ?? null)
const kind = computed<PoolKind | 'custom'>(() => (pool.value ? kindOf(pool.value) ?? 'custom' : 'custom'))
const fees = computed(() => KIND_FEES[kind.value])

watch(pools, (list) => {
  if (!list.length) return
  const wanted = typeof route.query.pool === 'string' ? rawKey(route.query.pool) : ''
  const hit = list.find(p => rawKey(p.address) === wanted) ?? (selected.value === CUSTOM ? options.value.find(p => kindOf(p) === 'liquidTF') : null)
  if (hit) selected.value = hit.address
}, { immediate: true })
watch(pool, (p) => {
  if (p) apyText.value = p.apy.toFixed(2)
})

const usd = ref<number | null>(null)
async function loadPrice() {
  usd.value = null
  if (network.value !== 'mainnet') return
  try {
    const r = await api.get<{ rates: { TON?: { prices?: { USD?: number } } } }>('rates', { tokens: 'ton', currencies: 'usd' })
    usd.value = r.rates.TON?.prices?.USD ?? null
  }
  catch { /* fiat is optional */ }
}
watch(network, loadPrice, { immediate: true })

const principal = computed(() => {
  const n = Number(amountText.value.replace(/[,_\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
})
const apy = computed(() => {
  const n = Number(apyText.value)
  return Number.isFinite(n) && n >= 0 && n < 1000 ? n : null
})
const cycleSeconds = computed(() => pool.value?.cycle_length || ROUND_SECONDS)
const result = computed(() => principal.value === null || apy.value === null || !(days.value > 0)
  ? null
  : project({ principal: principal.value, apy: apy.value, cycleSeconds: cycleSeconds.value, days: days.value, compound: compound.value, entryFee: fees.value.entry, exitFee: fees.value.exit }))
const belowMin = computed(() => pool.value && principal.value !== null && principal.value * 1e9 < pool.value.min_stake)

const fmt = (v: number, d = 4) => v.toLocaleString('en-US', { maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 6 : d })
const fiat = (v: number) => (usd.value === null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v * usd.value))
const cards = computed(() => result.value
  ? [
      { label: `Per payout (${cycleLabel(cycleSeconds.value)})`, v: result.value.perCycle },
      { label: 'Per day (average)', v: result.value.perDay },
      { label: 'Per month (average)', v: result.value.perMonth },
      { label: 'Per year', v: result.value.perYear }
    ]
  : [])
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading && !pools.length" label="Loading pools and APYs…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not load pools (you can still use a custom APY)" @retry="load(true)" />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Pool" class="sm:col-span-2">
        <USelect v-model="selected" :items="items" class="w-full" data-testid="pool-select" />
      </UFormField>
      <UFormField :label="`Amount (${COIN_SYMBOL})`" :error="amountText && principal === null ? 'Enter a positive number' : undefined">
        <UInput v-model="amountText" inputmode="decimal" class="w-full" size="lg" data-testid="amount" />
      </UFormField>
      <UFormField label="APY (%)" :help="pool ? 'Live from tonapi. Edit to try other values.' : 'Annual yield including compounding.'" :error="apyText && apy === null ? 'Enter a percentage' : undefined">
        <UInput v-model="apyText" inputmode="decimal" class="w-full" size="lg" data-testid="apy" />
      </UFormField>
      <UFormField label="How long" class="sm:col-span-2">
        <div class="flex flex-wrap items-center gap-2">
          <UButton v-for="p in PERIODS" :key="p.value" :label="p.label" size="sm" :variant="days === p.value ? 'solid' : 'outline'" color="neutral" @click="days = p.value" />
          <UInputNumber v-model="days" :min="1" :max="36500" class="w-36" aria-label="Days" />
          <span class="text-sm text-muted">days</span>
        </div>
      </UFormField>
      <USwitch v-model="compound" label="Reinvest rewards (compounding)" description="All pools here reinvest automatically; turn off to see simple interest." class="sm:col-span-2" />
    </div>

    <UAlert v-if="belowMin" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="`${pool!.name} needs at least ${formatAmount(BigInt(pool!.min_stake), 9, { maxDecimals: 2 })} ${COIN_SYMBOL}.`" />

    <template v-if="result">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="results">
        <div v-for="c in cards" :key="c.label" class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">
            {{ c.label }}
          </p>
          <p class="mt-1 font-mono text-sm font-medium text-highlighted tabular-nums">
            +{{ fmt(c.v) }} <span class="font-sans text-muted">{{ COIN_SYMBOL }}</span>
          </p>
          <p v-if="usd !== null" class="text-xs text-muted">
            {{ fiat(c.v) }}
          </p>
        </div>
      </div>

      <div class="rounded-lg border border-primary/40 bg-primary/5 p-4">
        <p class="text-sm text-muted">
          After {{ days }} days ({{ result.end.cycles }} payouts)
        </p>
        <p class="mt-1 font-display text-2xl text-highlighted" data-testid="final">
          {{ fmt(result.end.balance, 2) }} {{ COIN_SYMBOL }}
          <span v-if="usd !== null" class="font-sans text-base text-muted">≈ {{ fiat(result.end.balance) }}</span>
        </p>
        <p class="mt-1 text-sm">
          Rewards <span class="font-mono text-success">+{{ fmt(result.end.rewards) }}</span>
          · after fees <span class="font-mono">{{ result.netProfit >= 0 ? '+' : '' }}{{ fmt(result.netProfit) }} {{ COIN_SYMBOL }}</span>
          · effective {{ result.effectiveApy.toFixed(2) }}% a year
        </p>
        <p class="mt-2 text-xs text-muted">
          {{ fees.note }}
          <template v-if="result.breakEvenDays">
            Rewards cover the fees after about {{ result.breakEvenDays }} days.
          </template>
          <template v-else-if="result.breakEvenDays === null">
            With 0% APY the fees are never covered.
          </template>
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-muted">
            <tr>
              <th class="py-2 pr-3 font-normal">
                Time
              </th>
              <th class="py-2 pr-3 font-normal">
                Payouts
              </th>
              <th class="py-2 pr-3 font-normal">
                Rewards
              </th>
              <th class="py-2 font-normal">
                Balance
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="m in result.milestones" :key="m.label">
              <td class="py-2 pr-3">
                {{ m.label }}
              </td>
              <td class="py-2 pr-3 tabular-nums">
                {{ m.cycles }}
              </td>
              <td class="py-2 pr-3 font-mono tabular-nums text-success">
                +{{ fmt(m.rewards) }}
              </td>
              <td class="py-2 font-mono tabular-nums">
                {{ fmt(m.balance, 2) }}<span v-if="usd !== null" class="block font-sans text-xs text-muted">{{ fiat(m.balance) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton v-if="pool" :to="`/tools/stake-unstake?pool=${pool.address}&amount=${principal}`" icon="i-lucide-arrow-down-up" :label="`Stake in ${pool.name}`" />
        <UButton to="/tools/staking-pools" icon="i-lucide-layers" label="Compare pools" variant="outline" color="neutral" />
      </div>
    </template>

    <p class="text-xs text-muted">
      An estimate, not a promise. Rewards are paid at the end of each validation cycle ({{ pool ? cycleLabel(cycleSeconds) : '~18 h' }}{{ pool && kind !== 'custom' ? ` for ${KINDS[kind].label}` : '' }}), so a partial cycle earns nothing yet. The APY moves with network participation, validator performance and pool fees, and the {{ COIN_SYMBOL }} price moves too.
    </p>
  </div>
</template>
