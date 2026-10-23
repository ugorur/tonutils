<script setup lang="ts">
import { describeExitCode } from '~/lib/tx-dev/exitCodes'
import { parseTxInput } from '~/lib/tx-dev/lookup'
import TxDetails from '~/lib/tx-dev/TxDetails.vue'
import { loadSandbox } from '~/utils/lazy'
import { detectWalletVersion } from '~/utils/ton/wallets'
import { fetchRetraceInputs, parseVmLog, retrace, type Fetched, type RetraceResult, type Step } from './logic'

// Real mainnet transactions (toncenter v3), each re-traced bit-exactly in our tests.
const EXAMPLES = [
  { label: 'Wallet v4 sends USD₮', value: '260d3e319c18c6cafbe4aee338472f73dd34b810dc61004ee6b1b8a1643caa44' },
  { label: 'USD₮ jetton wallet (library code)', value: 'cae44c020f66482cf1943975689f2a8a34589914c026eebfeb9aa43a6bbe903c' },
  { label: '2nd tx in a block', value: '30d1a9196a2045dc5f894da8137bd55cc0ecb6250d2b81618d7663dc7e3dcfc3' },
  { label: 'Failed + bounced', value: '4666628786f6521727b5d05a4dcc4410fc65c3ec977150056f4de2c5d41b33e1' }
]
const PAGE = 200

const input = ref('')
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
const inputs = ref<Fetched | null>(null)
const result = ref<RetraceResult | null>(null)
const steps = ref<Step[]>([])
const view = ref<'steps' | 'tx' | 'log'>('steps')
const filter = ref('')
const shown = ref(PAGE)
const selected = ref<number | null>(null)

const route = useRoute()
const { network } = useTonNetwork()
const tc = useToncenter()

