<script setup lang="ts">
import type { SignDataResponse, TonConnectUI } from '@tonconnect/ui'
import type { TonTrace } from '~/composables/useTonConnect'
import CheckList from '~/lib/dev-tonconnect/CheckList.vue'
import { summarizeFeatures } from '~/lib/dev-tonconnect/features'
import { messageHash, normalizedExtMessageHash } from '~/utils/ton/messages'
import type { SignDataKind, SdkItem } from './logic'
import { previewMessages, signDataPayload, templates, validateRequest } from './logic'

const EXAMPLE_WALLET = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'

const tc = useTonConnect()
const { network } = useTonNetwork()
const tab = ref<'send' | 'sign'>('send')

// Ticking clock so validUntil expiry shows up while the page is open.
const now = ref(Math.floor(Date.now() / 1000))
const clock = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 5000)
onBeforeUnmount(() => clearInterval(clock))

const live = computed(() => (tc.wallet.value && !tc.networkMismatch.value ? tc.wallet.value : null))
const features = computed(() => (live.value ? summarizeFeatures(live.value.device.features) : undefined))

// ------------------------------------------------------------ request editor
const signOnly = ref(false)
const text = ref('')
const tpls = computed(() => templates(live.value?.address ?? EXAMPLE_WALLET, network.value, now.value))
// Last template loaded, to tell an untouched template from the user's own edits.
let loaded = { id: 'comment', json: '' }
function loadTemplate(id: string) {
  const t = tpls.value.find(x => x.id === id)
  if (!t) return
  loaded = { id, json: t.json }
  text.value = t.json
}
onMounted(() => loadTemplate('comment'))
// Re-address an untouched template when a wallet connects or the site network changes.
watch([() => live.value?.address, network], () => {
  if (!text.value || text.value === loaded.json) loadTemplate(loaded.id)
})

const result = computed(() => (text.value.trim()
  ? validateRequest(text.value, { network: network.value, nowSec: now.value, wallet: live.value?.address, features: features.value, signOnly: signOnly.value })
  : null))
const preview = computed(() => (result.value?.request ? previewMessages(result.value.request) : []))
const otherItems = computed(() => (result.value?.request?.items ?? []).filter((i): i is Exclude<SdkItem, { type: 'ton' }> => i.type !== 'ton'))
const extras = computed(() => (result.value?.request?.messages ?? []).flatMap((m, i) => Object.entries(m.extraCurrency ?? {}).map(([id, amt]) => ({ i, id, amt }))))

function refreshValidUntil() {
  try {
    const o = JSON.parse(text.value)
    const key = 'valid_until' in o ? 'valid_until' : 'validUntil'
    o[key] = Math.floor(Date.now() / 1000) + 300
    text.value = JSON.stringify(o, null, 2)
  }
  catch { /* invalid JSON is already reported */ }
}

// ------------------------------------------------------------ send / sign
const confirmed = ref(false)
watch([text, signOnly], () => (confirmed.value = false))
const busy = ref(false)
const sendError = shallowRef<unknown>(null)
const sent = shallowRef<{ boc: string, hash: string, signOnly: boolean } | null>(null)
const trace = shallowRef<TonTrace | null>(null)
const waiting = ref(false)
const traceError = shallowRef<unknown>(null)

async function track() {
  if (!sent.value || sent.value.signOnly) return
  waiting.value = true
  traceError.value = null
  try {
    trace.value = await tc.waitForTransaction(sent.value.hash)
  }
  catch (e) {
    traceError.value = e
  }
  finally {
    waiting.value = false
  }
}

async function send() {
  const req = result.value?.request
  if (!req || busy.value) return
  busy.value = true
  sendError.value = null
  sent.value = null
  trace.value = null
  try {
    const ui: TonConnectUI = await tc.getUi()
    // WalletGate guarantees a connected wallet on the site network; re-check right before signing.
    if (!tc.wallet.value || tc.networkMismatch.value) throw new Error('Connect a wallet on the site network first.')
    // The raw SDK call (not useTonConnect().sendTransaction) so from, items and extraCurrency reach the wallet
    // exactly as previewed above. validateRequest already forced network to the site network.
    type Req = Parameters<TonConnectUI['sendTransaction']>[0]
    if (signOnly.value) {
      const r = await ui.signMessage(req as Req)
      sent.value = { boc: r.internalBoc, hash: messageHash(r.internalBoc), signOnly: true }
    }
    else {
      const r = await ui.sendTransaction(req as Req)
      sent.value = { boc: r.boc, hash: normalizedExtMessageHash(r.boc), signOnly: false }
    }
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    busy.value = false
  }
  track()
}

const failed = computed(() => (trace.value ? Object.values(trace.value.transactions).filter(x => x.description?.aborted || x.description?.compute_ph?.success === false) : []))

