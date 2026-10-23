<script setup lang="ts">
// Shared send step of the deployer tools: exact messages, confirmation, existing-contract check, sign, wait, result.
// Render it inside <WalletGate>. Client-only (TxPreview imports @ton/core).
import type { TonConnectMessage } from '~/composables/useTonConnect'

const props = withDefaults(defineProps<{
  messages: TonConnectMessage[]
  /** Raw 0:… / -1:… address of the contract being deployed. */
  target: string
  confirm: string
  label: string
  /** What to do when the target is already active: 'block' (same config = same contract) or 'warn' (allow sending anyway). */
  existing?: 'block' | 'warn'
  existingText?: string
}>(), { existing: 'block', existingText: 'A contract with exactly these settings is already deployed at this address.' })

interface DeployResult { hash: string, active: boolean }
const emit = defineEmits<{ done: [r: DeployResult] }>()

const tc = useTonConnect()
const toncenter = useToncenter()
const { network } = useTonNetwork()

type Phase = 'idle' | 'checking' | 'signing' | 'waiting' | 'done'
const phase = ref<Phase>('idle')
const confirmed = ref(false)
const error = ref<unknown>(null)
const alreadyActive = ref(false)
const override = ref(false)
const result = ref<DeployResult | null>(null)

async function status(): Promise<string> {
  const r = await toncenter.v3<{ accounts: { status: string }[] }>('accountStates', { address: props.target, include_boc: false })
  return r.accounts[0]?.status ?? 'nonexist'
}

async function send() {
  if (!confirmed.value || !props.messages.length) return
  error.value = null
  try {
    if (!override.value) {
      phase.value = 'checking'
      const st = await status()
      if (st === 'frozen') throw new Error('The account at this address is frozen (it ran out of storage fees). This StateInit revives it only if the contract never changed its state, and the amount must also cover the storage debt. Use the Unfreeze account tool, which checks both.')
      alreadyActive.value = st === 'active'
      if (alreadyActive.value) {
        phase.value = 'idle'
        return
      }
    }
    phase.value = 'signing'
    const sent = await tc.sendTransaction({ messages: props.messages })
    phase.value = 'waiting'
    const trace = await tc.waitForTransaction(sent.hash)
    result.value = { hash: trace.external_hash, active: await status() === 'active' }
    phase.value = 'done'
    emit('done', result.value)
  }
  catch (e) {
    error.value = e
    phase.value = 'idle'
  }
}

function sendAnyway() {
  override.value = true
  alreadyActive.value = false
  void send()
}

function reset() {
  phase.value = 'idle'
  confirmed.value = false
  alreadyActive.value = false
  override.value = false
  result.value = null
  error.value = null
}

// Changed messages are a new deploy: the user must confirm (and the address be checked) again.
watch(() => [props.target, props.messages], () => {
  if (phase.value !== 'idle') return
  confirmed.value = false
  alreadyActive.value = false
  override.value = false
})
watch(network, reset)
defineExpose({ reset })
</script>

<template>
  <div class="space-y-4">
    <template v-if="phase !== 'done'">
      <TxPreview :messages="messages" />
      <slot name="note" />
      <UCheckbox v-model="confirmed" :label="confirm" />

      <UAlert
        v-if="alreadyActive"
        :color="existing === 'block' ? 'warning' : 'info'"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Already deployed"
        :description="existingText"
        :actions="existing === 'warn' ? [{ label: 'Send anyway', color: 'warning', variant: 'outline', onClick: sendAnyway }] : undefined"
      />
      <ErrorNotice :error="error" title="Deploy failed" @retry="send" />

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          :label="phase === 'checking' ? 'Checking the address…' : phase === 'signing' ? 'Confirm in your wallet…' : phase === 'waiting' ? 'Waiting for the network…' : label"
          icon="i-lucide-rocket"
          :loading="phase !== 'idle'"
          :disabled="!confirmed || !messages.length"
          @click="send"
        />
        <span v-if="phase === 'waiting'" class="text-xs text-muted">Usually 5 to 15 seconds.</span>
      </div>
    </template>

    <div v-else-if="result" class="space-y-4">
      <UAlert
        :color="result.active ? 'success' : 'warning'"
        variant="subtle"
        :icon="result.active ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
        :title="result.active ? 'Deployed' : 'Transaction sent, but the contract is not active yet'"
        :description="result.active ? undefined : `Check the transaction in an explorer. If the deploy failed, a bounceable message returns the ${COIN_SYMBOL} to your wallet (minus fees).`"
      />
      <slot name="done" :result="result" />
      <div class="text-xs text-muted">
        Transaction: <ExplorerLinks kind="tx" :value="result.hash" />
      </div>
      <UButton label="Deploy another" icon="i-lucide-plus" variant="outline" color="neutral" @click="reset" />
    </div>
  </div>
</template>
