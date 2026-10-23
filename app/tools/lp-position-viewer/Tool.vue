<script setup lang="ts">
import { resolveName, useAccountClients } from '~/lib/accounts/api'
import { formatFiat, friendly, isDomainName, toRaw } from '~/lib/accounts/core'
import { publicJson } from '~/lib/defi-analytics/shared'
import type { LoadResult, PositionView, TokenId } from './logic'
import { loadPositions, poolUrl, view } from './logic'

// Real mainnet wallets: one with three STON.fi LPs and a DeDust GRAM/USD₮ LP, one with LP staked in a STON.fi farm.
const EXAMPLES = [
  { label: 'Example: 4 pools', value: 'UQCVyTi5UGUm3yd-WhubdClWma-ozx7-IVS54MGn2CQJDxDT' },
  { label: 'Example: farm stake', value: 'UQCFkhYgLNLr2jgc-W3pxgioxQRMDvszl0aRFnpk8SWa5D5E' }
]

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const clients = useAccountClients(network)
const lpClients = {
  tonapi: clients.tonapi,
  tonapiPost: clients.tonapiPost,
  stonfi: <T,>(path: string) => publicJson<T>(`https://api.ston.fi${path}`, 'STON.fi', 300)
}

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const result = ref<LoadResult | null>(null)
const owner = ref('')
let runId = 0

const inputError = computed(() => {
  const s = input.value.trim()
  if (!s || isDomainName(s)) return null
  try {
    toRaw(s)
    return null
  }
  catch {
    return 'Not a valid TON address or .ton name'
  }
})

