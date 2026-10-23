<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import type { BodyKind, MessageSpec } from './logic'
import DecodedTree from '~/lib/payloads/DecodedTree.vue'
import { decodePayload } from '~/lib/payloads/decode'
import { SEND_MODE_FLAGS } from '~/lib/payloads/sendmode'
import { buildBody, buildOutputs, buildStateInit, initAddressCheck, tonConnectMessage, tonConnectRequest, transferLink } from './logic'

const { network, isTestnet } = useTonNetwork()
const tc = useTonConnect()

// ---- form
const dest = ref('')
const destAddr = shallowRef<Address | null>(null)
const amountText = ref('')
const nano = ref<bigint | null>(null)
const bounce = ref(true)
const bodyKind = ref<BodyKind>('comment')
const commentText = ref('')
const bodyBoc = ref('')
const initKind = ref<'none' | 'stateinit' | 'codedata'>('none')
const stateInitBoc = ref('')
const codeBoc = ref('')
const dataBoc = ref('')
const modeFlags = ref<string[]>(['1', '2'])

// Bounce follows the address the user typed (EQ… bounceable, UQ… not); raw 0:… keeps the toggle.
watch(dest, (v) => {
  const s = v.trim()
  if (/^[EUk0][Qf]/.test(s) && s.length === 48) bounce.value = s[0] === 'E' || s[0] === 'k'
})

const BODY_ITEMS = [
  { label: 'No body', value: 'none' },
  { label: 'Text comment', value: 'comment' },
  { label: 'Custom BOC', value: 'boc' }
]
const INIT_ITEMS = [
  { label: 'None', value: 'none' },
  { label: 'StateInit BOC', value: 'stateinit' },
  { label: 'Code + data', value: 'codedata' }
]

// A tiny self-transfer when a wallet is connected; otherwise the TON Foundation account (as labelled by tonapi).
function example() {
  dest.value = tc.wallet.value?.friendly ?? '0:059a3528654a8a14404660510c6effa6eb5b054ad8007d447c27a8490f0514d3'
  bounce.value = false
  amountText.value = '0.01'
  bodyKind.value = 'comment'
  commentText.value = 'Hello from TonUtils'
  initKind.value = 'none'
}

