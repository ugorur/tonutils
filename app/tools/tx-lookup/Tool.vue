<script setup lang="ts">
import type { ActionView, TaEvent } from '~/lib/tx-user/events'
import { describeAction } from '~/lib/tx-user/events'
import { parseTxInput } from '~/lib/tx-user/hash'
import ActionLine from '~/lib/tx-user/ActionLine.vue'
import type { Step, TcTracesResponse, TraceSummary } from './logic'
import { flatten, interfaceLabel, summarizeTrace } from './logic'

const EXAMPLES = [
  { label: 'Failed USD₮ transfer', value: 'b492e6f67440fc27201ae61900149107ada38869bfe3a85e0528e9686da3d2ca' },
  { label: 'USD₮ payment', value: 'https://tonviewer.com/transaction/5b7fa27952f92f2c08ce35f27f9eb3e4dc87f38a43155fe5d31592f0b0a6d788' },
  { label: 'Transfer with comment (base64)', value: 'uguZ6WGYUnXK0o5aofNWZVd0qbWne7Up4ELl8jmNLRU=' }
]

const route = useRoute()
const router = useRouter()
const { network } = useTonNetwork()
const toncenter = useToncenter()
const tonapi = useTonapi()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const inputError = computed(() => {
  if (!input.value.trim()) return ''
  try {
    parseTxInput(input.value)
    return ''
  }
  catch (e) {
    return (e as Error).message
  }
})

const loading = ref(false)
const error = ref<unknown>(null)
const notFound = ref(false)
const summary = ref<TraceSummary | null>(null)
const raw = ref<TcTracesResponse | null>(null)
const matchedBy = ref<'tx' | 'msg'>('tx')
// undefined = loading, null = unavailable
const actions = ref<ActionView[] | null | undefined>()

let run = 0

async function lookup() {
  let hash: string
  try {
    hash = parseTxInput(input.value)
  }
  catch {
    return
  }
  const id = ++run
  loading.value = true
  error.value = null
  notFound.value = false
  summary.value = null
  raw.value = null
  actions.value = undefined
  router.replace({ query: { ...route.query, q: input.value.trim() } })
  try {
    const q = { include_actions: false, limit: 1 }
    let res = await toncenter.v3<TcTracesResponse>('traces', { ...q, tx_hash: hash })
    matchedBy.value = 'tx'
    if (!res.traces.length) {
      res = await toncenter.v3<TcTracesResponse>('traces', { ...q, msg_hash: hash })
      matchedBy.value = 'msg'
    }
    if (id !== run) return
    const s = summarizeTrace(res)
    if (!s) {
      notFound.value = true
      return
    }
    raw.value = res
    summary.value = s
    loadActions(s.rootTxHex, id)
  }
  catch (e) {
    if (id === run) error.value = e
  }
  finally {
    if (id === run) loading.value = false
  }
}

// Plain-language summary from tonapi (event id = root transaction hash). Optional: the trace is shown without it.
async function loadActions(eventId: string, id: number) {
  try {
    const ev = await tonapi.get<TaEvent>(`events/${eventId}`)
    if (id === run) actions.value = ev.actions.map(a => describeAction(a))
  }
  catch {
    if (id === run) actions.value = null
  }
}

function useExample(v: string) {
  input.value = v
  lookup()
}

onMounted(() => {
  if (input.value && !inputError.value) lookup()
})
watch(network, () => {
  if (summary.value || notFound.value) lookup()
})

const steps = computed(() => (summary.value ? flatten(summary.value.root) : []))

const STATUS = {
  success: { label: 'Success', color: 'success', icon: 'i-lucide-circle-check', text: 'Every step of this transaction chain went through.' },
  partial: { label: 'Partly failed', color: 'warning', icon: 'i-lucide-triangle-alert', text: 'The wallet sent the message, but a later step failed. Funds sent to that step usually come back as a bounce (minus fees).' },
  failed: { label: 'Failed', color: 'error', icon: 'i-lucide-circle-x', text: 'The very first step failed, so nothing was sent.' },
  pending: { label: 'Pending', color: 'warning', icon: 'i-lucide-clock', text: 'Still being processed. Some steps may not be on-chain yet; look it up again in a few seconds.' }
} as const
const status = computed(() => (summary.value ? STATUS[summary.value.status] : null))

