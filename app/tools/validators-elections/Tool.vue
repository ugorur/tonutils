<script setup lang="ts">
import { Address } from '@ton/core'
import { decodeParam, ELECTOR_ADDRESS, frac16, splitConfig } from '~/lib/network/config'
import { runGetV2 } from '~/lib/network/stack'
import type { Election, ElectLimits, TonapiValidator } from './logic'
import { countdown, electionPhase, parseParticipantList, share, simulateElection } from './logic'

const { network } = useTonNetwork()
// Same ref as the watcher below: separate useCookie refs can lag each other after a switch.
const tc = useToncenter(network)
const api = useTonapi(network)

interface Current { electAt: number, validators: TonapiValidator[] }
const current = shallowRef<Current | null>(null)
const limits = shallowRef<ElectLimits | null>(null)
const timing = shallowRef<{ electedFor: number, startBefore: number, endBefore: number, heldFor: number } | null>(null)
const election = shallowRef<Election | null>(null)
const electionSeqno = ref(0)
const loading = ref(false)
const error = ref<unknown>(null)

// Bumped on every load; a slower response from an earlier load (e.g. the other network) is dropped.
let gen = 0
async function load() {
  const g = ++gen
  loading.value = true
  error.value = null
  try {
    // tonapi and toncenter have separate queues, so these overlap.
    const [vals, cfg, ple] = await Promise.all([
      api.get<{ elect_at: number, validators: TonapiValidator[] }>('blockchain/validators'),
      tc.v2<{ config: { bytes: string } }>('getConfigAll'),
      runGetV2(tc.baseUrl(), ELECTOR_ADDRESS, 'participant_list_extended')
    ])
    if (g !== gen) return
    current.value = { electAt: vals.elect_at, validators: [...vals.validators].sort((a, b) => b.stake - a.stake) }
    const params = splitConfig(cfg.config.bytes)
    const j = <T>(id: number) => decodeParam(id, params.get(id)!).json as T
    const t15 = j<{ validatorsElectedFor: number, electorsStartBefore: number, electorsEndBefore: number, stakeHeldFor: number }>(15)
    const t16 = j<{ maxValidators: number, minValidators: number }>(16)
    const t17 = j<{ minStake: bigint, maxStake: bigint, minTotalStake: bigint, maxStakeFactor: number }>(17)
    timing.value = { electedFor: t15.validatorsElectedFor, startBefore: t15.electorsStartBefore, endBefore: t15.electorsEndBefore, heldFor: t15.stakeHeldFor }
    limits.value = { ...t16, ...t17 }
    election.value = ple.exitCode === 0 ? parseParticipantList(ple.stack) : null
    electionSeqno.value = ple.seqno
  }
  catch (e) {
    if (g === gen) error.value = e
  }
  finally {
    if (g === gen) loading.value = false
  }
}
watch(network, () => {
  current.value = null
  election.value = null
  load()
}, { immediate: true })

/** Friendly or raw address → raw lowercase; anything else (hex keys) lowercased. */
function normQuery(q: string) {
  const t = q.trim()
  if (!t) return ''
  try {
    return Address.parse(t).toRawString()
  }
  catch {
    return t.toLowerCase()
  }
}

const now = ref(Math.floor(Date.now() / 1000))
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 15_000)))
onBeforeUnmount(() => clearInterval(clock))

