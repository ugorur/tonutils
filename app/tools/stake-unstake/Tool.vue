<script setup lang="ts">
import { Address } from '@ton/core'
import PoolStats from '~/lib/staking/PoolStats.vue'
import type { NominatorPosition, WhalesParams } from '~/lib/staking/pools'
import { isActive, kindOf, KINDS, liquidRate, nano, parseWhalesParams, rawKey, runGetMethod } from '~/lib/staking/pools'
import { useNowSec, usePools } from '~/lib/staking/usePools'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import type { Action, UnstakeMode } from './logic'
import { buildPlan, freshQueryId } from './logic'

const route = useRoute()
const q = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')
const { pools, loading, error, load, network } = usePools()
const api = useTonapi()
const toncenter = useToncenter()
const tc = useTonConnect()
const now = useNowSec()

// ---------------------------------------------------------------- pool choice
const selected = ref('')
const customText = ref('')
const custom = shallowRef<Address | null>(null)
const recommended = computed(() => pools.value.filter(p => p.verified && isActive(p, now.value)).sort((a, b) => b.total_amount - a.total_amount))
const items = computed(() => [...recommended.value, ...pools.value.filter(p => p.address === selected.value && !recommended.value.includes(p))].map(p => ({ label: `${p.name} · ${p.apy.toFixed(2)}% · from ${formatAmount(BigInt(p.min_stake), 9, { maxDecimals: 0 })} ${COIN_SYMBOL}`, value: p.address })))

function pick(raw: string) {
  const hit = pools.value.find(p => rawKey(p.address) === rawKey(raw))
  if (!hit) return false
  selected.value = hit.address
  return true
}
watch(pools, (list) => {
  if (!list.length) return
  const wanted = q('pool')
  if (wanted) {
    try {
      if (pick(Address.parse(wanted).toRawString())) return
    }
    catch { /* falls through */ }
  }
  if (!selected.value || !pick(selected.value)) selected.value = recommended.value.find(p => kindOf(p) === 'liquidTF')?.address ?? recommended.value[0]?.address ?? ''
}, { immediate: true })
const customError = computed(() => {
  if (!custom.value) return null
  return pools.value.some(p => rawKey(p.address) === rawKey(custom.value!.toRawString())) ? null : 'tonapi does not list this address as a staking pool on this network.'
})
watch(custom, (a) => {
  if (a) pick(a.toRawString())
})

const pool = computed(() => pools.value.find(p => p.address === selected.value) ?? null)
const kind = computed(() => (pool.value ? kindOf(pool.value) : null))

// ---------------------------------------------------------------- pool parameters (get-methods)
const whales = shallowRef<WhalesParams | null>(null)
const rate = ref<number | null>(null)
const poolError = ref<unknown>(null)
async function loadPoolData() {
  whales.value = null
  rate.value = null
  poolError.value = null
  const p = pool.value
  if (!p) return
  const live = () => pool.value === p
  try {
    if (kind.value === 'whales') {
      const w = parseWhalesParams(await runGetMethod(api, p.address, 'get_params'))
      if (live()) whales.value = w
    }
    if (kind.value === 'liquidTF') {
      const r = liquidRate(await runGetMethod(api, p.address, 'get_pool_full_data'))
      if (live()) rate.value = r
    }
  }
  catch (e) {
    if (live()) poolError.value = e
  }
}
watch(pool, loadPoolData, { immediate: true })

// ---------------------------------------------------------------- the connected wallet's position
const owner = computed(() => (tc.wallet.value && !tc.networkMismatch.value ? Address.parse(tc.wallet.value.address) : null))
const position = shallowRef<NominatorPosition | null>(null)
const jetton = shallowRef<{ wallet: string, balance: bigint } | null>(null)
const balance = ref<bigint | null>(null)
const posLoading = ref(false)
const posError = ref<unknown>(null)
let posRun = 0
async function loadPosition() {
  const id = ++posRun
  const live = () => id === posRun
  position.value = null
  jetton.value = null
  balance.value = null
  posError.value = null
  const o = owner.value
  const p = pool.value
  posLoading.value = false
  if (!o || !p) return
  posLoading.value = true
  const raw = o.toRawString()
  try {
    const bal = toncenter.v2<string>('getAddressBalance', { address: raw }).then(b => live() && (balance.value = BigInt(b)), () => {})
    if (kind.value === 'liquidTF' && p.liquid_jetton_master) {
      try {
        const j = await api.get<{ balance: string, wallet_address: { address: string } }>(`accounts/${raw}/jettons/${p.liquid_jetton_master}`)
        if (live()) jetton.value = { wallet: j.wallet_address.address, balance: BigInt(j.balance) }
      }
      catch (e) {
        // No tsTON yet: tonapi answers 404.
        if (!(e instanceof TonApiError) || e.status !== 404) throw e
        if (live()) jetton.value = { wallet: '', balance: 0n }
      }
    }
    else {
      const r = await api.get<{ pools: NominatorPosition[] }>(`staking/nominator/${raw}/pools`)
      if (live()) position.value = r.pools.find(x => rawKey(x.pool) === rawKey(p.address)) ?? null
    }
    await bal
  }
  catch (e) {
    if (live()) posError.value = e
  }
  finally {
    if (live()) posLoading.value = false
  }
}
watch([owner, pool], loadPosition, { immediate: true })

