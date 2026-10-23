<script setup lang="ts">
import type { Address } from '@ton/core'
import type { NominatorPosition } from '~/lib/staking/pools'
import { formatUsd, liquidRate, rawKey, relativeTime, runGetMethod } from '~/lib/staking/pools'
import { useNowSec, usePools } from '~/lib/staking/usePools'
import type { Overview, TonapiJetton, TonapiNft } from './logic'
import { buildOverview, isPayoutCollection } from './logic'

// Real mainnet accounts: a Tonkeeper Queue #1 (TON Whales) nominator, and a wallet that unstaked tsTON (pending bill).
const EXAMPLES = [
  { label: 'Nominator pool example', address: 'UQAtw6xDcJKE9xoY9Ke1T5EubKIaugpAw3OAfL2GCY8wKSt2' },
  { label: 'Liquid staking example', address: '0:7978a72a40a1c513c925273632077fdb53915cbec7fd25dbfc441500b87ecc5b' }
]

const route = useRoute()
const { pools, load: loadPools, network } = usePools()
const api = useTonapi()
const tc = useTonConnect()
const now = useNowSec()

const text = ref(typeof route.query.address === 'string' ? route.query.address : '')
const addr = shallowRef<Address | null>(null)
const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const overview = shallowRef<Overview | null>(null)
const usd = ref<number | null>(null)
const warnings = ref<string[]>([])
let runId = 0

