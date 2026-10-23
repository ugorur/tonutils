<script setup lang="ts">
import type { DroppedFile } from '~/components/FileDrop.vue'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { Cell, loadStateInit } from '@ton/core'
import DeployPanel from '~/lib/deployers/DeployPanel.vue'
import { WALLET_V4R2_DEPLOY } from '~/tools/stateinit-builder/examples'
import { deployBody, deployMessage, fileToBoc, resolveStateInit, type BodyKind, type DeployInput } from './logic'

const { isTestnet } = useTonNetwork()

const input = reactive<DeployInput>({ mode: 'code-data', code: '', data: '', stateInit: '', workchain: 0 })
const amount = ref('0.05')
const amountNano = ref<bigint | null>(null)
const bodyKind = ref<BodyKind>('none')
const bodyValue = ref('')

const wcItems = [{ label: 'Basechain (0)', value: 0 }, { label: 'Masterchain (-1)', value: -1 }]
const bodyItems = [{ label: 'No body', value: 'none' }, { label: 'Text comment', value: 'comment' }, { label: 'Body BOC', value: 'boc' }]

function onFile(k: 'code' | 'data' | 'stateInit', f: DroppedFile) {
  input[k] = fileToBoc(f.bytes, f.text)
}

const entered = computed(() => (input.mode === 'stateinit' ? !!input.stateInit.trim() : !!input.code.trim()))
const resolved = computed(() => {
  if (!entered.value) return null
  try {
    return { ok: true as const, info: resolveStateInit(input) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const info = computed(() => (resolved.value?.ok ? resolved.value.info : null))

const body = computed(() => {
  try {
    return { cell: deployBody(bodyKind.value, bodyValue.value) }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})

const address = computed(() => (info.value ? (isTestnet.value ? info.value.address.testnetBounceable : info.value.address.bounceable) : ''))
const details = computed<KeyValueItem[]>(() => {
  const i = info.value
  if (!i) return []
  const out: KeyValueItem[] = [{ label: 'Raw address', value: i.address.raw, mono: true, copy: true }]
  if (i.code) out.push({ label: i.code.library ? 'Code (library reference)' : 'Code hash', value: i.code.library ?? i.code.hash, mono: true, copy: true, hint: i.code.wallet ? `Recognised: ${i.code.wallet}` : `${i.code.bits} bits, ${i.code.refs} refs in the root cell` })
  out.push({ label: 'Data hash', value: i.data?.hash ?? 'No data', mono: !!i.data, copy: !!i.data })
  if (i.source !== 'stateinit') out.push({ label: 'Read from', value: `${i.source}${i.destination ? ` to ${i.destination}` : ''}`, mono: false })
  return out
})

const messages = computed<TonConnectMessage[]>(() => {
  if (!info.value || !amountNano.value || body.value.error) return []
  return [deployMessage(info.value, amountNano.value, body.value.cell, isTestnet.value)]
})

// Wallet v4R2 deployed on mainnet in tx cHMT2o4s… (code and data from its StateInit). It exists, so deploying it shows the warning.
function tryExample() {
  const init = loadStateInit(Cell.fromBase64(WALLET_V4R2_DEPLOY.stateInit).beginParse())
  Object.assign(input, { mode: 'code-data', code: init.code!.toBoc().toString('base64'), data: init.data!.toBoc().toString('base64'), stateInit: '', workchain: 0 })
  bodyKind.value = 'none'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <UTabs
        v-model="input.mode"
        :content="false"
        size="sm"
        :items="[{ label: 'Code + data', value: 'code-data', icon: 'i-lucide-file-code' }, { label: 'StateInit', value: 'stateinit', icon: 'i-lucide-package' }]"
      />
      <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
    </div>

    <div v-if="input.mode === 'code-data'" class="space-y-4">
      <UFormField label="Code" help="Base64 or hex BOC, or a Blueprint / func-js / tolk-js build JSON (the hex, codeBoc or codeBoc64 field is used).">
        <UTextarea v-model="input.code" class="w-full font-mono" :rows="3" autoresize :maxrows="8" placeholder="te6cc… or b5ee9c72…" />
      </UFormField>
      <FileDrop accept=".boc,.json,.txt,.cell" text label="Or drop the compiled code file" @file="f => onFile('code', f)" />
      <UFormField label="Initial data (optional)" help="The contract's initial storage cell. Different data gives a different address.">
        <UTextarea v-model="input.data" class="w-full font-mono" :rows="2" autoresize :maxrows="8" placeholder="te6cc… (leave empty for no data)" />
      </UFormField>
      <FileDrop accept=".boc,.json,.txt,.cell" text label="Or drop the data file" @file="f => onFile('data', f)" />
    </div>
    <div v-else class="space-y-4">
      <UFormField label="StateInit or deploy message" help="A StateInit BOC, or a whole message that carries one (the destination's workchain is then used).">
        <UTextarea v-model="input.stateInit" class="w-full font-mono" :rows="4" autoresize :maxrows="10" placeholder="te6cc…" />
      </UFormField>
      <FileDrop accept=".boc,.json,.txt" text label="Or drop a .boc file" @file="f => onFile('stateInit', f)" />
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Workchain" help="Basechain unless the contract must live in the masterchain (much higher fees).">
        <USelect v-model="input.workchain" :items="wcItems" class="w-full" />
      </UFormField>
      <div>
        <AmountInput v-model="amount" v-model:nano="amountNano" label="Amount to send" />
        <p class="mt-1 text-xs text-muted">
          Becomes the contract's balance (minus fees). 0.05 {{ COIN_SYMBOL }} is enough for most simple contracts.
        </p>
      </div>
    </div>

    <div class="space-y-3">
      <UFormField label="First message body" help="Some contracts expect an init message (e.g. an op code). Most need none.">
        <USelect v-model="bodyKind" :items="bodyItems" class="w-full sm:w-56" />
      </UFormField>
      <UInput v-if="bodyKind === 'comment'" v-model="bodyValue" class="w-full" placeholder="Comment text" />
      <UTextarea v-else-if="bodyKind === 'boc'" v-model="bodyValue" class="w-full font-mono" :rows="2" autoresize placeholder="Body cell BOC (te6cc…)" />
      <p v-if="body.error" class="text-xs text-error">
        {{ body.error }}
      </p>
    </div>

    <UAlert v-if="resolved && !resolved.ok" color="error" variant="subtle" icon="i-lucide-circle-x" title="Cannot build the StateInit" :description="resolved.error" />

    <div v-if="info" class="rounded-lg border border-default px-4 py-1">
      <ResultField label="Contract address" :value="address" hint="Computed from the code and data: anyone deploying the same StateInit gets this address." />
      <KeyValue :items="details" />
      <div class="pb-2 text-xs text-muted">
        <ExplorerLinks kind="address" :value="address" />
      </div>
    </div>

    <WalletGate purpose="deploy the contract">
      <template #default>
        <DeployPanel
          v-if="messages.length && info"
          :messages="messages"
          :target="info.address.raw"
          existing="warn"
          label="Deploy contract"
          existing-text="A contract is already active at this address, so its StateInit will be ignored. Sending anyway just delivers the amount (and body) to the existing contract."
          :confirm="`I checked the code, data and amount. A deployed contract cannot be undone, and only its own code decides whether the ${COIN_SYMBOL} can ever come back.`"
        >
          <template #done>
            <ResultField label="Contract" :value="address">
              <AddressLink :address="address" full />
            </ResultField>
          </template>
        </DeployPanel>
        <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-file-code" title="Add the contract above" description="The exact deploy transaction appears here once the code (or StateInit) and amount are valid." />
      </template>
    </WalletGate>
  </div>
</template>