const stepIcon = (s: Step) => (s.status === 'failed' ? 'i-lucide-circle-x' : s.status === 'skipped' ? 'i-lucide-circle-minus' : 'i-lucide-circle-check')
const stepTone = (s: Step) => (s.status === 'failed' ? 'text-error' : s.status === 'skipped' ? 'text-muted' : 'text-success')
const when = (t: number) => new Date(t * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })
const utc = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label="Transaction hash, message hash or explorer link" :error="inputError || undefined" help="Hex or base64. Tonviewer, Tonscan and tonscan.com links work too.">
        <UInput v-model="input" placeholder="e.g. b492e6f6… or https://tonviewer.com/transaction/…" class="w-full font-mono" autocomplete="off" spellcheck="false" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Explain" icon="i-lucide-scan-search" :loading="loading" :disabled="!input.trim() || !!inputError" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="lookup" />
    <LoadingState v-else-if="loading" label="Reading the trace from toncenter…" />
    <UAlert
      v-else-if="notFound"
      color="neutral"
      variant="subtle"
      icon="i-lucide-search-x"
      title="No transaction found"
      :description="`Nothing on ${network} matches this hash. Check the network switch in the header, or wait a few seconds if it was just sent.`"
    />

    <template v-if="summary && status && !loading">
      <section class="space-y-4">
        <UAlert :color="status.color" variant="subtle" :icon="status.icon" :title="status.label" :description="status.text" />

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Time
            </div>
            <div class="font-medium text-highlighted">
              {{ when(summary.time) }}
            </div>
            <div class="text-xs text-muted">
              {{ utc(summary.time) }}
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Total network fees
            </div>
            <div class="font-medium text-highlighted">
              <TokenAmount :nano="summary.totalFees" />
            </div>
            <div class="text-xs text-muted">
              Paid across all {{ summary.txCount }} steps
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Steps
            </div>
            <div class="font-medium text-highlighted">
              {{ summary.txCount }} transaction{{ summary.txCount === 1 ? '' : 's' }}
            </div>
            <div class="text-xs text-muted">
              {{ summary.failures.length ? `${summary.failures.length} failed` : 'none failed' }}
            </div>
          </div>
        </div>

        <p v-if="matchedBy === 'msg'" class="text-xs text-muted">
          Matched as a message hash. The chain below is the one that message belongs to.
        </p>
      </section>

      <section class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          What happened
        </h3>
        <LoadingState v-if="actions === undefined" label="Summarizing with tonapi…" />
        <p v-else-if="actions === null || !actions.length" class="text-sm text-muted">
          No plain-language summary available right now; the step-by-step trace below is complete.
        </p>
        <ul v-else class="space-y-3">
          <li v-for="(a, i) in actions" :key="i">
            <ActionLine :view="a" :relative="false" links />
          </li>
        </ul>
      </section>

      <section v-if="summary.failures.length" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Why it failed
        </h3>
        <UAlert
          v-for="f in summary.failures"
          :key="f.hash"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          :title="`${interfaceLabel(f.interfaces) || 'Contract'} rejected “${f.opName}”`"
        >
          <template #description>
            <p>{{ f.problem }}</p>
            <p v-if="f.compute && !f.compute.ok" class="mt-1 text-xs opacity-80">
              Code meaning from: {{ f.compute.source }}
            </p>
            <p v-if="f.bounces" class="mt-1">
              The message was bounceable, so its value was sent back to the sender (minus fees).
            </p>
          </template>
        </UAlert>
      </section>

      <section class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Trace (every step)
          </h3>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Open in</span>
            <ExplorerLinks kind="tx" :value="summary.rootTxHex" />
          </div>
        </div>
        <ol class="space-y-2">
          <li
            v-for="s in steps"
            :key="s.hash"
            class="rounded-lg border p-3"
            :class="s.status === 'failed' ? 'border-error/40 bg-error/5' : 'border-default'"
            :style="{ marginLeft: `${Math.min(s.depth, 6) * 0.75}rem` }"
          >
            <div class="flex min-w-0 items-start gap-2">
              <UIcon :name="stepIcon(s)" class="mt-0.5 size-4.5 shrink-0" :class="stepTone(s)" />
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="font-medium text-highlighted">{{ s.opName }}</span>
                  <UBadge v-if="s.bouncedIn" color="warning" variant="subtle" size="sm" label="Bounce" />
                  <span v-if="s.value" class="text-sm text-muted">· <TokenAmount :nano="s.value" :max-decimals="6" /></span>
                </div>
                <div class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted">
                  <span>at</span>
                  <span v-if="s.domain" class="font-medium text-default">{{ s.domain }}</span>
                  <span v-else-if="interfaceLabel(s.interfaces)" class="text-default">{{ interfaceLabel(s.interfaces) }}</span>
                  <AddressLink :address="s.accountFriendly" />
                </div>
                <p v-if="s.comment" class="text-sm break-words text-default">
                  <UIcon name="i-lucide-message-square" class="mr-1 inline size-3.5 align-[-2px] text-muted" />{{ s.comment }}
                </p>
                <p v-if="s.problem" class="text-sm" :class="s.status === 'failed' ? 'text-error' : 'text-muted'">
                  {{ s.problem }}
                </p>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>Fee <TokenAmount :nano="s.fees" :max-decimals="6" /></span>
                  <span v-if="s.compute">Exit code {{ s.compute.code }}</span>
                  <span v-if="s.action">Action code {{ s.action.code }}</span>
                  <span class="inline-flex items-center gap-1 font-mono">{{ s.hashHex.slice(0, 8) }}…<CopyButton :value="s.hashHex" size="xs" /></span>
                </div>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <details class="rounded-lg border border-default p-3">
        <summary class="cursor-pointer text-sm font-medium text-highlighted">
          Raw trace (toncenter v3)
        </summary>
        <div class="mt-3">
          <JsonView :value="raw" />
        </div>
      </details>
    </template>
  </div>
</template>