async function run() {
  const a = addr.value
  if (!a) return
  const id = ++runId
  const raw = a.toRawString()
  loading.value = true
  error.value = null
  overview.value = null
  warnings.value = []
  try {
    progress.value = 'Loading pools…'
    if (!pools.value.length) await loadPools()
    progress.value = 'Loading stakes, tokens and NFTs…'
    const [positions, jettons, nfts] = await Promise.all([
      api.get<{ pools: NominatorPosition[] }>(`staking/nominator/${raw}/pools`).then(r => r.pools),
      api.get<{ balances: TonapiJetton[] }>(`accounts/${raw}/jettons`, { currencies: 'ton,usd' }).then(r => r.balances),
      api.get<{ nft_items: TonapiNft[] }>(`accounts/${raw}/nfts`, { limit: 1000, indirect_ownership: false }).then(r => r.nft_items, () => {
        warnings.value.push('NFTs could not be loaded, so pending Tonstakers withdrawals may be missing.')
        return [] as TonapiNft[]
      })
    ])
    if (id !== runId) return

    // Bills: only from payout collections whose owner is a liquid staking pool (scam NFTs copy the name).
    const liquidPools = new Set(pools.value.filter(p => p.liquid_jetton_master).map(p => rawKey(p.address)))
    const bills: { nft: TonapiNft, pool: string }[] = []
    const candidates = [...new Set(nfts.filter(isPayoutCollection).map(n => n.collection!.address))]
    for (const c of candidates) {
      progress.value = 'Checking withdrawal bills…'
      const col = await api.get<{ owner?: { address: string } }>(`nfts/collections/${c}`).catch(() => null)
      const owner = col?.owner?.address
      if (owner && liquidPools.has(rawKey(owner))) bills.push(...nfts.filter(n => n.collection?.address === c).map(nft => ({ nft, pool: owner })))
    }

    // Exact tsTON rate from the pool when the wallet holds tsTON or bills.
    const liquidRates: Record<string, number> = {}
    for (const p of pools.value.filter(p => p.liquid_jetton_master)) {
      const holds = jettons.some(j => rawKey(j.jetton.address) === rawKey(p.liquid_jetton_master!) && j.balance !== '0') || bills.some(b => rawKey(b.pool) === rawKey(p.address))
      if (!holds) continue
      progress.value = 'Reading the tsTON rate…'
      try {
        liquidRates[rawKey(p.address)] = liquidRate(await runGetMethod(api, p.address, 'get_pool_full_data'))
      }
      catch { /* falls back to the market price */ }
    }

    if (network.value === 'mainnet') {
      usd.value = await api.get<{ rates: { TON?: { prices?: { USD?: number } } } }>('rates', { tokens: 'ton', currencies: 'usd' }).then(r => r.rates.TON?.prices?.USD ?? null, () => null)
    }
    if (id !== runId) return
    overview.value = buildOverview({ positions, pools: pools.value, jettons, bills, liquidRates })
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

onMounted(() => {
  if (!text.value && tc.wallet.value) text.value = tc.wallet.value.friendly
  if (text.value) nextTick(run)
})
watch(network, () => overview.value && run())
// In-app links to ?address=… reuse this component instance.
watch(() => route.query.address, (a) => {
  if (typeof a === 'string' && a && a !== text.value) example(a)
})

function example(address: string) {
  text.value = address
  nextTick(run)
}
function useMine() {
  if (tc.wallet.value) example(tc.wallet.value.friendly)
}

const coinUsd = (nano: bigint) => (usd.value === null ? '' : formatUsd(Number(nano) / 1e9 * usd.value))
const monthly = computed(() => (overview.value ? overview.value.yearly / 12n : 0n))
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <AddressInput v-model="text" label="Wallet address" @parsed="addr = $event" @keydown.enter="run" />
      <div class="flex flex-wrap items-center gap-2">
        <UButton label="Show staking" icon="i-lucide-search" :disabled="!addr" :loading="loading" data-testid="run" @click="run" />
        <UButton v-if="tc.wallet.value" label="My connected wallet" variant="outline" color="neutral" @click="useMine" />
        <UButton v-for="e in EXAMPLES" :key="e.address" :label="e.label" icon="i-lucide-sparkles" variant="link" size="sm" @click="example(e.address)" />
      </div>
    </div>

    <LoadingState v-if="loading" :label="progress" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not load staking data" @retry="run" />
    <UAlert v-for="w in warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="w" />

    <template v-if="overview && !loading">
      <div v-if="!overview.rows.length" class="rounded-lg border border-dashed border-accented p-6 text-center text-sm text-muted">
        <p>No staking found for this wallet on {{ network }}: no nominator pool stakes, liquid staking tokens or pending withdrawals.</p>
        <UButton to="/tools/staking-pools" label="Find a pool" icon="i-lucide-layers" class="mt-3" />
      </div>

      <template v-else>
        <div class="grid gap-3 sm:grid-cols-3" data-testid="totals">
          <div class="rounded-lg border border-default p-4">
            <p class="text-xs text-muted">
              Total staked value
            </p>
            <p class="mt-1 font-display text-xl text-highlighted">
              <TokenAmount :nano="overview.total" :max-decimals="2" />
            </p>
            <p v-if="usd !== null" class="text-xs text-muted">
              ≈ {{ coinUsd(overview.total) }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-4">
            <p class="text-xs text-muted">
              Estimated rewards per month
            </p>
            <p class="mt-1 font-display text-xl text-success">
              +<TokenAmount :nano="monthly" :max-decimals="2" />
            </p>
            <p v-if="usd !== null" class="text-xs text-muted">
              ≈ {{ coinUsd(monthly) }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-4">
            <p class="text-xs text-muted">
              Estimated rewards per year
            </p>
            <p class="mt-1 font-display text-xl text-success">
              +<TokenAmount :nano="overview.yearly" :max-decimals="2" />
            </p>
            <p class="text-xs text-muted">
              At today's APY{{ overview.unknownApy ? `; ${overview.unknownApy} position(s) without a known APY left out` : '' }}.
            </p>
          </div>
        </div>

        <ul class="space-y-3">
          <li v-for="r in overview.rows" :key="r.address" class="space-y-3 rounded-lg border border-default p-4" data-testid="stake-row">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
                  {{ r.name }}
                  <UBadge :color="r.kind === 'bill' ? 'warning' : r.kind === 'liquid' ? 'primary' : 'info'" variant="soft" size="sm" :label="r.label" />
                </p>
                <ExplorerLinks :value="r.address" :kind="r.kind === 'bill' ? 'nft' : r.kind === 'liquid' ? 'jetton' : 'address'" class="mt-1" />
              </div>
              <div class="text-right">
                <p class="font-medium">
                  <TokenAmount :nano="r.value" :max-decimals="4" />
                </p>
                <p v-if="usd !== null && r.value" class="text-xs text-muted">
                  {{ coinUsd(r.value) }}
                </p>
              </div>
            </div>
            <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <template v-if="r.kind === 'pool'">
                <div><dt class="text-xs text-muted">Earning</dt><dd><TokenAmount :nano="r.active!" :max-decimals="4" /></dd></div>
                <div><dt class="text-xs text-muted">Pending deposit</dt><dd><TokenAmount :nano="r.pendingDeposit!" :max-decimals="4" /></dd></div>
                <div><dt class="text-xs text-muted">Pending withdraw</dt><dd><TokenAmount :nano="r.pendingWithdraw!" :max-decimals="4" /></dd></div>
                <div><dt class="text-xs text-muted">Ready to withdraw</dt><dd :class="r.readyWithdraw ? 'text-success' : ''"><TokenAmount :nano="r.readyWithdraw!" :max-decimals="4" /></dd></div>
              </template>
              <template v-else>
                <div><dt class="text-xs text-muted">Amount</dt><dd><TokenAmount :nano="r.tokens!" :symbol="r.symbol" :max-decimals="4" /></dd></div>
                <div><dt class="text-xs text-muted">Rate</dt><dd class="tabular-nums">{{ r.rate ? `1 ${r.symbol} = ${r.rate.toFixed(5)} ${COIN_SYMBOL}` : 'unknown' }}</dd></div>
                <div v-if="r.payoutAfter">
                  <dt class="text-xs text-muted">
                    Paid
                  </dt><dd>after the round ends ({{ relativeTime(r.payoutAfter, now) }})</dd>
                </div>
              </template>
              <div v-if="r.apy !== undefined">
                <dt class="text-xs text-muted">
                  APY
                </dt><dd class="tabular-nums">
                  {{ r.apy.toFixed(2) }}%<span v-if="r.yearly" class="text-xs text-muted"> · +{{ formatCoin(r.yearly, { maxDecimals: 2 }) }}/yr</span>
                </dd>
              </div>
            </dl>
            <p v-if="r.kind === 'pool' && r.readyWithdraw" class="text-xs text-success">
              Coins are ready: send a withdraw request to receive them.
            </p>
            <p v-if="r.kind === 'bill'" class="text-xs text-muted">
              Hold this NFT: the pool sends the {{ COIN_SYMBOL }} to its owner automatically. Do not send it to a contract or an exchange.
            </p>
            <UButton v-if="r.kind !== 'bill' && (r.kind === 'pool' || r.symbol === 'tsTON')" :to="`/tools/stake-unstake?pool=${r.kind === 'pool' ? r.address : pools.find(p => p.liquid_jetton_master && rawKey(p.liquid_jetton_master) === rawKey(r.address))?.address ?? ''}&action=unstake`" label="Unstake" icon="i-lucide-arrow-up-from-line" size="xs" variant="outline" color="neutral" />
          </li>
        </ul>
      </template>
      <p class="text-xs text-muted">
        Data: tonapi.io (staking positions, jettons, NFTs, prices) and the Tonstakers pool's get_pool_full_data for the exact tsTON rate. Reward estimates assume today's APY stays the same.
      </p>
    </template>
  </div>
</template>