// ------------------------------------------------------------ signData
const sdKind = ref<SignDataKind>('text')
const sdValue = ref('Sign in to TonUtils test')
const sdSchema = ref('')
const sdPayload = computed(() => signDataPayload(sdKind.value, sdValue.value, sdSchema.value))
const sdBusy = ref(false)
const sdError = shallowRef<unknown>(null)
const sdResult = shallowRef<SignDataResponse | null>(null)
watch(sdKind, (k) => {
  sdResult.value = null
  if (k === 'binary') sdValue.value = '0xdeadbeef'
  if (k === 'text') sdValue.value = 'Sign in to TonUtils test'
  if (k === 'cell') {
    sdValue.value = 'te6cckEBAQEADwAAGgAAAABwbGF5ZXItMTGIvGdv'
    sdSchema.value = 'text_comment#00000000 text:SnakeData = InMsgBody;'
  }
})
const sdSupported = computed(() => !features.value || features.value.signData.includes(sdKind.value))

async function signData() {
  const p = sdPayload.value
  if (!('payload' in p) || sdBusy.value) return
  sdBusy.value = true
  sdError.value = null
  sdResult.value = null
  try {
    sdResult.value = await tc.signData(p.payload)
  }
  catch (e) {
    sdError.value = e
  }
  finally {
    sdBusy.value = false
  }
}

const errName = (e: unknown) => (e instanceof Error ? e.name : typeof e)
</script>