// ---------------------------------------------------------------- form
const action = ref<Action>(q('action') === 'unstake' ? 'unstake' : 'stake')
const tabs = [{ label: 'Stake', value: 'stake', icon: 'i-lucide-arrow-down-to-line' }, { label: 'Unstake', value: 'unstake', icon: 'i-lucide-arrow-up-from-line' }]
const amountText = ref(q('amount'))
const amount = ref<bigint | null>(null)
const withdrawAll = ref(true)
const mode = ref<UnstakeMode>('auto')
const MODES = [
  { value: 'auto', label: 'Instant if possible, else after the round', description: 'Recommended. Paid now when the pool has spare liquidity.' },
  { value: 'round', label: 'Wait for the round end (best rate)', description: 'Includes this round\'s rewards. You get a withdrawal bill (NFT) that pays out automatically.' },
  { value: 'instant', label: 'Instant only', description: 'Fails (tsTON comes back) if the pool cannot pay right now.' }
]
watch([selected, action], (_, [prevPool]) => {
  // Keep a prefilled ?amount= when the first pool gets picked; clear on user changes.
  if (prevPool) amountText.value = ''
})
const queryId = freshQueryId()

const staked = computed(() => (position.value ? nano(position.value.amount) + nano(position.value.pending_deposit) : undefined))
const unit = computed(() => (kind.value === 'liquidTF' && action.value === 'unstake' ? 'tsTON' : COIN_SYMBOL))
const plan = computed(() => {
  if (!pool.value || !kind.value) return { messages: [], notes: [], problem: 'Pick a pool.' }
  return buildPlan({
    kind: kind.value,
    action: action.value,
    pool: pool.value,
    amount: amount.value,
    withdrawAll: withdrawAll.value,
    mode: mode.value,
    whales: whales.value,
    owner: owner.value,
    jettonWallet: jetton.value?.wallet || null,
    jettonBalance: jetton.value?.balance ?? null,
    staked: staked.value,
    noPosition: !!owner.value && !posLoading.value && !posError.value && kind.value !== 'liquidTF' && !position.value,
    queryId
  })
})
const total = computed(() => plan.value.messages.reduce((s, m) => s + BigInt(m.amount), 0n))
const short = computed(() => balance.value !== null && total.value > 0n && total.value > balance.value)

// What you get back, at the pool's current rate.
const estimate = computed(() => {
  if (kind.value !== 'liquidTF' || !rate.value || !amount.value) return null
  const r = BigInt(Math.round(rate.value * 1e9))
  return action.value === 'stake'
    ? `You receive ≈ ${formatAmount(amount.value * 1_000_000_000n / r, 9, { maxDecimals: 4 })} tsTON (1 tsTON = ${rate.value.toFixed(5)} ${COIN_SYMBOL}).`
    : `You receive ≈ ${formatCoin(amount.value * r / 1_000_000_000n, { maxDecimals: 4 })} at today's rate.`
})

