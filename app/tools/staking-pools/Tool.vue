<script setup lang="ts">
import type { Address } from '@ton/core'
import PoolStats from '~/lib/staking/PoolStats.vue'
import type { PoolSort, StakingPool } from '~/lib/staking/pools'
import { compactCoins, fetchPools, filterPools, kindOf, KINDS, OTHER_LIQUID } from '~/lib/staking/pools'
import { useNowSec, usePools } from '~/lib/staking/usePools'
import { cheapestEntry, summarize } from './logic'

const { pools, loading, error, load, network } = usePools()
const api = useTonapi()
const tc = useTonConnect()

const now = useNowSec()

const search = ref('')
const sort = ref<PoolSort>('tvl')
const verifiedOnly = ref(true)
const activeOnly = ref(true)
const openOnly = ref(false)
const limit = ref(30)
const SORTS = [
  { label: 'Most staked', value: 'tvl' },
  { label: 'Highest APY', value: 'apy' },
  { label: 'Lowest minimum', value: 'min' },
  { label: 'Most nominators', value: 'nominators' }
]

// Optional "which pools can this wallet join" check (tonapi available_for).
const wallet = ref('')
const walletAddr = shallowRef<Address | null>(null)
const available = shallowRef<Set<string> | null>(null)
const checking = ref(false)
const checkError = ref<unknown>(null)
async function check() {
  if (!walletAddr.value) return
  checking.value = true
  checkError.value = null
  try {
    const list = await fetchPools(api, walletAddr.value.toRawString())
    available.value = new Set(list.map(p => p.address.toLowerCase()))
  }
  catch (e) {
    checkError.value = e
  }
  finally {
    checking.value = false
  }
}
watch(walletAddr, () => (available.value = null))
function useMine() {
  if (tc.wallet.value) wallet.value = tc.wallet.value.friendly
  nextTick(check)
}

const source = computed(() => available.value ? pools.value.filter(p => available.value!.has(p.address.toLowerCase())) : pools.value)
const shown = computed(() => filterPools(source.value, { verifiedOnly: verifiedOnly.value, activeOnly: activeOnly.value, openOnly: openOnly.value, search: search.value, sort: sort.value }, now.value))
watch([search, sort, verifiedOnly, activeOnly, openOnly], () => (limit.value = 30))
const summary = computed(() => summarize(pools.value, now.value))
const cheapest = computed(() => cheapestEntry(pools.value, now.value))

// GRAM price and the liquid tokens tonapi's staking API does not list (bemo, Hipo).
const rates = ref<Record<string, { prices?: Record<string, number> }>>({})
async function loadRates() {
  rates.value = {}
  if (network.value !== 'mainnet') return
  try {
    const r = await api.get<{ rates: typeof rates.value }>('rates', { tokens: ['ton', ...OTHER_LIQUID.map(o => o.master)].join(','), currencies: 'ton,usd' })
    rates.value = r.rates
  }
  catch { /* prices are optional */ }
}
watch(network, loadRates, { immediate: true })
const usd = computed(() => rates.value.TON?.prices?.USD)

