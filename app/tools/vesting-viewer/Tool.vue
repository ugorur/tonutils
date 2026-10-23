<script setup lang="ts">
import type { Address } from '@ton/core'
import { Address as Addr, Cell } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { detectWalletVersion } from '~/utils/ton/wallets'
import type { TcVestingInfo, VestingState } from './logic'
import { humanDuration, parseVestingData, unlockSchedule, vestingNow } from './logic'

const EXAMPLES = [
  { label: 'Vesting wallet', value: 'EQDWiWnUDVf5F6DpTuOE9528gWJ_DpiaII5E64Dl0gMuGNNS' },
  { label: 'Its owner', value: 'UQAG3pIvsXdFJVKVLmf-bh-9zMUcM51RNoysUgCWv8Q3q7N-' }
]

const input = ref('')
const parsed = ref<Address | null>(null)
const loading = ref('')
const error = ref<unknown>(null)
const vest = ref<{ address: string, balance: bigint, v: VestingState, now: number } | null>(null)
const owned = ref<{ wallet: string, raw: string, list: TcVestingInfo[] } | null>(null)
const showAll = ref(false)

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()
const fr = (raw: string, bounceable = true) => Addr.parse(raw).toString({ bounceable, testOnly: isTestnet.value })

async function run() {
  if (!parsed.value) return
  const a = parsed.value
  error.value = null
  vest.value = null
  owned.value = null
  showAll.value = false
  try {
    loading.value = 'Reading the contract…'
    const acc = await tc.v3<{ balance: string, code: string | null, data: string | null }>('account', { address: a.toRawString() })
    const kind = acc.code ? detectWalletVersion(Cell.fromBase64(acc.code).hash().toString('hex')) : null
    if (kind?.version === 'vesting' && acc.data) {
      vest.value = { address: a.toString({ testOnly: isTestnet.value }), balance: BigInt(acc.balance), v: parseVestingData(Cell.fromBase64(acc.data)), now: Math.floor(Date.now() / 1000) }
      return
    }
    loading.value = 'Not a vesting wallet. Looking for vesting wallets it owns…'
    const r = await tc.v3<{ vesting_contracts: TcVestingInfo[] }>('vesting', { wallet_address: a.toRawString(), limit: 100 })
    owned.value = { wallet: a.toString({ bounceable: false, testOnly: isTestnet.value }), raw: a.toRawString().toUpperCase(), list: r.vesting_contracts }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = ''
  }
}
function open(v: string) {
  input.value = v
  nextTick(run)
}
watch(network, () => {
  if (vest.value || owned.value) run()
})

const events = computed(() => (vest.value ? unlockSchedule(vest.value.v) : null))
const now = computed(() => (vest.value ? vestingNow(vest.value.v, vest.value.balance, vest.value.now, events.value) : null))
const date = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const pct = computed(() => {
  const v = vest.value?.v
  if (!v || !now.value || v.totalAmount === 0n) return 0
  return Number((now.value.unlocked * 10000n) / v.totalAmount) / 100
})

const PHASE = {
  'not-started': { label: 'Not started', color: 'neutral' },
  'cliff': { label: 'In cliff: everything locked', color: 'warning' },
  'vesting': { label: 'Unlocking', color: 'primary' },
  'done': { label: 'Fully unlocked', color: 'success' }
} as const

const termRows = computed<KeyValueItem[]>(() => {
  const x = vest.value
  if (!x) return []
  const v = x.v
  return [
    { label: 'Start', value: date(v.startTime), mono: false },
    { label: 'Cliff', value: v.cliffDuration ? `${humanDuration(v.cliffDuration)}, until ${date(v.startTime + v.cliffDuration)}` : 'None', hint: 'Nothing unlocks before the cliff ends; then everything vested so far unlocks at once', mono: false, copy: false },
    { label: 'Unlock every', value: humanDuration(v.unlockPeriod), hint: `${v.unlockPeriod} s`, mono: false, copy: false },
    { label: 'Total duration', value: `${humanDuration(v.totalDuration)}, ends ${date(v.startTime + v.totalDuration)}`, hint: `${v.totalDuration} s`, mono: false, copy: false },
    { label: 'Total amount', value: formatCoin(v.totalAmount), mono: false },
    { label: 'Owner', value: v.owner ? fr(v.owner.toRawString(), false) : 'none', hint: 'Can withdraw unlocked funds, and send locked funds to whitelisted addresses or back to the sender' },
    { label: 'Sender', value: v.sender ? fr(v.sender.toRawString(), false) : 'none', hint: 'Who set up the vesting; can add whitelist addresses and may receive locked funds back at any time' },
    { label: 'Subwallet id', value: String(v.subwalletId) },
    { label: 'Public key', value: v.publicKey }
  ]
})

