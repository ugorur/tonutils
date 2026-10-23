<script setup lang="ts">
import { formatFiat, formatPercent } from '~/lib/accounts/core'
import type { GramMarket } from '~/lib/defi-analytics/shared'
import { COINGECKO_PAGE, compactNumber, fetchGramMarket } from '~/lib/defi-analytics/shared'
import type { AccountStatesResponse, BlockRewards, BurningConfig } from './logic'
import { balancesByRaw, HOLDINGS, parseBlockRewards, parseBurningConfig, shareOf } from './logic'

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter(network)

const market = ref<GramMarket | null>(null)
const marketError = ref<unknown>(null)
const burning = ref<BurningConfig | null>(null)
const rewards = ref<BlockRewards | null>(null)
const balances = ref<Map<string, bigint>>(new Map())
const chainError = ref<unknown>(null)
const loading = ref(false)
let runId = 0

type ConfigInfo = { config: { bytes: string } }

async function run() {
  const id = ++runId
  loading.value = true
  marketError.value = chainError.value = null
  const holdings = HOLDINGS.filter(h => !h.mainnetOnly || !isTestnet.value)
  const marketJob = isTestnet.value
    ? Promise.resolve(null)
    : fetchGramMarket().catch((e) => {
        if (id === runId) marketError.value = e
        return null
      })
  try {
    const [p5, p14, states] = await Promise.all([
      tc.v2<ConfigInfo>('getConfigParam', { config_id: 5 }),
      tc.v2<ConfigInfo>('getConfigParam', { config_id: 14 }),
      tc.v3<AccountStatesResponse>(`accountStates?${holdings.map(h => `address=${encodeURIComponent(h.raw)}`).join('&')}&include_boc=false`)
    ])
    if (id !== runId) return
    burning.value = parseBurningConfig(p5.config.bytes)
    rewards.value = parseBlockRewards(p14.config.bytes)
    balances.value = balancesByRaw(states)
  }
  catch (e) {
    if (id === runId) chainError.value = e
  }
  const m = await marketJob
  if (id !== runId) return
  market.value = m
  loading.value = false
}

onMounted(run)
watch(network, run)