const kindColor = (p: StakingPool) => ({ liquidTF: 'primary', whales: 'info', tf: 'neutral' } as const)[kindOf(p) ?? 'tf']
const kindLabel = (p: StakingPool) => KINDS[kindOf(p) ?? 'tf']?.label ?? p.implementation
const isAddressName = (p: StakingPool) => /^[A-Za-z0-9_-]{48}$/.test(p.name)
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading && !pools.length" label="Loading staking pools from tonapi…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not load staking pools" @retry="load(true)" />

    <template v-if="pools.length">
      <!-- Overview per staking type -->
      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="s in summary" :key="s.kind" class="rounded-lg border border-default p-4">
          <div class="flex items-center gap-2 text-sm font-medium text-highlighted">
            <UIcon :name="KINDS[s.kind].icon" class="size-4 text-primary" />
            {{ KINDS[s.kind].label }}
          </div>
          <p class="mt-2 font-display text-xl text-highlighted">
            {{ s.bestApy !== null ? `${s.bestApy.toFixed(2)}%` : '—' }}<span class="ml-1 font-sans text-xs text-muted">{{ s.kind === 'tf' ? 'est. APY' : 'best APY' }}</span>
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ s.pools }} active {{ s.pools === 1 ? 'pool' : 'pools' }} · {{ compactCoins(s.tvl) }} {{ COIN_SYMBOL }} staked<template v-if="usd">
              ({{ new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(s.tvl / 1e9 * usd) }})
            </template>
          </p>
          <p class="mt-1 text-xs text-muted">
            From {{ s.minStake !== null ? `${formatAmount(BigInt(s.minStake), 9, { maxDecimals: 0 })} ${COIN_SYMBOL}` : '— (all full)' }}
          </p>
          <p class="mt-2 text-xs text-muted">
            {{ KINDS[s.kind].blurb }}
          </p>
        </div>
      </div>
      <UAlert
        v-if="cheapest"
        color="primary"
        variant="subtle"
        icon="i-lucide-lightbulb"
        :title="`New to staking? Start with ${cheapest.name}.`"
        :description="`It accepts stakes from ${formatAmount(BigInt(cheapest.min_stake), 9, { maxDecimals: 2 })} ${COIN_SYMBOL} and is ${cheapest.verified ? 'verified by tonapi' : 'open to new nominators'}.`"
        :actions="[{ label: 'Stake now', to: `/tools/stake-unstake?pool=${cheapest.address}`, color: 'primary', variant: 'solid' }, { label: 'Calculate rewards', to: `/tools/staking-calculator?pool=${cheapest.address}`, color: 'primary', variant: 'outline' }]"
      />
      <UAlert v-if="network === 'testnet'" color="warning" variant="subtle" icon="i-lucide-flask-conical" description="Testnet: tonapi lists only TON Core nominator pools here, no liquid staking or TON Whales." />

      <!-- Controls -->
      <div class="space-y-3">
        <div class="flex flex-col gap-3 sm:flex-row">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search by name or address" class="w-full sm:flex-1" aria-label="Search pools" />
          <USelect v-model="sort" :items="SORTS" class="w-full sm:w-48" aria-label="Sort pools" />
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2">
          <USwitch v-model="verifiedOnly" label="Verified only" data-testid="verified-only" />
          <USwitch v-model="activeOnly" label="Hide empty and inactive" />
          <USwitch v-model="openOnly" label="Hide full pools" />
        </div>
        <details class="rounded-lg border border-default p-3 text-sm">
          <summary class="cursor-pointer font-medium text-highlighted">
            Which pools can my wallet join?
          </summary>
          <div class="mt-3 space-y-2">
            <AddressInput v-model="wallet" label="Wallet address" @parsed="walletAddr = $event" />
            <div class="flex flex-wrap gap-2">
              <UButton label="Check" icon="i-lucide-search-check" :disabled="!walletAddr" :loading="checking" @click="check" />
              <UButton v-if="tc.wallet.value" label="Use my connected wallet" variant="outline" color="neutral" @click="useMine" />
              <UButton v-if="available" label="Show all pools" variant="link" color="neutral" @click="available = null" />
            </div>
            <p v-if="available" class="text-muted">
              Showing the {{ source.length }} pools this wallet can deposit into (tonapi checks minimums, free slots and existing stakes).
            </p>
            <ErrorNotice v-if="checkError" :error="checkError" @retry="check" />
          </div>
        </details>
      </div>

      <!-- Pool list -->
      <p class="text-sm text-muted" role="status">
        {{ shown.length }} of {{ source.length }} pools
      </p>
      <p v-if="!shown.length" class="rounded-lg border border-dashed border-accented p-6 text-center text-sm text-muted">
        No pool matches these filters. Try turning off "Verified only".
      </p>
      <ul class="space-y-3">
        <li v-for="p in shown.slice(0, limit)" :key="p.address" class="space-y-3 rounded-lg border border-default p-4" data-testid="pool-card">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
                <span :class="isAddressName(p) ? 'truncate font-mono text-xs' : ''">{{ p.name }}</span>
                <UBadge v-if="p.verified" color="success" variant="subtle" size="sm" icon="i-lucide-badge-check" label="Verified" />
                <UBadge :color="kindColor(p)" variant="soft" size="sm" :label="kindLabel(p)" />
              </p>
              <ExplorerLinks :value="p.address" class="mt-1" />
            </div>
            <div class="flex gap-2">
              <UButton :to="`/tools/staking-calculator?pool=${p.address}`" icon="i-lucide-calculator" size="sm" variant="outline" color="neutral" label="Calculate" />
              <UButton :to="`/tools/stake-unstake?pool=${p.address}`" icon="i-lucide-arrow-down-up" size="sm" label="Stake" />
            </div>
          </div>
          <PoolStats :pool="p" :now="now" />
        </li>
      </ul>
      <UButton v-if="shown.length > limit" :label="`Show ${Math.min(30, shown.length - limit)} more`" variant="outline" color="neutral" block @click="limit += 30" />

      <!-- Other liquid staking -->
      <div v-if="network === 'mainnet'" class="space-y-2">
        <h3 class="font-display text-sm text-highlighted">
          Other liquid staking
        </h3>
        <p class="text-xs text-muted">
          Not part of tonapi's staking list. The price is what one token is worth in {{ COIN_SYMBOL }} on the market; it rises as rewards accrue. Stake on their own sites.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <a v-for="o in OTHER_LIQUID" :key="o.symbol" :href="o.url" target="_blank" rel="noopener" class="flex items-center justify-between gap-3 rounded-lg border border-default p-4 hover:border-primary">
            <span>
              <span class="block font-medium text-highlighted">{{ o.symbol }} · {{ o.name }}</span>
              <span class="block text-xs text-muted">1 {{ o.symbol }} ≈ {{ rates[o.master]?.prices?.TON?.toFixed(4) ?? '…' }} {{ COIN_SYMBOL }}</span>
            </span>
            <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted" />
          </a>
        </div>
      </div>

      <p class="text-xs text-muted">
        Data: tonapi.io <code>/v2/staking/pools</code>, live. APY is based on recent rounds and is not guaranteed. "Verified" means tonapi lists the pool operator as known; it is not an audit.
      </p>
    </template>
  </div>
</template>
