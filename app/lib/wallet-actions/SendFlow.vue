<script setup lang="ts">
import type { SendResult, TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import { chunk, maxMessages } from './core'

// Preview + send block for the wallet-action tools. The preview (exact messages) is always visible;
// sending needs a connected wallet (WalletGate). More messages than the wallet accepts per request are
// split into batches, signed one after another (each waits for the previous to land, so seqnos don't clash).
const props = defineProps<{
  messages: TonConnectMessage[]
  /** WalletGate purpose, e.g. "send jettons". */
  purpose: string
  /** When set, the user must tick this checkbox before sending (irreversible actions). */
  confirm?: string
  /** Why the request cannot be sent yet (shown instead of the button). */
  blocked?: string | null
  label?: string
}>()

interface BatchState { sent?: SendResult, trace?: TonTrace, error?: unknown, waiting?: boolean }

const tc = useTonConnect()
const confirmed = ref(false)
const busy = ref(false)
const states = ref<BatchState[]>([])

const limit = computed(() => maxMessages(tc.wallet.value?.device.features))
const batches = computed(() => chunk(props.messages, limit.value))
/** Index of the next batch to sign (all done when === batches.length). */
const next = computed(() => {
  const i = states.value.findIndex(s => !s.sent)
  return i === -1 ? states.value.length : i
})
/** A signed batch that has not been confirmed yet: never sign the next one (or re-sign it) until it is. */
const pending = computed(() => states.value.some(s => s.sent && !s.trace))

watch(() => [props.messages, limit.value], () => {
  confirmed.value = false
  states.value = batches.value.map(() => ({}))
}, { immediate: true })

const failedTx = (t: TonTrace) => Object.values(t.transactions).filter(x => x.description?.aborted || x.description?.compute_ph?.success === false)

async function track(st: BatchState) {
  st.waiting = true
  st.error = undefined
  states.value = [...states.value]
  try {
    st.trace = await tc.waitForTransaction(st.sent!.hash)
  }
  catch (e) {
    st.error = e
  }
  finally {
    st.waiting = false
    states.value = [...states.value]
  }
}

async function send() {
  const i = next.value
  const batch = batches.value[i]
  if (!batch || pending.value) return
  const st: BatchState = {}
  states.value[i] = st
  busy.value = true
  try {
    st.sent = await tc.sendTransaction({ messages: batch })
  }
  catch (e) {
    st.error = e
    states.value = [...states.value]
    return
  }
  finally {
    busy.value = false
  }
  await track(st)
}

const buttonLabel = computed(() => {
  const base = props.label ?? 'Send with wallet'
  return batches.value.length > 1 ? `${base} · batch ${next.value + 1} of ${batches.value.length}` : base
})
</script>

<template>
  <div class="space-y-4">
    <TxPreview v-if="messages.length" :messages="messages" />

    <WalletGate :purpose="purpose">
      <div class="space-y-3">
        <UAlert v-if="blocked" color="neutral" variant="subtle" icon="i-lucide-info" :description="blocked" />
        <template v-else-if="messages.length && next < batches.length">
          <p v-if="batches.length > 1" class="text-sm text-muted">
            Your wallet accepts up to {{ limit }} messages per request, so this takes {{ batches.length }} approvals. Each batch is sent after the previous one is confirmed.
          </p>
          <UCheckbox v-if="confirm" v-model="confirmed" :label="confirm" color="error" data-testid="confirm-irreversible" />
          <UButton
            :label="buttonLabel"
            icon="i-lucide-send"
            size="lg"
            :loading="busy"
            :disabled="(!!confirm && !confirmed) || busy || pending"
            data-testid="send-button"
            @click="send"
          />
        </template>

        <template v-for="(s, i) in states" :key="i">
          <div v-if="s.sent || s.error" class="space-y-2 rounded-lg border border-default p-4 text-sm">
            <p v-if="batches.length > 1" class="font-medium text-highlighted">
              Batch {{ i + 1 }}
            </p>
            <ErrorNotice v-if="s.error" :error="s.error" />
            <template v-if="s.sent">
              <ResultField label="External message hash (normalized)" :value="s.sent.hash" />
              <LoadingState v-if="s.waiting" label="Signed. Waiting for the transaction to land on chain (up to 2 minutes)…" />
              <UButton v-else-if="!s.trace" label="Check again" icon="i-lucide-refresh-cw" size="sm" variant="outline" @click="track(s)" />
              <template v-if="s.trace">
                <UAlert
                  v-if="failedTx(s.trace).length"
                  color="warning"
                  variant="subtle"
                  icon="i-lucide-triangle-alert"
                  title="Landed, but part of it failed"
                  :description="`${failedTx(s.trace).length} of ${s.trace.transactions_order.length} transactions failed (exit code ${failedTx(s.trace)[0]?.description?.compute_ph?.exit_code ?? '?'}). Bounced ${COIN_SYMBOL} returns to you minus fees. Open it in an explorer for details.`"
                />
                <UAlert v-else color="success" variant="subtle" icon="i-lucide-circle-check" :title="`Confirmed: ${s.trace.transactions_order.length} transactions, all successful`" />
                <ExplorerLinks kind="tx" :value="s.trace.external_hash" />
              </template>
              <ExplorerLinks v-else kind="tx" :value="s.sent.hash" />
            </template>
          </div>
        </template>
      </div>
    </WalletGate>
  </div>
</template>