const coins = (n: number) => `${compactNumber(n)} ${COIN_SYMBOL}`
const pct = (f: number | null | undefined, d = 1) => (f === null || f === undefined ? '—' : `${(f * 100).toFixed(d)}%`)
const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `$${compactNumber(n)}`)
const holdingRows = computed(() => HOLDINGS.filter(h => !h.mainnetOnly || !isTestnet.value).map(h => ({ ...h, nano: balances.value.get(h.raw) })))
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-muted">
        {{ COIN_NAME }} ({{ COIN_SYMBOL }}), formerly {{ COIN_FORMER }}, is the native coin of the TON network.
      </p>
      <UButton label="Refresh" icon="i-lucide-refresh-cw" size="sm" variant="soft" :loading="loading" @click="run" />
    </div>

    <LoadingState v-if="loading && !burning && !market" label="Loading supply data…" />

    <section class="space-y-3">
      <h3 class="text-sm font-semibold text-highlighted">
        Supply and market
      </h3>
      <UAlert v-if="isTestnet" color="neutral" variant="subtle" icon="i-lucide-info" title="Testnet coins have no market value" description="Market data is shown for mainnet only. Switch the network in the header to see it." />
      <ErrorNotice :error="marketError" title="CoinGecko data is unavailable" @retry="run" />
      <template v-if="market">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Price
            </div>
            <div class="font-display text-xl font-semibold text-highlighted">
              {{ formatFiat(market.priceUsd, 'USD') }}
            </div>
            <div class="text-xs" :class="(market.change24h ?? 0) < 0 ? 'text-error' : 'text-success'">
              {{ formatPercent(market.change24h ?? undefined) }} 24h
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Market cap
            </div>
            <div class="font-display text-xl font-semibold text-highlighted">
              {{ usd(market.marketCapUsd) }}
            </div>
            <div class="text-xs text-muted">
              Rank #{{ market.rank ?? '—' }}
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Total supply
            </div>
            <div class="font-display text-xl font-semibold text-highlighted">
              {{ coins(market.totalSupply) }}
            </div>
            <div class="text-xs text-muted">
              FDV {{ usd(market.fdvUsd) }}
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Circulating
            </div>
            <div class="font-display text-xl font-semibold text-highlighted">
              {{ coins(market.circulatingSupply) }}
            </div>
            <div class="text-xs text-muted">
              {{ pct(market.circulatingSupply / market.totalSupply) }} of total
            </div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs text-muted">
            <span>Circulating</span><span>Not counted as circulating</span>
          </div>
          <UProgress :model-value="Math.round((market.circulatingSupply / market.totalSupply) * 1000) / 10" class="mt-1" />
        </div>
        <KeyValue
          :items="[
            { label: 'Total supply (full figure)', value: `${Math.round(market.totalSupply).toLocaleString('en-US')} ${COIN_SYMBOL}`, mono: true },
            { label: 'Circulating supply (full figure)', value: `${Math.round(market.circulatingSupply).toLocaleString('en-US')} ${COIN_SYMBOL}`, mono: true },
            { label: 'Max supply', value: market.maxSupply ? coins(market.maxSupply) : 'None (new coins are created for validators, part of fees is burned)', mono: false, copy: false },
            { label: 'All-time high', value: market.athUsd ? `${formatFiat(market.athUsd, 'USD')}${market.athDate ? ` on ${market.athDate.slice(0, 10)}` : ''}` : '—', mono: false, copy: false }
          ]"
        />
        <p class="text-xs text-dimmed">
          Source: <a :href="COINGECKO_PAGE" target="_blank" rel="noopener" class="underline hover:text-primary">CoinGecko</a> ("{{ market.name }}"), updated {{ market.updatedAt.slice(0, 16).replace('T', ' ') }} UTC. Circulating supply is CoinGecko's estimate.
        </p>
      </template>
    </section>

    <ErrorNotice :error="chainError" title="Could not read the TON config" @retry="run" />

    <section v-if="balances.size" class="space-y-3">
      <h3 class="text-sm font-semibold text-highlighted">
        Where big balances sit
      </h3>
      <div class="divide-y divide-default rounded-lg border border-default">
        <div v-for="h in holdingRows" :key="h.raw" class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-3">
          <div class="min-w-0">
            <div class="text-sm text-highlighted">
              {{ h.name }}
            </div>
            <div class="text-xs text-muted">
              {{ h.hint }}
            </div>
            <AddressLink :address="h.raw" class="mt-1" />
          </div>
          <div class="text-right">
            <TokenAmount v-if="h.nano !== undefined" :nano="h.nano" :max-decimals="0" />
            <span v-else class="text-sm text-muted">—</span>
            <div v-if="market && h.nano !== undefined" class="text-xs text-muted">
              {{ pct(shareOf(h.nano, market.totalSupply)) }} of supply
            </div>
          </div>
        </div>
      </div>
      <p class="text-xs text-dimmed">
        Live balances from toncenter. See the full ranking in the <NuxtLink to="/tools/rich-list" class="underline hover:text-primary">rich list</NuxtLink>.
      </p>
    </section>

    <section v-if="burning || rewards" class="space-y-3">
      <h3 class="text-sm font-semibold text-highlighted">
        Issuance and burning (network config)
      </h3>
      <KeyValue
        :items="[
          ...(burning ? [
            { label: 'Share of fees burned', value: `${pct(burning.share, 0)} (${burning.num}/${burning.denom})`, mono: false, copy: false, hint: 'ConfigParam 5. The rest goes to validators.' }
          ] : []),
          ...(rewards ? [
            { label: 'New coins per masterchain block', value: `${formatAmount(rewards.masterchain)} ${COIN_SYMBOL}`, mono: false, copy: false, hint: 'ConfigParam 14, paid to validators.' },
            { label: 'New coins per basechain block', value: `${formatAmount(rewards.basechain)} ${COIN_SYMBOL}`, mono: false, copy: false, hint: 'ConfigParam 14, per shard block in workchain 0.' }
          ] : [])
        ]"
      />
      <div v-if="burning?.blackhole" class="text-xs text-muted">
        Burn (blackhole) address, where sent coins are destroyed by the protocol: <AddressLink :address="burning.blackhole" />
      </div>
      <p class="text-xs text-dimmed">
        Read live from the {{ network }} config through toncenter. The all-time total burned is not exposed by the public keyless APIs, so it is not shown here; <a href="https://tonstat.com" target="_blank" rel="noopener" class="underline hover:text-primary">tonstat.com</a> tracks it. {{ COIN_RENAME_NOTE }}
      </p>
    </section>
  </div>
</template>