const phase = computed(() => (current.value && timing.value ? electionPhase(current.value.electAt, timing.value, now.value) : null))
const totalStake = computed(() => current.value?.validators.reduce((s, v) => s + BigInt(v.stake), 0n) ?? 0n)
const smallest = computed(() => current.value?.validators.at(-1)?.stake ?? 0)
const fmtDate = (unix: number) => new Date(unix * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
const coin = (nano: bigint | number) => formatCoin(BigInt(nano), { maxDecimals: 0 })
/** 667377638 GRAM → "667.4M GRAM" for small stat cards; the exact value goes in the title. */
const compact = (nano: bigint) => `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(nano / NANO_PER_COIN))} ${COIN_SYMBOL}`

const banner = computed(() => {
  const p = phase.value
  if (!p) return null
  if (p.phase === 'open') return { color: 'success' as const, icon: 'i-lucide-vote', title: `Election open, closes in ${countdown(p.closesAt - now.value)}`, text: `Stakes are accepted until ${fmtDate(p.closesAt)}. The elected validators start on ${fmtDate(p.nextRound)}.` }
  if (p.phase === 'closed') return { color: 'info' as const, icon: 'i-lucide-lock', title: `Election closed, new validators start in ${countdown(p.nextRound - now.value)}`, text: `The new round starts on ${fmtDate(p.nextRound)}.` }
  return { color: 'neutral' as const, icon: 'i-lucide-calendar-clock', title: `Next election opens in ${countdown(p.opensAt - now.value)}`, text: `Voting window: ${fmtDate(p.opensAt)} to ${fmtDate(p.closesAt)}.` }
})

// ---------------------------------------------------------------- open election
const projection = computed(() => (election.value && limits.value ? simulateElection(election.value.participants, limits.value) : null))
const pSearch = ref('')
const pRows = computed(() => {
  const e = election.value
  if (!e) return []
  const elected = projection.value?.elected
  const q = normQuery(pSearch.value)
  return e.participants
    .map((p, i) => ({ ...p, i, elected: elected?.has(i) ?? false }))
    .sort((a, b) => (b.stake > a.stake ? 1 : b.stake < a.stake ? -1 : 0))
    .map((p, k) => ({ ...p, rank: k + 1 }))
    .filter(p => !q || p.wallet.includes(q) || p.pubkey.includes(q) || p.adnl.includes(q))
})
const pLimit = ref(25)
const wide = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }
const pColumns = [
  { accessorKey: 'rank', header: '#', meta: wide },
  { accessorKey: 'wallet', header: 'Wallet' },
  { accessorKey: 'stake', header: 'Stake' },
  { accessorKey: 'maxFactor', header: 'Max factor', meta: wide },
  { accessorKey: 'elected', header: 'Projection' }
]
const pCsv = computed(() => pRows.value.map(p => ({ rank: p.rank, wallet: p.wallet, stake: formatUnits(p.stake), max_factor: frac16(p.maxFactor), would_be_elected: p.elected ? 'yes' : 'no', pubkey: p.pubkey, adnl: p.adnl })))