function setMax() {
  if (action.value === 'unstake' && jetton.value) amountText.value = formatUnits(jetton.value.balance)
  else if (action.value === 'unstake' && staked.value !== undefined) amountText.value = formatUnits(staked.value)
  else if (balance.value !== null) {
    // Keep 1.5 GRAM for the pool's processing fee and network fees.
    const keep = 1_500_000_000n
    amountText.value = balance.value > keep ? formatUnits(balance.value - keep) : '0'
  }
}
function example() {
  const ts = recommended.value.find(p => kindOf(p) === 'liquidTF')
  if (ts) selected.value = ts.address
  action.value = 'stake'
  nextTick(() => (amountText.value = '10'))
}
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading && !pools.length" label="Loading staking pools…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not load staking pools" @retry="load(true)" />

    <template v-if="pools.length">
      <div class="space-y-3">
        <UFormField label="Pool" help="Verified pools, largest first. Compare them all in the Staking pools explorer.">
          <USelect v-model="selected" :items="items" class="w-full" placeholder="Choose a pool" data-testid="pool-select" />
        </UFormField>
        <details class="text-sm" :open="!!customText">
          <summary class="cursor-pointer text-muted">
            Use another pool address (e.g. a private nominator pool)
          </summary>
          <div class="mt-2 space-y-1">
            <AddressInput v-model="customText" label="Pool address" @parsed="custom = $event" />
            <p v-if="customError" class="text-xs text-error">
              {{ customError }}
            </p>
          </div>
        </details>
        <UAlert v-if="network === 'testnet'" color="warning" variant="subtle" icon="i-lucide-flask-conical" description="Testnet: tonapi lists only TON Core nominator pools; Tonstakers and TON Whales are mainnet only." />
        <UButton :label="`Try an example (stake 10 ${COIN_SYMBOL} in Tonstakers)`" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example" />
      </div>

      <div v-if="pool && kind" class="space-y-4 rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
              {{ pool.name }}
              <UBadge v-if="pool.verified" color="success" variant="subtle" size="sm" icon="i-lucide-badge-check" label="Verified" />
              <UBadge color="neutral" variant="soft" size="sm" :label="KINDS[kind].label" />
            </p>
            <ExplorerLinks :value="pool.address" class="mt-1" />
          </div>
          <a :href="KINDS[kind].url" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">{{ KINDS[kind].provider }}<UIcon name="i-lucide-arrow-up-right" class="size-3" /></a>
        </div>
        <PoolStats :pool="pool" :now="now" />
        <p class="text-sm text-muted">
          {{ KINDS[kind].blurb }}
        </p>
        <ErrorNotice v-if="poolError" :error="poolError" title="Could not read the pool's parameters" @retry="loadPoolData" />

        <!-- Connected wallet position -->
        <div v-if="owner" class="rounded-md bg-elevated/50 p-3 text-sm">
          <LoadingState v-if="posLoading" label="Reading your position…" />
          <ErrorNotice v-else-if="posError" :error="posError" title="Could not read your position" @retry="loadPosition" />
          <dl v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <template v-if="kind === 'liquidTF'">
              <div><dt class="text-xs text-muted">Your tsTON</dt><dd><TokenAmount :nano="jetton?.balance ?? 0n" symbol="tsTON" :max-decimals="4" /></dd></div>
              <div v-if="rate && jetton"><dt class="text-xs text-muted">Worth</dt><dd><TokenAmount :nano="jetton.balance * BigInt(Math.round(rate * 1e9)) / 1000000000n" :max-decimals="4" /></dd></div>
            </template>
            <template v-else>
              <div><dt class="text-xs text-muted">Staked</dt><dd><TokenAmount :nano="nano(position?.amount)" :max-decimals="4" /></dd></div>
              <div><dt class="text-xs text-muted">Pending deposit</dt><dd><TokenAmount :nano="nano(position?.pending_deposit)" :max-decimals="4" /></dd></div>
              <div><dt class="text-xs text-muted">Pending withdraw</dt><dd><TokenAmount :nano="nano(position?.pending_withdraw)" :max-decimals="4" /></dd></div>
              <div><dt class="text-xs text-muted">Ready to withdraw</dt><dd><TokenAmount :nano="nano(position?.ready_withdraw)" :max-decimals="4" /></dd></div>
            </template>
            <div v-if="balance !== null">
              <dt class="text-xs text-muted">
                Wallet balance
              </dt><dd><TokenAmount :nano="balance" :max-decimals="4" /></dd>
            </div>
          </dl>
        </div>

        <UTabs v-model="action" :items="tabs" :content="false" class="w-full" data-testid="action-tabs" />

        <div class="space-y-3">
          <template v-if="!(action === 'unstake' && kind === 'tf') && !(action === 'unstake' && kind === 'whales' && withdrawAll)">
            <AmountInput v-model="amountText" v-model:nano="amount" :label="action === 'stake' ? `Amount to stake (${COIN_SYMBOL})` : `Amount to unstake (${unit})`" :unit="unit" />
            <UButton v-if="owner && (balance !== null || jetton || position)" label="Max" size="xs" variant="outline" color="neutral" @click="setMax" />
          </template>
          <UCheckbox v-if="action === 'unstake' && kind === 'whales'" v-model="withdrawAll" label="Withdraw everything" description="Sends amount 0, which the pool treats as 'all of my stake'." />
          <URadioGroup v-if="action === 'unstake' && kind === 'liquidTF'" v-model="mode" :items="MODES" legend="How to get paid" data-testid="unstake-mode" />
          <p v-if="estimate" class="text-sm text-highlighted" data-testid="estimate">
            {{ estimate }}
          </p>
          <UAlert v-if="plan.problem" color="neutral" variant="subtle" icon="i-lucide-info" :description="plan.problem" data-testid="plan-problem" />
          <ul v-if="plan.messages.length" class="list-disc space-y-1 pl-5 text-sm text-muted">
            <li v-for="n in plan.notes" :key="n">
              {{ n }}
            </li>
          </ul>
          <UAlert v-if="short" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="`This needs ${formatCoin(total)} plus network fees, but your wallet holds ${formatCoin(balance!)}.`" />
        </div>
      </div>

      <SendFlow
        v-if="pool"
        :messages="plan.messages"
        :purpose="action === 'stake' ? 'stake' : 'unstake'"
        :label="action === 'stake' ? 'Stake with wallet' : 'Unstake with wallet'"
        :confirm="kind === 'tf' && action === 'stake' ? `I understand the pool keeps 1 ${COIN_SYMBOL} as a fee and my coins stay locked until I withdraw and the round ends.` : undefined"
      />
      <p class="text-xs text-muted">
        Bodies follow the pool contracts (Tonstakers SDK, tonwhales/ton-nominators, ton-blockchain/nominator-pool) and match real mainnet transactions. Staking always has some risk: pools can be slashed if their validator misbehaves.
      </p>
    </template>
  </div>
</template>
