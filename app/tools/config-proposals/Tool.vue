<script setup lang="ts">
import { Cell } from '@ton/core'
import type { DecodedParam } from '~/lib/network/config'
import { CONFIG_ADDRESS, decodeParam, splitConfig } from '~/lib/network/config'
import ParamFields from '~/lib/network/ParamFields.vue'
import { runGetV2 } from '~/lib/network/stack'
import type { Proposal, RoundProgress, VotingRules } from './logic'
import { parseProposals, proposalStatus, roundProgress } from './logic'

const { network } = useTonNetwork()
// Same ref as the watcher below: separate useCookie refs can lag each other after a switch.
const tc = useToncenter(network)

/** A mainnet block during a real vote: params 30 and 8 (protocol v16) were proposed on 2026-10-20. */
const EXAMPLE_SEQNO = 100282600

interface View {
  p: Proposal
  proposed: DecodedParam | null
  current: DecodedParam | null
  rules: VotingRules
  r: RoundProgress
}
const views = shallowRef<View[]>([])
const at = ref(0)
const atTime = ref(0)
const vset = shallowRef<{ vsetHash: string, totalWeight: bigint, total: number } | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const blockInput = ref('')
const historic = ref(false)

// Bumped on every load; a slower response from an earlier load (other block or network) is dropped.
let gen = 0
async function load(seqno?: number) {
  const g = ++gen
  loading.value = true
  error.value = null
  views.value = []
  try {
    const res = await runGetV2(tc.baseUrl(), CONFIG_ADDRESS, 'list_proposals', seqno)
    if (res.exitCode !== 0) throw new Error(`list_proposals failed with exit code ${res.exitCode}`)
    const list = parseProposals(res.stack)
    const cfg = splitConfig((await tc.v2<{ config: { bytes: string } }>('getConfigAll', { seqno: res.seqno })).config.bytes)
    // Historic view: judge expiry by the block's own time, not today's.
    const blockTime = seqno
      ? Number((await tc.v3<{ blocks: { gen_utime: string }[] }>('blocks', { workchain: -1, seqno: res.seqno, limit: 1 })).blocks[0]?.gen_utime ?? 0)
      : 0
    if (g !== gen) return
    const v = decodeParam(34, cfg.get(34)!)
    const vj = v.json as { totalWeight: bigint, total: number, timeSince: number }
    const cur = { vsetHash: v.hash, totalWeight: vj.totalWeight, total: vj.total }
    vset.value = cur
    const voting = decodeParam(11, cfg.get(11)!).json as { normalParams: VotingRules, criticalParams: VotingRules }
    at.value = res.seqno
    historic.value = !!seqno
    atTime.value = blockTime
    views.value = list.map(p => ({
      p,
      proposed: p.value ? decodeParam(p.paramId, Cell.fromBase64(p.value)) : null,
      current: cfg.has(p.paramId) ? decodeParam(p.paramId, cfg.get(p.paramId)!) : null,
      rules: p.critical ? voting.criticalParams : voting.normalParams,
      r: roundProgress(p, cur)
    }))
  }
  catch (e) {
    if (g === gen) error.value = e
  }
  finally {
    if (g === gen) loading.value = false
  }
}
watch(network, () => load(), { immediate: true })

const blockError = computed(() => (blockInput.value.trim() && !/^\d{1,10}$/.test(blockInput.value.trim()) ? 'Enter a masterchain block number' : undefined))
function loadBlock() {
  if (!blockInput.value.trim() || blockError.value) return
  load(Number(blockInput.value.trim()))
}
function example() {
  blockInput.value = String(EXAMPLE_SEQNO)
  load(EXAMPLE_SEQNO)
}
function latest() {
  blockInput.value = ''
  load()
}