async function run() {
  error.value = null
  result.value = null
  inputs.value = null
  steps.value = []
  selected.value = null
  shown.value = PAGE
  filter.value = ''
  view.value = 'steps'
  loading.value = true
  try {
    const parsed = parseTxInput(input.value)
    if (parsed.kind !== 'hash') throw new Error('Paste a transaction hash or explorer link. A bare BOC does not carry the account state the replay needs.')
    const f = await fetchRetraceInputs(tc, parsed.b64, network.value, (s) => {
      stage.value = `${s}…`
    })
    inputs.value = f
    stage.value = 'Loading the TVM emulator (about 7 MB, once)…'
    const sandbox = await loadSandbox()
    const r = await retrace({ ...f, onStep: (i, n) => {
      stage.value = n > 1 ? `Running transaction ${i + 1} of ${n} in the local TVM…` : 'Running the transaction in the local TVM…'
    } }, sandbox.runTransaction)
    result.value = r
    const c = r.tx.compute
    steps.value = c && !c.skipped ? parseVmLog(r.vmLog, Number(c.gasLimit + (c.gasCredit ?? 0n))) : []
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function example(v: string) {
  input.value = v
  run()
}

onMounted(() => {
  const q = route.query.q
  if (typeof q === 'string' && q) example(q)
})

const walletVersion = computed(() => {
  const h = inputs.value?.indexed.account_state_before?.code_hash
  return h ? detectWalletVersion(h)?.version ?? null : null
})

const filtered = computed(() => {
  const q = filter.value.trim().toUpperCase()
  return q ? steps.value.filter(s => s.instr.toUpperCase().includes(q) || s.notes.some(n => n.toUpperCase().includes(q))) : steps.value
})
const current = computed(() => (selected.value === null ? null : steps.value[selected.value - 1] ?? null))
const exitText = computed(() => {
  const c = result.value?.tx.compute
  if (!c) return ''
  return c.skipped ? `Compute phase skipped (${c.reason.replace(/_/g, ' ')})` : `Exit code ${c.exitCode}: ${describeExitCode(c.exitCode, walletVersion.value)}`
})

// Precompiled contracts (e.g. USD₮ wallets) are charged a flat gas amount and report 0 VM steps on chain.
const gasHint = computed(() => {
  const c = result.value?.tx.compute
  if (!c || c.skipped) return undefined
  if (c.vmSteps === 0 && steps.value.length) return `Precompiled contract: the chain charged a flat ${c.gasUsed.toLocaleString()} gas and reports 0 VM steps. The steps below are the equivalent TVM run, so their gas does not add up to the charge.`
  return `Gas used ${c.gasUsed.toLocaleString()}`
})

function downloadLog() {
  if (result.value) downloadText(result.value.vmLog, `vm-log-${result.value.originalHash.slice(0, 12)}.txt`, 'text/plain')
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Transaction hash or explorer link" hint="A message hash works too">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="input"
            placeholder="260d3e31… or https://tonviewer.com/transaction/…"
            size="lg"
            class="w-full"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" label="Re-trace" icon="i-lucide-footprints" size="lg" :loading="loading" :disabled="!input.trim()" class="justify-center" />
        </div>
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
      <p class="text-xs text-dimmed">
        Reads the account state, earlier transactions of the same block, the config and any library cells from toncenter ({{ network }}), then re-executes everything in a TVM running in your browser.
      </p>
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not re-trace" @retry="run" />

    <template v-if="result && inputs && !loading">
      <UAlert
        :color="result.match ? 'success' : 'warning'"
        variant="subtle"
        :icon="result.match ? 'i-lucide-badge-check' : 'i-lucide-triangle-alert'"
        :title="result.match ? 'Reproduced bit for bit' : 'The replay differs from the chain'"
        :description="result.match
          ? `The local run produced the exact on-chain transaction (same hash), so the steps below are what really happened.${result.replayed ? ` ${result.replayed > 1 ? `${result.replayed} earlier transactions` : 'An earlier transaction'} of this account in the same block ${result.replayed > 1 ? 'were' : 'was'} replayed first.` : ''}`
          : `Hash ${result.emulatedHash.slice(0, 16)}… instead of ${result.originalHash.slice(0, 16)}…. Usual causes: the contract uses RANDOM (the block random seed is not reproduced), PREVMCBLOCKS, or an earlier replayed transaction diverged (${result.replayMismatches}). The steps are still a close approximation.`"
      />

      <div class="grid gap-x-6 sm:grid-cols-2">
        <ResultField label="Result" :value="exitText" :mono="false" :copy="false" />
        <ResultField label="Account" :value="result.tx.account" :copy="false">
          <AddressLink :address="result.tx.account" />
        </ResultField>
        <ResultField label="Instructions executed" :value="String(steps.length)" :copy="false" :hint="gasHint" />
        <ResultField label="Block" :value="String(inputs.mcSeqno)" :copy="false" :hint="`State taken at masterchain block ${inputs.mcSeqno - 1}${inputs.libraryCount ? ` · ${inputs.libraryCount} library cell(s) loaded` : ''}`" />
      </div>

      <UTabs
        v-model="view"
        :items="[{ label: 'Steps', value: 'steps', icon: 'i-lucide-list-tree' }, { label: 'Tx', value: 'tx', icon: 'i-lucide-file-search' }, { label: 'Logs', value: 'log', icon: 'i-lucide-file-code' }]"
        :content="false"
        class="w-full"
      />

      <div v-if="view === 'steps'" class="space-y-3">
        <p v-if="!steps.length" class="text-sm text-muted">
          The VM did not run for this transaction (compute phase skipped), so there are no instructions to show.
        </p>
        <template v-else>
          <UInput v-model="filter" icon="i-lucide-search" placeholder="Filter by instruction, e.g. THROW, SENDRAWMSG, ACCEPT" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          <div class="overflow-hidden rounded-lg border border-default">
            <div class="hidden grid-cols-[3.5rem_1fr_4rem_5rem] gap-2 border-b border-default bg-elevated/50 px-3 py-1.5 text-xs text-muted sm:grid">
              <span>#</span><span>Instruction</span><span class="text-right">Gas</span><span class="text-right">Total</span>
            </div>
            <ul class="max-h-[32rem] divide-y divide-default overflow-y-auto">
              <li v-for="s in filtered.slice(0, shown)" :key="s.n">
                <button
                  type="button"
                  class="grid w-full grid-cols-[3rem_1fr_auto] items-baseline gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-elevated/50 sm:grid-cols-[3.5rem_1fr_4rem_5rem]"
                  :class="selected === s.n && 'bg-primary/10'"
                  :aria-expanded="selected === s.n"
                  @click="selected = selected === s.n ? null : s.n"
                >
                  <span class="text-dimmed">{{ s.n }}</span>
                  <span class="min-w-0 break-all text-highlighted">{{ s.instr }}
                    <span v-for="n in s.notes" :key="n" class="block text-[11px] break-words" :class="/exception|terminating/i.test(n) ? 'text-error' : 'text-warning'">{{ n }}</span>
                  </span>
                  <span class="text-right text-muted">{{ s.cost }}</span>
                  <span class="hidden text-right text-muted sm:block">{{ s.gasUsed }}</span>
                </button>
                <div v-if="selected === s.n && current" class="space-y-2 border-t border-default bg-elevated/30 px-3 py-2 text-xs">
                  <div class="text-muted">
                    Code cell <span class="font-mono text-highlighted">{{ current.cell.slice(0, 12) }}…</span> at bit {{ current.offset }} · gas used so far {{ current.gasUsed }}
                  </div>
                  <div class="text-muted">
                    Stack before this instruction ({{ current.stack.length }} item{{ current.stack.length === 1 ? '' : 's' }}, top first):
                  </div>
                  <ol class="space-y-1">
                    <li v-for="(el, i) in [...current.stack].reverse()" :key="i" class="flex gap-2">
                      <span class="w-10 shrink-0 text-dimmed">s{{ i }}</span>
                      <span class="min-w-0 font-mono break-all text-highlighted">{{ el.length > 300 ? `${el.slice(0, 300)}…` : el }}</span>
                    </li>
                    <li v-if="!current.stack.length" class="text-dimmed">
                      (empty)
                    </li>
                  </ol>
                </div>
              </li>
            </ul>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{{ Math.min(shown, filtered.length) }} of {{ filtered.length }} steps · tap a step to see its stack</span>
            <UButton v-if="filtered.length > shown" label="Show more" size="xs" color="neutral" variant="outline" @click="shown += PAGE * 5" />
          </div>
        </template>
      </div>

      <TxDetails v-else-if="view === 'tx'" :tx="result.tx" :wallet-version="walletVersion" :emulated="!result.match" />

      <div v-else class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <UButton label="Download VM log" icon="i-lucide-download" size="sm" color="neutral" variant="outline" @click="downloadLog" />
          <CopyButton :value="result.vmLog" label="Copy VM log" />
        </div>
        <UTextarea :model-value="result.vmLog.slice(0, 200_000)" readonly :rows="12" class="w-full" :ui="{ base: 'font-mono text-[11px] whitespace-pre' }" aria-label="VM log" />
        <UTextarea :model-value="result.logs" readonly :rows="8" class="w-full" :ui="{ base: 'font-mono text-[11px] whitespace-pre' }" aria-label="Emulator log" />
      </div>

      <p class="text-xs text-dimmed">
        Want the steps next to Tact, Tolk or FunC source? Paste the same hash into the TON team's
        <ULink to="https://txtracer.ton.org/" target="_blank" class="text-primary">TxTracer</ULink>, which maps steps to source for verified contracts.
      </p>
    </template>
  </div>
</template>