<template>
  <div class="space-y-6">
    <!-- Wallet capabilities -->
    <section v-if="live && features" class="space-y-3 rounded-lg border border-default p-4" aria-label="Connected wallet" data-testid="wallet-panel">
      <div class="flex items-center gap-3">
        <img v-if="live.walletImage" :src="live.walletImage" alt="" class="size-9 rounded-lg border border-default">
        <div class="min-w-0">
          <p class="font-medium text-highlighted">
            {{ live.walletName }} <span class="text-sm font-normal text-muted">{{ live.device.appVersion }} · {{ live.device.platform }} · protocol v{{ live.device.maxProtocolVersion }}</span>
          </p>
          <p class="truncate font-mono text-xs text-muted">
            {{ live.friendly }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <UBadge v-if="features.sendTransaction" color="primary" variant="subtle" :label="`sendTransaction · max ${features.sendTransaction.maxMessages} messages`" />
        <UBadge v-else color="error" variant="subtle" label="No sendTransaction" />
        <UBadge v-if="features.legacySendTransaction" color="warning" variant="subtle" label="Legacy feature string" />
        <UBadge :color="features.sendTransaction?.extraCurrency ? 'primary' : 'neutral'" variant="subtle" :label="features.sendTransaction?.extraCurrency ? 'Extra currencies' : 'No extra currencies'" />
        <UBadge :color="features.sendTransaction?.itemTypes.length ? 'primary' : 'neutral'" variant="subtle" :label="features.sendTransaction?.itemTypes.length ? `items: ${features.sendTransaction.itemTypes.join(', ')}` : 'No structured items'" />
        <UBadge :color="features.signData.length ? 'primary' : 'neutral'" variant="subtle" :label="features.signData.length ? `signData: ${features.signData.join(', ')}` : 'No signData'" />
        <UBadge :color="features.signMessage ? 'primary' : 'neutral'" variant="subtle" :label="features.signMessage ? `signMessage · max ${features.signMessage.maxMessages}` : 'No signMessage'" />
      </div>
      <JsonView :value="live.device" label="DeviceInfo reported by the wallet" />
    </section>

    <UTabs
      v-model="tab"
      :content="false"
      :items="[{ label: 'sendTransaction', value: 'send', icon: 'i-lucide-send' }, { label: 'signData', value: 'sign', icon: 'i-lucide-signature' }]"
      class="w-full"
    />

    <!-- sendTransaction -->
    <div v-if="tab === 'send'" class="space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted">Start from:</span>
        <UButton v-for="t in tpls" :key="t.id" :label="t.label" size="xs" variant="outline" color="neutral" @click="loadTemplate(t.id)" />
      </div>

      <UFormField label="Request JSON" help="The object you pass to tonConnectUI.sendTransaction(). The spec's wire format (valid_until, extra_currency) and the full RPC envelope work too.">
        <UTextarea v-model="text" :rows="12" autoresize class="w-full font-mono text-xs" spellcheck="false" data-testid="request-json" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <USwitch v-model="signOnly" label="signMessage: sign only, do not broadcast" />
        <UButton label="validUntil = now + 5 min" icon="i-lucide-clock" size="xs" variant="ghost" color="neutral" @click="refreshValidUntil" />
      </div>
      <p v-if="!live" class="text-xs text-muted">
        Templates use an example address until you connect; then they send to your own wallet.
      </p>

      <CheckList v-if="result" :items="result.checks" data-testid="request-checks" />

      <template v-if="result?.request">
        <TxPreview v-if="preview.length" :messages="preview" />
        <div v-if="otherItems.length" class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Structured items (the wallet builds these messages)
          </h3>
          <JsonView :value="otherItems" label="items" />
        </div>
        <UAlert
          v-if="extras.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-coins"
          title="Extra currencies attached"
          :description="extras.map(x => `message ${x.i}: currency ${x.id} × ${x.amt}`).join(' · ')"
        />
        <JsonView :value="result.request" label="Exact request passed to the wallet" />
      </template>

      <WalletGate :purpose="signOnly ? 'test signMessage' : 'test sendTransaction'">
        <div class="space-y-3">
          <template v-if="result?.request">
            <UCheckbox
              v-if="network === 'mainnet' && !signOnly"
              v-model="confirmed"
              color="error"
              :label="`I understand this is mainnet: the wallet will send real ${COIN_SYMBOL} if I approve.`"
              data-testid="confirm-mainnet"
            />
            <UButton
              :label="signOnly ? 'Ask wallet to sign (no broadcast)' : 'Send to wallet'"
              icon="i-lucide-send"
              size="lg"
              :loading="busy"
              :disabled="busy || (network === 'mainnet' && !signOnly && !confirmed)"
              data-testid="send-button"
              @click="send"
            />
          </template>
          <p v-else class="text-sm text-muted">
            Fix the errors above to enable sending.
          </p>

          <div v-if="sendError" class="space-y-1">
            <ErrorNotice :error="sendError" />
            <p class="font-mono text-xs text-muted">
              {{ errName(sendError) }}
            </p>
          </div>

          <div v-if="sent" class="space-y-2 rounded-lg border border-default p-4 text-sm" data-testid="send-result">
            <ResultField :label="sent.signOnly ? 'Signed internal message (BOC, not broadcast)' : 'Signed external message (BOC)'" :value="sent.boc" />
            <ResultField :label="sent.signOnly ? 'Internal message hash' : 'Normalized message hash (TEP-467)'" :value="sent.hash" />
            <template v-if="!sent.signOnly">
              <LoadingState v-if="waiting" label="Waiting for the trace on toncenter (up to 2 minutes)…" />
              <template v-else-if="trace">
                <UAlert v-if="failed.length" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`Landed: ${failed.length} of ${trace.transactions_order.length} transactions failed`" :description="`First failure exit code: ${failed[0]?.description?.compute_ph?.exit_code ?? '?'}`" />
                <UAlert v-else color="success" variant="subtle" icon="i-lucide-circle-check" :title="`Landed: ${trace.transactions_order.length} transactions, all successful`" />
                <ExplorerLinks kind="tx" :value="trace.external_hash" />
                <JsonView :value="trace" label="toncenter v3 trace" />
              </template>
              <template v-else>
                <ErrorNotice v-if="traceError" :error="traceError" />
                <UButton label="Check again" icon="i-lucide-refresh-cw" size="sm" variant="outline" @click="track" />
                <ExplorerLinks kind="tx" :value="sent.hash" />
              </template>
            </template>
          </div>
        </div>
      </WalletGate>
    </div>

    <!-- signData -->
    <div v-else class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <UFormField label="Type">
          <USelect v-model="sdKind" :items="[{ label: 'text', value: 'text' }, { label: 'binary', value: 'binary' }, { label: 'cell', value: 'cell' }]" class="w-full" />
        </UFormField>
        <UFormField :label="sdKind === 'text' ? 'Text' : sdKind === 'binary' ? 'Bytes (hex or base64)' : 'Cell (base64 BOC)'">
          <UTextarea v-model="sdValue" :rows="3" autoresize class="w-full font-mono text-sm" data-testid="signdata-value" />
        </UFormField>
      </div>
      <UFormField v-if="sdKind === 'cell'" label="TL-B schema" help="The last declared type is the root. Wallets may show the decoded cell, or a warning that the content is unknown.">
        <UInput v-model="sdSchema" class="w-full font-mono" />
      </UFormField>
      <UAlert v-if="'error' in sdPayload" color="error" variant="subtle" icon="i-lucide-circle-x" :title="sdPayload.error" />
      <template v-else>
        <JsonView :value="{ ...sdPayload.payload, network: network === 'mainnet' ? '-239' : '-3' }" label="Payload passed to signData" />
      </template>
      <UAlert v-if="!sdSupported" color="error" variant="subtle" icon="i-lucide-circle-x" :title="`This wallet does not list signData type &quot;${sdKind}&quot;`" />

      <WalletGate purpose="test signData">
        <div class="space-y-3">
          <UButton label="Ask wallet to sign" icon="i-lucide-signature" size="lg" :loading="sdBusy" :disabled="'error' in sdPayload || !sdSupported" @click="signData" />
          <div v-if="sdError" class="space-y-1">
            <ErrorNotice :error="sdError" />
            <p class="font-mono text-xs text-muted">
              {{ errName(sdError) }}
            </p>
          </div>
          <template v-if="sdResult">
            <JsonView :value="sdResult" label="Wallet response" />
            <p class="text-sm text-muted">
              Copy the response and check the signature in <NuxtLink to="/tools/verify-signature" class="text-primary underline">Verify a signed message</NuxtLink>.
            </p>
          </template>
        </div>
      </WalletGate>
    </div>
  </div>
</template>
