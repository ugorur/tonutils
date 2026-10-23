<script setup lang="ts">
import type { SendResult, TonConnectMessage, TonTrace } from '~/composables/useTonConnect'

// Preview + "send with wallet" block shared by the payload-builder tools.
// The preview is always shown (it is the exact request); sending needs a connected wallet (WalletGate).
const props = defineProps<{
  messages: TonConnectMessage[] | null
  /** WalletGate purpose, e.g. "send jettons". */
  purpose: string
  /** When set, the user must tick this checkbox before sending (irreversible actions). */
  confirm?: string
  /** Reason the request cannot be sent yet (shown instead of the button). */
  blocked?: string | null
  label?: string
  /** Custom sender (e.g. extra currencies); defaults to useTonConnect().sendTransaction. */
  sender?: (messages: TonConnectMessage[]) => Promise<SendResult>
}>()

const tc = useTonConnect()
const confirmed = ref(false)
const sending = ref(false)
const waiting = ref(false)
const error = ref<unknown>(null)
const sent = ref<SendResult | null>(null)
const trace = ref<TonTrace | null>(null)

watch(() => props.messages, () => {
  confirmed.value = false
})

const failed = computed(() => {
  const t = trace.value
  if (!t) return []
  return Object.values(t.transactions).filter(x => x.description?.aborted || x.description?.compute_ph?.success === false)
})

async function send() {
  if (!props.messages?.length) return
  error.value = null
  sent.value = null
  trace.value = null
  sending.value = true
  try {
    sent.value = await (props.sender ?? (m => tc.sendTransaction({ messages: m })))(props.messages)
    sending.value = false
    waiting.value = true
    trace.value = await tc.waitForTransaction(sent.value.hash)
  }
  catch (e) {
    error.value = e
  }
  finally {
    sending.value = false
    waiting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <TxPreview v-if="messages?.length" :messages="messages" />
    <slot name="after-preview" />

    <WalletGate :purpose="purpose">
      <div class="space-y-3">
        <UAlert v-if="blocked" color="neutral" variant="subtle" icon="i-lucide-info" :description="blocked" />
        <template v-else-if="messages?.length">
          <UCheckbox v-if="confirm" v-model="confirmed" :label="confirm" color="error" data-testid="confirm-irreversible" />
          <UButton
            :label="label ?? 'Send with wallet'"
            icon="i-lucide-send"
            size="lg"
            :loading="sending"
            :disabled="(!!confirm && !confirmed) || waiting"
            @click="send"
          />
        </template>
        <ErrorNotice v-if="error" :error="error" />
        <LoadingState v-if="waiting" label="Signed. Waiting for the transaction to land on chain (up to 2 minutes)…" />
        <div v-if="sent" class="space-y-2 rounded-lg border border-default p-4 text-sm">
          <ResultField label="External message hash (normalized)" :value="sent.hash" />
          <template v-if="trace">
            <UAlert
              v-if="failed.length"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Landed, but part of the chain failed"
              :description="`${failed.length} of ${trace.transactions_order.length} transactions aborted or failed in the compute phase (exit code ${failed[0]?.description?.compute_ph?.exit_code ?? '?'}). Open it in an explorer for details.`"
            />
            <UAlert v-else color="success" variant="subtle" icon="i-lucide-circle-check" :title="`Confirmed: ${trace.transactions_order.length} transactions, all successful`" />
            <ExplorerLinks kind="tx" :value="trace.external_hash" />
          </template>
          <ExplorerLinks v-else kind="tx" :value="sent.hash" />
        </div>
      </div>
    </WalletGate>
  </div>
</template>