// ---------------------------------------------------------------- current set
const vSearch = ref('')
const vRows = computed(() => {
  const list = current.value?.validators ?? []
  const total = list.reduce((s, v) => s + v.stake, 0)
  const q = normQuery(vSearch.value)
  return list
    .map((v, i) => ({ ...v, rank: i + 1, share: share(v.stake, total) }))
    .filter(v => !q || v.address.toLowerCase().includes(q) || v.adnl_address.includes(q))
})
const vLimit = ref(25)
const vColumns = [
  { accessorKey: 'rank', header: '#', meta: wide },
  { accessorKey: 'address', header: 'Validator wallet' },
  { accessorKey: 'stake', header: 'Stake' },
  { accessorKey: 'share', header: 'Share' },
  { accessorKey: 'adnl_address', header: 'ADNL', meta: wide }
]
const vCsv = computed(() => vRows.value.map(v => ({ rank: v.rank, address: v.address, stake: formatUnits(BigInt(v.stake)), share: v.share, max_factor: frac16(v.max_factor), adnl: v.adnl_address })))
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading && !current" label="Reading validators, config and the elector contract…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not load validator data" @retry="load" />

    <template v-if="current && timing && limits">
      <UAlert v-if="banner" :color="banner.color" variant="subtle" :icon="banner.icon" :title="banner.title" :description="banner.text" data-testid="phase-banner" />

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Validators now
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg" data-testid="validator-count">
            {{ current.validators.length }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            limit {{ limits.minValidators }}–{{ limits.maxValidators }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Total stake
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            <span :title="coin(totalStake)">{{ compact(totalStake) }}</span>
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            frozen by the current validators
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Smallest elected stake
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            {{ coin(smallest) }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            config minimum {{ coin(limits.minStake) }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Round ends
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            {{ phase ? countdown(phase.nextRound - now) : '—' }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            rounds last {{ Math.round(timing.electedFor / 3600) }} h
          </div>
        </div>
      </div>

      <!-- Open election -->
      <section aria-labelledby="elect-h" class="space-y-3">
        <h3 id="elect-h" class="font-display text-base font-semibold text-highlighted">
          {{ election ? `Election for the round starting ${fmtDate(election.electAt)}` : 'Election' }}
        </h3>
        <p v-if="!election" class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
          No election is running on {{ network }} right now. The elector opens the next one {{ Math.round(timing.startBefore / 3600) }} h before the round ends{{ phase ? ` (${fmtDate(phase.opensAt)})` : '' }}.
        </p>
        <template v-else>
          <div class="grid gap-3 sm:grid-cols-3">
            <ResultField label="Participants" :value="String(election.participants.length)" :copy="false" />
            <ResultField label="Stake submitted" :value="coin(election.totalStake)" :copy="false" />
            <ResultField
              label="Minimum stake to get in (if it closed now)"
              :value="projection?.count ? coin(projection.minStake) : 'Not enough participants yet'"
              :hint="projection?.count ? `${projection.count} validators would be elected with ${coin(projection.effectiveTotal)} effective stake` : undefined"
              :copy="false"
              data-testid="projected-min"
            />
          </div>
          <p class="text-xs text-dimmed">
            Projection runs the elector's own selection (elector-code.fc try_elect) on the live participant list with the current limits:
            stakes are capped at {{ coin(limits.maxStake) }}, and nobody counts for more than max factor × the smallest elected stake (cap {{ frac16(limits.maxStakeFactor) }}×).
            The result changes as stakes arrive until the election closes. Elector state at block {{ electionSeqno.toLocaleString('en-US') }}.
          </p>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <UInput v-model="pSearch" icon="i-lucide-search" placeholder="Find by wallet address, public key or ADNL" class="w-full sm:flex-1" aria-label="Search participants" />
            <CsvExportButton :rows="pCsv" :filename="`election-${election.electAt}-participants`" />
          </div>
          <UTable :data="pRows.slice(0, pLimit)" :columns="pColumns" class="max-h-[36rem]" sticky :ui="{ td: 'py-2 align-top whitespace-normal', th: 'py-2' }">
            <template #wallet-cell="{ row }">
              <AddressLink :address="row.original.wallet" no-links />
            </template>
            <template #stake-cell="{ row }">
              <span class="font-mono text-sm tabular-nums">{{ coin(row.original.stake) }}</span>
            </template>
            <template #maxFactor-cell="{ row }">
              <span class="font-mono text-sm">{{ frac16(row.original.maxFactor) }}×</span>
            </template>
            <template #elected-cell="{ row }">
              <UBadge :label="row.original.elected ? 'Elected' : 'Below the cut'" :color="row.original.elected ? 'success' : 'neutral'" variant="subtle" size="sm" />
            </template>
            <template #empty>
              <span class="text-sm text-muted">No participant matches.</span>
            </template>
          </UTable>
          <UButton v-if="pRows.length > pLimit" :label="`Show more (${pRows.length - pLimit} left)`" variant="outline" color="neutral" size="sm" @click="pLimit += 100" />
        </template>
      </section>

      <!-- Current validators -->
      <section aria-labelledby="vals-h" class="space-y-3">
        <h3 id="vals-h" class="font-display text-base font-semibold text-highlighted">
          Current validator set
        </h3>
        <p class="text-sm text-muted">
          Round started on {{ fmtDate(current.electAt) }}. Stakes stay frozen until {{ Math.round(timing.heldFor / 3600) }} h after the round ends.
        </p>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <UInput v-model="vSearch" icon="i-lucide-search" placeholder="Find by wallet address or ADNL" class="w-full sm:flex-1" aria-label="Search validators" />
          <CsvExportButton :rows="vCsv" :filename="`validators-${current.electAt}`" />
        </div>
        <UTable :data="vRows.slice(0, vLimit)" :columns="vColumns" class="max-h-[36rem]" sticky :ui="{ td: 'py-2 align-top whitespace-normal', th: 'py-2' }">
          <template #address-cell="{ row }">
            <AddressLink :address="row.original.address" no-links />
          </template>
          <template #stake-cell="{ row }">
            <span class="font-mono text-sm tabular-nums">{{ coin(row.original.stake) }}</span>
          </template>
          <template #adnl_address-cell="{ row }">
            <span class="inline-flex items-center gap-1">
              <span class="font-mono text-xs text-muted" :title="row.original.adnl_address">{{ row.original.adnl_address.slice(0, 8) }}…</span>
              <CopyButton :value="row.original.adnl_address" size="xs" />
            </span>
          </template>
          <template #empty>
            <span class="text-sm text-muted">No validator matches.</span>
          </template>
        </UTable>
        <UButton v-if="vRows.length > vLimit" :label="`Show more (${vRows.length - vLimit} left)`" variant="outline" color="neutral" size="sm" @click="vLimit += 100" />
        <p class="text-xs text-dimmed">
          Validator list from tonapi; timings and limits from config params 15, 16 and 17; election data straight from the elector contract ({{ ELECTOR_ADDRESS.slice(0, 8) }}…).
          Want to stake without running a validator? See the <NuxtLink to="/tools/staking-pools" class="text-primary underline-offset-2 hover:underline">staking pools explorer</NuxtLink>.
        </p>
      </section>
    </template>
  </div>
</template>