// Step chart: locked amount over the whole schedule, as an inline SVG.
const W = 600
const H = 160
const chart = computed(() => {
  const x = vest.value
  if (!x || !events.value || x.v.totalAmount === 0n) return null
  const v = x.v
  const t0 = v.startTime
  const t1 = v.startTime + v.totalDuration + 1
  const sx = (t: number) => ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * W
  const sy = (amt: bigint) => H - Number((amt * 1000n) / v.totalAmount) / 1000 * H
  let d = `M0,${sy(v.totalAmount)}`
  for (const e of events.value) d += ` H${sx(e.time).toFixed(1)} V${sy(e.lockedAfter).toFixed(1)}`
  d += ` H${W}`
  return { d, nowX: x.now >= t0 && x.now <= t1 ? sx(x.now) : null, cliffX: v.cliffDuration ? sx(t0 + v.cliffDuration) : null }
})

const listed = computed(() => {
  const e = events.value ?? []
  return showAll.value ? e : e.filter(x => x.time > (vest.value?.now ?? 0)).slice(0, 6)
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <AddressInput v-model="input" label="Vesting wallet or owner address" @parsed="a => (parsed = a)" />
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UButton type="submit" label="Look up" icon="i-lucide-search" :loading="!!loading" :disabled="!parsed" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="open(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="loading" />
    <ErrorNotice :error="error" @retry="run" />

    <!-- owner / sender lookup -->
    <template v-if="owned && !loading">
      <UAlert
        v-if="!owned.list.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-dashed"
        title="No vesting wallet here"
        description="This address is not a vesting wallet (ton-blockchain/vesting-contract), and the indexer knows no vesting wallet it owns or funded. Other lockup contracts (restricted/lockup wallets) are not covered."
      />
      <div v-else class="space-y-3">
        <p class="text-sm text-muted">
          This is not a vesting wallet itself. Vesting wallets linked to it:
        </p>
        <div v-for="c in owned.list" :key="c.address" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default p-3">
          <div class="min-w-0 space-y-1">
            <AddressLink :address="c.address" />
            <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <UBadge :label="c.owner_address.toUpperCase() === owned.raw ? 'Owner' : 'Sender'" variant="subtle" size="sm" />
              <TokenAmount :nano="c.total_amount" />
              <span>from {{ date(c.start_time) }}</span>
            </div>
          </div>
          <UButton label="Open" trailing-icon="i-lucide-arrow-right" variant="soft" size="sm" @click="open(fr(c.address))" />
        </div>
      </div>
    </template>

    <!-- vesting wallet -->
    <template v-if="vest && now && !loading">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <AddressLink :address="vest.address" full />
        <UBadge :color="PHASE[now.phase].color" variant="subtle" :label="PHASE[now.phase].label" />
      </div>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-md border border-default p-3">
          <div class="text-xs text-muted">
            Still locked
          </div>
          <div class="text-sm sm:text-base">
            <TokenAmount :nano="now.locked" :max-decimals="2" symbol="" class="font-display text-highlighted" /> <span class="text-xs text-muted">{{ COIN_SYMBOL }}</span>
          </div>
        </div>
        <div class="rounded-md border border-default p-3">
          <div class="text-xs text-muted">
            Unlocked so far
          </div>
          <div class="text-sm sm:text-base">
            <TokenAmount :nano="now.unlocked" :max-decimals="2" symbol="" class="font-display text-highlighted" /> <span class="text-xs text-muted">{{ COIN_SYMBOL }}</span>
          </div>
        </div>
        <div class="rounded-md border border-default p-3">
          <div class="text-xs text-muted">
            Balance now
          </div>
          <div class="text-sm sm:text-base">
            <TokenAmount :nano="vest.balance" :max-decimals="2" symbol="" class="font-display text-highlighted" /> <span class="text-xs text-muted">{{ COIN_SYMBOL }}</span>
          </div>
        </div>
        <div class="rounded-md border border-primary/50 p-3">
          <div class="text-xs text-muted">
            Withdrawable now
          </div>
          <div class="text-sm sm:text-base">
            <TokenAmount :nano="now.withdrawable" :max-decimals="2" symbol="" class="font-display text-highlighted" /> <span class="text-xs text-muted">{{ COIN_SYMBOL }}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="flex justify-between text-xs text-muted">
          <span>{{ pct }}% unlocked</span>
          <span v-if="now.next">Next: <TokenAmount :nano="now.next.amount" :max-decimals="2" /> on {{ date(now.next.time) }}</span>
        </div>
        <UProgress :model-value="pct" class="mt-1" />
      </div>

      <figure v-if="chart" class="space-y-1">
        <svg :viewBox="`0 0 ${W} ${H + 2}`" class="h-40 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Locked amount over time">
          <path :d="`${chart.d} V${H} H0 Z`" class="fill-primary/10" />
          <path :d="chart.d" class="fill-none stroke-primary" stroke-width="2" vector-effect="non-scaling-stroke" />
          <line v-if="chart.cliffX !== null" :x1="chart.cliffX" :x2="chart.cliffX" y1="0" :y2="H" class="stroke-warning" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
          <line v-if="chart.nowX !== null" :x1="chart.nowX" :x2="chart.nowX" y1="0" :y2="H" class="text-highlighted" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        </svg>
        <figcaption class="flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>{{ date(vest.v.startTime) }}</span>
          <span><span class="text-primary">━</span> locked · <span class="text-warning">┆</span> cliff end · <span class="text-highlighted">│</span> now</span>
          <span>{{ date(vest.v.startTime + vest.v.totalDuration) }}</span>
        </figcaption>
      </figure>

      <div>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Terms
        </h3>
        <KeyValue :items="termRows" />
      </div>

      <div>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Whitelist ({{ vest.v.whitelist.length }})
        </h3>
        <p class="mt-1 text-sm text-muted">
          The owner may send even locked funds to these addresses (usually staking pools or the elector), with bounceable messages only. Locked funds can also always go back to the sender.
        </p>
        <ul v-if="vest.v.whitelist.length" class="mt-2 space-y-1.5">
          <li v-for="w in vest.v.whitelist" :key="w">
            <AddressLink :address="w" />
          </li>
        </ul>
      </div>

      <div v-if="events">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            {{ showAll ? `All ${events.length} unlocks` : 'Upcoming unlocks' }}
          </h3>
          <CsvExportButton
            :rows="events.map(e => ({ date: new Date(e.time * 1000).toISOString(), unix_time: e.time, unlocked_nano: e.amount.toString(), locked_after_nano: e.lockedAfter.toString() }))"
            filename="vesting-schedule.csv"
          />
        </div>
        <p v-if="!listed.length" class="mt-2 text-sm text-muted">
          Nothing left to unlock.
        </p>
        <div v-else class="mt-2 divide-y divide-default">
          <div v-for="e in listed" :key="e.time" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2 text-sm" :class="e.time <= vest.now ? 'text-muted' : ''">
            <span>{{ date(e.time) }}</span>
            <span>+<TokenAmount :nano="e.amount" :max-decimals="2" /> <span class="text-xs text-muted">(locked after: <TokenAmount :nano="e.lockedAfter" :max-decimals="2" />)</span></span>
          </div>
        </div>
        <UButton :label="showAll ? 'Show upcoming only' : `Show all ${events.length}`" variant="ghost" color="neutral" size="sm" class="mt-1" @click="showAll = !showAll" />
      </div>
      <p v-else class="text-sm text-muted">
        This schedule unlocks in too many small steps to list ({{ Math.floor(vest.v.totalDuration / vest.v.unlockPeriod) }} periods).
      </p>

      <p class="text-xs text-muted">
        Amounts use the contract's own get_locked_amount formula on the current on-chain data. "Withdrawable now" is the balance minus what is still locked; transfer fees come on top.
      </p>
    </template>
  </div>
</template>