async function run() {
  const s = input.value.trim()
  if (!s || inputError.value) return
  const id = ++runId
  loading.value = true
  error.value = null
  result.value = null
  try {
    progress.value = 'Resolving…'
    const raw = isDomainName(s) ? await resolveName(s, clients) : toRaw(s)
    if (id !== runId) return
    owner.value = raw
    const r = await loadPositions(raw, lpClients, { mainnet: !isTestnet.value, progress: p => id === runId && (progress.value = p) })
    if (id === runId) result.value = r
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

function example(v: string) {
  input.value = v
  run()
}

onMounted(() => input.value && run())
watch(network, () => result.value && run())

const views = computed<PositionView[]>(() => {
  const r = result.value
  if (!r) return []
  return r.positions.map(p => view(p, r.prices, r.tokens)).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
})
const total = computed(() => views.value.reduce((s, v) => s + (v.value ?? 0), 0))
const unpriced = computed(() => views.value.filter(v => v.value === null).length)

const sym = (t: TokenId) => result.value?.tokens.get(t)?.symbol ?? '?'
const dec = (t: TokenId) => result.value?.tokens.get(t)?.decimals ?? 9
const pair = (v: PositionView) => `${sym(v.pool.tokens[0])} / ${sym(v.pool.tokens[1])}`
const pct = (f: number) => (f >= 0.0001 ? `${(f * 100).toFixed(f >= 0.01 ? 2 : 4)}%` : '< 0.01%')
const poolFriendly = (raw: string) => friendly(raw, { wallet: false, testnet: isTestnet.value })
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="Wallet" help="Address (EQ…, UQ…, 0:…) or a .ton name." :error="inputError ?? undefined">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput v-model="input" class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="UQ… or name.ton" autocomplete="off" autocapitalize="off" spellcheck="false" @keydown.enter="run" />
          <UButton label="Show positions" icon="i-lucide-droplets" :loading="loading" :disabled="!input.trim() || !!inputError" class="justify-center" @click="run" />
        </div>
      </UFormField>
      <div class="flex flex-wrap gap-x-4">
        <UButton v-for="e in EXAMPLES" :key="e.value" :label="e.label" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
    </div>

    <LoadingState v-if="loading" :label="progress" />
    <ErrorNotice :error="error" title="Could not load positions" @retry="run" />
    <UAlert v-for="w in result?.warnings ?? []" :key="w" color="warning" variant="subtle" icon="i-lucide-info" :title="w" />

    <template v-if="result && !loading">
      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="text-xs text-muted">
          Liquidity of <AddressLink :address="friendly(owner, { testnet: isTestnet })" />
        </div>
        <div v-if="views.length && !isTestnet" class="mt-1 font-display text-3xl font-semibold text-highlighted">
          {{ formatFiat(total, 'USD') }}
        </div>
        <div class="mt-1 text-sm text-muted">
          {{ views.length }} position{{ views.length === 1 ? '' : 's' }}<template v-if="unpriced && !isTestnet">
            · {{ unpriced }} without a price (not in the total)
          </template>
        </div>
      </section>

      <div v-if="!views.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        No STON.fi or DeDust liquidity found for this wallet{{ isTestnet ? ' on testnet' : '' }}. LP tokens held through other apps or vaults are not detected.
      </div>

      <ul v-else class="space-y-3">
        <li v-for="v in views" :key="`${v.source}:${v.pool.address}:${v.farm?.nft ?? ''}`" class="rounded-lg border border-default p-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="font-display text-base font-semibold text-highlighted">
                {{ pair(v) }}
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                <UBadge :label="v.pool.dex === 'stonfi' ? 'STON.fi' : 'DeDust'" variant="subtle" size="sm" />
                <UBadge :label="v.pool.variant" color="neutral" variant="subtle" size="sm" />
                <UBadge v-if="v.source === 'farm'" label="Staked in farm" color="success" variant="subtle" size="sm" />
              </div>
            </div>
            <div class="text-right">
              <div class="font-semibold text-highlighted">
                {{ v.value !== null ? formatFiat(v.value, 'USD') : '—' }}
              </div>
              <div class="text-xs text-muted">
                {{ pct(v.share) }} of the pool
              </div>
            </div>
          </div>
          <div class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div v-for="i in [0, 1] as const" :key="i" class="rounded-md bg-elevated/50 px-3 py-2">
              <div class="text-xs text-muted">
                You get back
              </div>
              <TokenAmount :nano="v.amounts[i]" :decimals="dec(v.pool.tokens[i])" :symbol="sym(v.pool.tokens[i])" :max-decimals="4" />
            </div>
          </div>
          <div v-if="v.farm?.rewards.length" class="mt-2 text-xs text-muted">
            Unclaimed rewards:
            <span v-for="(r, k) in v.farm.rewards" :key="k" class="mr-2">
              <TokenAmount :nano="r.amount" :decimals="dec(r.token)" :symbol="sym(r.token)" :max-decimals="4" />
            </span>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>LP tokens: <TokenAmount :nano="v.lp" :symbol="''" :max-decimals="6" /></span>
            <span v-if="v.pool.apy7d !== undefined">APY (7d): {{ (v.pool.apy7d * 100).toFixed(2) }}%</span>
            <a :href="poolUrl(v.pool)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-primary">Open on {{ v.pool.dex === 'stonfi' ? 'STON.fi' : 'DeDust' }}<UIcon name="i-lucide-arrow-up-right" class="size-3" /></a>
            <ExplorerLinks :value="poolFriendly(v.pool.address)" />
          </div>
        </li>
      </ul>
    </template>

    <p class="text-xs text-dimmed">
      LP tokens are found with tonapi and confirmed against the STON.fi API (STON.fi) or the pool contract itself (DeDust), so look-alike scam tokens are ignored. "You get back" is your share of the pool reserves right now, before withdrawal fees; it changes with every trade. Values use tonapi USD prices. Farm stakes come from the STON.fi API. See the <NuxtLink to="/tools/impermanent-loss-calculator" class="underline hover:text-primary">impermanent loss calculator</NuxtLink> to understand how a position drifts from holding. {{ COIN_RENAME_NOTE }}
    </p>
  </div>
</template>