const now = computed(() => atTime.value || Math.floor(Date.now() / 1000))
const fmtDate = (unix: number) => new Date(unix * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      Anyone can pay to propose a new value for a config param. Validators then vote; a proposal wins a round when validators holding ¾ of the stake weight vote for it,
      and it takes effect after enough winning rounds (config param 11). Proposals are stored in the config contract and listed here straight from its <code class="font-mono text-xs">list_proposals</code> get-method.
    </p>

    <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
      <UFormField :error="blockError" class="w-full sm:flex-1">
        <UInput v-model="blockInput" inputmode="numeric" placeholder="Look at an earlier masterchain block (optional)" class="w-full" aria-label="Masterchain block number" @keydown.enter="loadBlock" />
      </UFormField>
      <div class="flex gap-2">
        <UButton label="Load block" icon="i-lucide-history" color="neutral" variant="outline" :disabled="!blockInput.trim() || !!blockError" :loading="loading && !!blockInput" @click="loadBlock" />
        <UButton v-if="historic" label="Back to now" icon="i-lucide-rotate-ccw" variant="ghost" @click="latest" />
      </div>
    </div>

    <LoadingState v-if="loading" label="Asking the config contract for open proposals…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not read proposals" @retry="load(historic ? at : undefined)" />

    <template v-else-if="vset">
      <p class="text-xs text-dimmed">
        {{ historic ? 'Historic view at' : 'State at' }} masterchain block <span class="font-mono">{{ at.toLocaleString('en-US') }}</span>{{ historic && atTime ? ` (${fmtDate(atTime)})` : '' }} on {{ network }} · {{ vset.total }} validators in the set.
      </p>

      <div v-if="!views.length" class="rounded-lg border border-dashed border-default p-6 text-center" data-testid="empty">
        <UIcon name="i-lucide-check-circle-2" class="size-6 text-success" />
        <p class="mt-2 font-medium text-highlighted">
          No open config proposals {{ historic ? 'at that block' : 'right now' }}
        </p>
        <p class="mt-1 text-sm text-muted">
          The network config is not being voted on. Proposals usually appear before protocol upgrades or fee changes.
        </p>
        <UButton v-if="network === 'mainnet' && at !== EXAMPLE_SEQNO" class="mt-3" label="See a real past vote (protocol v16)" icon="i-lucide-history" variant="soft" @click="example" />
      </div>

      <article v-for="v in views" :key="v.p.hash" class="space-y-4 rounded-lg border border-default p-4" :data-testid="`proposal-${v.p.paramId}`">
        <header class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-medium text-highlighted">
              <span class="mr-1 font-mono text-sm text-muted">#{{ v.p.paramId }}</span>{{ (v.proposed ?? v.current)?.name ?? `Param ${v.p.paramId}` }}
            </h3>
            <p class="text-xs text-muted">
              {{ proposalStatus(v.p, v.rules, now) }} · expires {{ fmtDate(v.p.expiresAt) }}
            </p>
          </div>
          <div class="flex flex-wrap gap-1">
            <UBadge :label="v.p.critical ? 'Critical' : 'Normal'" :color="v.p.critical ? 'error' : 'neutral'" variant="subtle" />
            <UBadge v-if="v.proposed && v.current && v.proposed.hash === v.current.hash" label="Same as current value" color="success" variant="subtle" />
          </div>
        </header>

        <div class="space-y-1">
          <div class="flex justify-between gap-2 text-xs">
            <span class="text-muted">Votes this round</span>
            <span class="text-right font-mono text-highlighted">
              {{ v.r.sameRound ? (v.r.wonRound ? 'round won' : `${v.r.percent.toFixed(2)}% of the ¾ needed`) : 'new round, no votes yet' }}
            </span>
          </div>
          <UProgress :model-value="v.r.wonRound ? 100 : v.r.percent" :color="v.r.wonRound ? 'success' : 'primary'" size="sm" />
          <p class="text-xs text-dimmed">
            {{ v.r.sameRound ? v.p.voters.length : 0 }} {{ v.r.sameRound && v.p.voters.length === 1 ? 'validator has' : 'validators have' }} voted · wins {{ v.p.wins }}/{{ v.rules.minWins }} · losses {{ v.p.losses }}/{{ v.rules.maxLoses }} · {{ v.p.roundsRemaining }} rounds left
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="text-xs font-medium text-muted">
              Proposed value
            </div>
            <p v-if="!v.proposed" class="mt-1 text-sm text-warning">
              Removes this param from the config.
            </p>
            <ParamFields v-else-if="v.proposed.fields.length" :fields="v.proposed.fields" />
            <p v-else class="mt-1 max-h-24 overflow-auto font-mono text-xs break-all">
              {{ v.proposed.boc }}
            </p>
          </div>
          <div>
            <div class="text-xs font-medium text-muted">
              {{ historic ? 'Value at that block' : 'Current value' }}
            </div>
            <p v-if="!v.current" class="mt-1 text-sm text-muted">
              Not set yet.
            </p>
            <ParamFields v-else-if="v.current.fields.length" :fields="v.current.fields" />
            <p v-else class="mt-1 max-h-24 overflow-auto font-mono text-xs break-all">
              {{ v.current.boc }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dimmed">
          <span class="inline-flex items-center gap-1">Proposal hash <span class="font-mono">{{ v.p.hash.slice(0, 12) }}…</span><CopyButton :value="v.p.hash" size="xs" /></span>
          <span v-if="v.proposed" class="inline-flex items-center gap-1">Value BOC<CopyButton :value="v.proposed.boc" size="xs" /></span>
          <span v-if="v.p.ifHash">Applies only if the current value hash is {{ v.p.ifHash.slice(0, 12) }}…</span>
        </div>
      </article>

      <p class="text-xs text-dimmed">
        Config contract <span class="font-mono">{{ CONFIG_ADDRESS.slice(0, 10) }}…</span>. Vote weight comes from the current validator set (config param 34); when a new round starts, the count restarts at the next vote.
        <NuxtLink to="/tools/config-params-viewer" class="text-primary underline-offset-2 hover:underline">Browse the full config</NuxtLink>.
      </p>
    </template>
  </div>
</template>