const built = computed(() => {
  if (!destAddr.value || nano.value === null) return null
  try {
    const spec: MessageSpec = {
      to: destAddr.value,
      bounce: bounce.value,
      value: nano.value,
      body: buildBody(bodyKind.value, bodyKind.value === 'comment' ? commentText.value : bodyBoc.value),
      init: initKind.value === 'stateinit'
        ? buildStateInit({ stateInitBoc: stateInitBoc.value })
        : initKind.value === 'codedata' ? buildStateInit({ codeBoc: codeBoc.value, dataBoc: dataBoc.value }) : null
    }
    return { ok: true as const, spec, out: buildOutputs(spec, network.value), check: initAddressCheck(spec) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const spec = computed(() => (built.value?.ok ? built.value.spec : null))
const mode = computed(() => modeFlags.value.reduce((a, b) => a + Number(b), 0))
const MODE_ITEMS = SEND_MODE_FLAGS.map(f => ({ label: f.label, value: String(f.value), description: f.hint }))
const decodedBody = computed(() => (bodyKind.value === 'boc' && spec.value?.body ? decodePayload(spec.value.body, { testOnly: isTestnet.value }) : null))

// Fresh 5-minute window each time the message changes (same default sendTransaction uses).
const tcJson = computed(() => (spec.value ? JSON.stringify(tonConnectRequest(spec.value, network.value, Math.floor(Date.now() / 1000) + 300), null, 2) : ''))
const link = computed(() => (spec.value ? transferLink(spec.value, network.value, bodyKind.value === 'comment' ? commentText.value : undefined) : ''))
const messages = computed<TonConnectMessage[]>(() => (spec.value ? [tonConnectMessage(spec.value, network.value)] : []))

const warnings = computed(() => {
  const s = spec.value
  if (!s) return []
  const w: string[] = []
  if (built.value?.ok && built.value.check && !built.value.check.matches) w.push(`The StateInit deploys to ${built.value.check.computed.toString({ testOnly: isTestnet.value })}, not to the destination. The contract will not be deployed there.`)
  if (s.init && s.bounce) w.push('Deploy messages are usually sent non-bounceable: a bounceable message to an address that does not exist yet comes back before the StateInit is used.')
  if (s.value === 0n) w.push('The value is 0. Most contracts need some coins to pay for gas.')
  return w
})

// ---- send
const deployConfirmed = ref(false)
const sending = ref(false)
const sendError = ref<unknown>(null)
const trace = ref<TonTrace | null>(null)
const waiting = ref(false)
watch(spec, () => {
  deployConfirmed.value = false
})

async function send() {
  sendError.value = null
  trace.value = null
  sending.value = true
  try {
    const res = await tc.sendTransaction({ messages: messages.value })
    sending.value = false
    waiting.value = true
    trace.value = await tc.waitForTransaction(res.hash)
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = false
    waiting.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Message
        </h3>
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>

      <AddressInput v-model="dest" label="Destination" required @parsed="destAddr = $event" />
      <div class="grid gap-4 sm:grid-cols-2">
        <AmountInput v-model="amountText" v-model:nano="nano" label="Value" />
        <UFormField label="Bounce" :hint="bounce ? 'returns if the destination fails' : 'stays even if it fails'">
          <USwitch v-model="bounce" :label="bounce ? 'Bounceable' : 'Non-bounceable'" class="mt-2" />
        </UFormField>
      </div>

      <UFormField label="Body">
        <URadioGroup v-model="bodyKind" :items="BODY_ITEMS" orientation="horizontal" />
      </UFormField>
      <UFormField v-if="bodyKind === 'comment'" label="Comment" hint="shown in the recipient's wallet">
        <UInput v-model="commentText" class="w-full" placeholder="e.g. invoice 42" />
      </UFormField>
      <UFormField v-else-if="bodyKind === 'boc'" label="Body BOC" hint="base64 or hex; build one with the payload tools">
        <UTextarea v-model="bodyBoc" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cck…" spellcheck="false" />
      </UFormField>
      <div v-if="decodedBody" class="rounded-lg border border-default p-3">
        <DecodedTree :body="decodedBody" />
      </div>

      <UFormField label="StateInit (deploy a contract)">
        <URadioGroup v-model="initKind" :items="INIT_ITEMS" orientation="horizontal" />
      </UFormField>
      <UFormField v-if="initKind === 'stateinit'" label="StateInit BOC">
        <UTextarea v-model="stateInitBoc" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
      </UFormField>
      <div v-else-if="initKind === 'codedata'" class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Code BOC">
          <UTextarea v-model="codeBoc" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
        </UFormField>
        <UFormField label="Data BOC">
          <UTextarea v-model="dataBoc" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
        </UFormField>
      </div>
      <div v-if="built?.ok && built.check" class="text-sm">
        <span class="text-muted">Deploys to</span>
        <AddressLink :address="built.check.computed.toString({ testOnly: isTestnet, bounceable: false })" />
        <UButton v-if="!built.check.matches" label="Use as destination" size="xs" variant="soft" class="ml-2" @click="dest = built.check.computed.toString({ testOnly: isTestnet, bounceable: false })" />
      </div>
    </section>

    <UAlert v-if="built && !built.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />
    <UAlert v-for="w in warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-info" :description="w" />
    <p v-if="!built" class="text-sm text-muted">
      Enter a destination and a value to build the message.
    </p>

    <template v-if="built?.ok">
      <section class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Outputs
        </h3>
        <KeyValue
          :items="[
            { label: 'MessageRelaxed BOC', value: built.out.messageBoc, hint: 'The internal message as a wallet stores it in an out action (src empty, lt and fees zero).' },
            { label: 'Message hash', value: built.out.messageHash },
            ...(built.out.bodyBoc ? [{ label: 'Body BOC', value: built.out.bodyBoc, hint: 'TonConnect calls this payload.' }, { label: 'Body hash', value: built.out.bodyHash! }] : []),
            ...(built.out.stateInitBoc ? [{ label: 'StateInit BOC', value: built.out.stateInitBoc }] : [])
          ]"
        />
        <div class="space-y-2 rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Send mode for wallet out actions (W5, highload, your own contract)
          </div>
          <UCheckboxGroup v-model="modeFlags" :items="MODE_ITEMS" />
          <p class="text-sm">
            Mode <span class="font-mono font-semibold">{{ mode }}</span>.
            <span class="text-muted">TonConnect cannot set it: wallets send with mode 3. Use it in the W5 actions builder or your contract.</span>
          </p>
        </div>
        <ResultField label="ton:// link" :value="link" hint="Opens a transfer in Tonkeeper, MyTonWallet, Tonhub and other wallets. Scan the QR with a phone wallet." />
        <QrCode :value="link" :size="200" class="w-fit" />
        <JsonView :value="JSON.parse(tcJson)" label="TonConnect sendTransaction request" />
      </section>

      <section class="space-y-4">
        <TxPreview :messages="messages" />
        <WalletGate purpose="send this message">
          <div class="space-y-3">
            <UCheckbox
              v-if="spec?.init"
              v-model="deployConfirmed"
              label="I understand this deploys a contract with the code and data above, and that this cannot be undone."
            />
            <UButton
              icon="i-lucide-send"
              label="Send with my wallet"
              size="lg"
              :loading="sending || waiting"
              :disabled="!!spec?.init && !deployConfirmed"
              @click="send"
            />
            <LoadingState v-if="waiting" label="Waiting for the transaction to be included (up to 2 minutes)…" />
            <ErrorNotice v-if="sendError" :error="sendError" />
            <UAlert v-if="trace" color="success" variant="subtle" icon="i-lucide-circle-check" title="Sent and confirmed">
              <template #description>
                <ExplorerLinks kind="tx" :value="trace.external_hash" />
              </template>
            </UAlert>
          </div>
        </WalletGate>
      </section>
    </template>
  </div>
</template>
