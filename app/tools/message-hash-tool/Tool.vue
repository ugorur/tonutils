<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { EXT_MSG1_BOC, INT_MSG2_BOC } from '~/lib/boc-basics/vectors'
import { txHashHex } from '~/utils/ton/explorers'
import { analyzeMessage, lookupHash } from './logic'

const EXAMPLES = [
  { label: 'External message (wallet transfer)', value: EXT_MSG1_BOC },
  { label: 'Internal message', value: INT_MSG2_BOC }
]

interface V3Tx {
  account: string
  hash: string
  lt: string
  now: number
  description?: { aborted?: boolean, compute_ph?: { success?: boolean, exit_code?: number }, action?: { success?: boolean, result_code?: number } }
}

const input = ref('')
const { network } = useTonNetwork()
const toncenter = useToncenter(network)

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: analyzeMessage(input.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const report = computed(() => (result.value?.ok ? result.value.data : null))
const msg = computed(() => (report.value && report.value.kind !== 'not-a-message' ? report.value : null))

const KIND_LABEL = { 'external-in': 'External in (signed by a wallet, sent with sendBoc)', 'internal': 'Internal (contract to contract)', 'external-out': 'External out (log / event emitted by a contract)' }

const hashes = computed<KeyValueItem[]>(() => {
  const m = msg.value
  if (!m) return []
  const items: KeyValueItem[] = []
  if (m.normalizedHash) items.push({ label: 'Normalized hash (TEP-467)', value: m.normalizedHash, hint: 'Use this to find the transaction. It ignores the parts a relayer can change, so it stays the same whoever broadcasts the message. toncenter calls it hash_norm.' })
  items.push(
    { label: 'Message hash', value: m.hash, hint: 'Hash of the whole message cell, as explorers show it for the inbound message.' },
    { label: 'Body hash', value: m.bodyHash, hint: m.bodyInline ? 'The body is stored inline in the message cell; this hashes it as its own cell.' : 'The body is stored as a separate ref cell.' }
  )
  return items
})

const details = computed<KeyValueItem[]>(() => {
  const m = msg.value
  if (!m) return []
  return [
    { label: 'Type', value: KIND_LABEL[m.kind], mono: false, copy: false },
    ...(m.src ? [{ label: 'From', value: m.src }] : []),
    ...(m.dest ? [{ label: 'To', value: m.dest }] : []),
    ...(m.value !== null ? [{ label: 'Value', value: formatCoin(m.value), copy: false, mono: false }] : []),
    ...(m.bounce !== null ? [{ label: 'Bounce', value: m.bounce ? 'yes' : 'no', copy: false }] : []),
    { label: 'Body', value: `${m.bodyOp.title}${m.bodyOp.opHex ? ` (${m.bodyOp.opHex})` : ''}`, copy: false, mono: false },
    { label: 'State init attached', value: m.hasInit ? 'yes (deploys the contract)' : 'no', copy: false, mono: false }
  ]
})

const loading = ref(false)
const lookupError = ref<unknown>(null)
const found = ref<V3Tx[] | null>(null)
watch([report, network], () => {
  found.value = null
  lookupError.value = null
})

async function lookup() {
  if (!msg.value) return
  loading.value = true
  lookupError.value = null
  found.value = null
  try {
    const res = await toncenter.v3<{ transactions: V3Tx[] }>('transactionsByMessage', { msg_hash: lookupHash(msg.value), direction: msg.value.kind === 'external-out' ? 'out' : 'in' })
    found.value = res.transactions ?? []
  }
  catch (e) {
    lookupError.value = e
  }
  finally {
    loading.value = false
  }
}

function status(t: V3Tx) {
  const d = t.description
  if (!d) return { label: 'unknown', color: 'neutral' as const }
  if (d.compute_ph?.success === false) return { label: `failed (exit code ${d.compute_ph.exit_code ?? '?'})`, color: 'error' as const }
  if (d.action && d.action.success === false) return { label: `action phase failed (result code ${d.action.result_code})`, color: 'warning' as const }
  if (d.aborted) return { label: 'aborted', color: 'error' as const }
  return { label: 'success', color: 'success' as const }
}
</script>

<template>
  <div class="space-y-6">
    <BocInput v-model="input" label="Message BOC" hint="e.g. the boc TonConnect's sendTransaction returned" :examples="EXAMPLES" />

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <UAlert
      v-if="report?.kind === 'not-a-message'"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="This is not a full message"
      :description="`It parses as a cell but not as a TON message, so it is probably a message body (${report.bodyOp.title}${report.bodyOp.opHex ? `, op ${report.bodyOp.opHex}` : ''}). Its cell hash is ${report.hash}. Paste the whole external message to get the hashes used to find a transaction.`"
    />

    <template v-if="msg">
      <KeyValue :items="hashes" />

      <div class="space-y-3 rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-display text-sm font-semibold text-highlighted">
              Find the transaction
            </h3>
            <p class="text-xs text-muted">
              Searches toncenter on {{ network }} by the {{ msg.kind === 'external-in' ? 'normalized' : 'message' }} hash.
            </p>
          </div>
          <UButton :loading="loading" label="Look up" icon="i-lucide-search" size="sm" @click="lookup" />
        </div>
        <ErrorNotice v-if="lookupError" :error="lookupError" @retry="lookup" />
        <p v-else-if="found && !found.length" class="text-sm text-muted">
          No transaction found on {{ network }}. It may still be pending (try again in a few seconds), it may have expired
          without being accepted, or it was sent on the other network (switch it in the header).
        </p>
        <ul v-else-if="found" class="divide-y divide-default">
          <li v-for="t in found" :key="t.hash" class="space-y-1 py-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="status(t).label" :color="status(t).color" variant="subtle" />
              <span class="text-xs text-muted">{{ new Date(t.now * 1000).toLocaleString() }} · lt {{ t.lt }}</span>
            </div>
            <ResultField label="Transaction hash" :value="txHashHex(t.hash)" />
            <ExplorerLinks kind="tx" :value="t.hash" :network="network" />
            <div class="text-xs text-muted">
              Account: <AddressLink :address="t.account" />
            </div>
          </li>
        </ul>
      </div>

      <KeyValue :items="details" />
    </template>
  </div>
</template>
