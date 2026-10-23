<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TonTrace } from '~/composables/useTonConnect'
import type { PayloadKind } from '~/lib/payload-builders/common'
import { buildPayload, optionalBoc } from '~/lib/payload-builders/common'
import PayloadField from '~/lib/payload-builders/PayloadField.vue'
import type { KeyPair, SignVersion } from './logic'
import { analyzeExternal, buildRawExternal, buildSignedTransfer, explainBroadcastError, keyFromSecret, SIGN_VERSIONS, walletContract } from './logic'

// A real mainnet W5 external message (already processed): broadcasting it shows how a rejection is explained.
const EXAMPLE_EXT = 'te6cckEBBAEAtwAB5YgARv2bvfXQOMj/K8XQ37CFt9YpaM1bCQeMu7UUrx6xHBYDm0s7c///+ItW0eaoAAAB5CBfLEi6PixJ9991D8zSe/d3gi7Pj57R0cU4iVwhK/vIiya64/bNT2+xvkT0NGvikmTSdzMPVureRTR+a7WzjhkBAgoOw8htAwIDAAAAaEIARWOPmDau6/g+o7oB8cA0JA8Ydp4r1vLJ0/cFVdbgcayhNfG0AAAAAAAAAAAAAAAAAADnczte'

const { network, isTestnet, toggle } = useTonNetwork()
const toncenter = useToncenter()
const tc = useTonConnect()

const tab = ref<'broadcast' | 'sign' | 'raw'>('broadcast')
const tabs = [
  { label: 'Broadcast', value: 'broadcast', icon: 'i-lucide-radio-tower' },
  { label: 'Sign (testnet)', value: 'sign', icon: 'i-lucide-pen-line' },
  { label: 'Unsigned', value: 'raw', icon: 'i-lucide-file-code' }
]

/** The external message the lower half analyzes and broadcasts. */
const boc = ref('')

// ---------------------------------------------------------------- sign (testnet only)
const secret = ref('')
const version = ref<SignVersion>('v5r1')
const key = shallowRef<KeyPair | null>(null)
const keyError = ref<string | null>(null)
watch(secret, async (s) => {
  key.value = null
  keyError.value = null
  if (!s.trim()) return
  try {
    const k = await keyFromSecret(s)
    if (secret.value === s) key.value = k
  }
  catch (e) {
    if (secret.value === s) keyError.value = (e as Error).message
  }
})
const signer = computed(() => (key.value ? walletContract(version.value, key.value.publicKey, network.value) : null))
const signerAddress = computed(() => signer.value?.address.toString({ bounceable: false, testOnly: isTestnet.value }) ?? '')

interface WalletState { status: string, balance: bigint, seqno: number }
const wstate = ref<WalletState | null>(null)
const wError = ref<unknown>(null)
const wLoading = ref(false)
async function loadWallet() {
  wstate.value = null
  wError.value = null
  const a = signerAddress.value
  if (!a || !isTestnet.value) return
  wLoading.value = true
  try {
    const r = await toncenter.v2<{ account_state: string, balance: string, seqno?: number }>('getWalletInformation', { address: a })
    if (a === signerAddress.value) wstate.value = { status: r.account_state, balance: BigInt(r.balance), seqno: r.seqno ?? 0 }
  }
  catch (e) {
    wError.value = e
  }
  finally {
    wLoading.value = false
  }
}
watch([signerAddress, network], () => loadWallet())

const toText = ref('')
const to = shallowRef<Address | null>(null)
const amountText = ref('0.01')
const amount = ref<bigint | null>(null)
const bounce = ref(false)
const bodyKind = ref<PayloadKind>('comment')
const bodyText = ref('Sent with TonUtils')
const modeText = ref('3')
const minutes = ref('5')
const signError = ref<string | null>(null)

const modeWarning = computed(() => (version.value === 'v5r1' && !(Number(modeText.value) & 2) ? 'W5 rejects external messages whose send mode lacks +2 (exit code 137).' : null))

function sign() {
  signError.value = null
  try {
    if (!key.value || !wstate.value) throw new Error('Enter a key and wait for the wallet state to load.')
    if (!to.value) throw new Error('Enter a recipient.')
    if (amount.value === null) throw new Error('Enter an amount.')
    const mode = Number(modeText.value)
    if (!Number.isInteger(mode) || mode < 0 || mode > 255) throw new Error('Send mode must be 0 to 255.')
    const mins = Number(minutes.value)
    if (!(mins > 0 && mins <= 1440)) throw new Error('Validity must be between 1 and 1440 minutes.')
    const deploy = wstate.value.status !== 'active'
    const msg = buildSignedTransfer({
      version: version.value,
      key: key.value,
      network: network.value,
      seqno: deploy ? 0 : wstate.value.seqno,
      messages: [{ to: to.value, value: amount.value, bounce: bounce.value, body: buildPayload(bodyKind.value, bodyText.value) }],
      sendMode: mode,
      validUntil: Math.floor(Date.now() / 1000) + Math.round(mins * 60),
      deploy
    })
    boc.value = msg.toBoc().toString('base64')
  }
  catch (e) {
    signError.value = (e as Error).message
  }
}
function forgetKey() {
  secret.value = ''
  key.value = null
}
onBeforeUnmount(forgetKey)
// Signing is testnet only: drop the key as soon as the site switches to mainnet.
watch(isTestnet, (t) => {
  if (!t) forgetKey()
})

// ---------------------------------------------------------------- raw external
const rawToText = ref('')
const rawTo = shallowRef<Address | null>(null)
const rawBody = ref('')
const rawInit = ref('')
const rawError = ref<string | null>(null)
function buildRaw() {
  rawError.value = null
  try {
    if (!rawTo.value) throw new Error('Enter the destination contract.')
    boc.value = buildRawExternal({ to: rawTo.value, body: optionalBoc(rawBody.value), init: optionalBoc(rawInit.value) }).toBoc().toString('base64')
  }
  catch (e) {
    rawError.value = (e as Error).message
  }
}

// ---------------------------------------------------------------- analysis + broadcast
const analysis = computed(() => {
  if (!boc.value.trim()) return null
  try {
    return { ok: true as const, info: analyzeExternal(boc.value, isTestnet.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const now = ref(Math.floor(Date.now() / 1000))
const expired = computed(() => analysis.value?.ok && analysis.value.info.wallet ? analysis.value.info.wallet.validUntil < now.value : false)

const sending = ref(false)
const waiting = ref(false)
const sendError = ref<unknown>(null)
const sendErrorText = ref<string | null>(null)
const accepted = ref<string | null>(null)
const trace = ref<TonTrace | null>(null)
watch(boc, () => {
  accepted.value = null
  trace.value = null
  sendError.value = null
  sendErrorText.value = null
  now.value = Math.floor(Date.now() / 1000)
})

async function broadcast() {
  if (!analysis.value?.ok) return
  sending.value = true
  sendError.value = null
  sendErrorText.value = null
  accepted.value = null
  trace.value = null
  try {
    const url = buildUrl(`${toncenter.baseUrl()}/v2`, 'sendBocReturnHash')
    await rateLimitedJson<{ ok: boolean, result: { hash: string } }>(url, { provider: 'toncenter', retries: 1 }, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boc: boc.value.trim() })
    })
    accepted.value = analysis.value.info.normHash
    sending.value = false
    waiting.value = true
    trace.value = await tc.waitForTransaction(analysis.value.info.normHash, { timeoutMs: 90_000 })
  }
  catch (e) {
    const body = e instanceof TonApiError ? (e.body as { error?: string, result?: string } | undefined) : undefined
    const raw = body?.error ?? body?.result
    if (raw && typeof raw === 'string' && !(e as TonApiError).isRateLimit) sendErrorText.value = explainBroadcastError(raw)
    else sendError.value = e
  }
  finally {
    sending.value = false
    waiting.value = false
  }
}

const fmtTime = (t: number) => new Date(t * 1000).toLocaleString()
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" :ui="{ leadingIcon: 'max-sm:hidden' }" />

    <!-- BROADCAST -->
    <div v-if="tab === 'broadcast'" class="space-y-3">
      <p class="text-sm text-muted">
        Paste a signed external message (base64 or hex BOC) from an SDK, a script or an offline signer. It is checked here first, then sent to the {{ network }} network through toncenter.
      </p>
      <UFormField label="External message BOC">
        <UTextarea v-model="boc" :rows="4" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cck…" spellcheck="false" data-testid="ext-boc" />
      </UFormField>
      <UButton v-if="!boc" label="Load a real mainnet message (already processed)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="boc = EXAMPLE_EXT" />
    </div>

    <!-- SIGN -->
    <div v-else-if="tab === 'sign'" class="space-y-4">
      <UAlert
        v-if="!isTestnet"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="Signing with a key is testnet only"
        description="Typing a mainnet seed phrase into any website is a risk. On mainnet, use the wallet tools, which sign in your own wallet through TonConnect. You can still broadcast BOCs you signed elsewhere."
        :actions="[{ label: 'Switch to testnet', color: 'warning', variant: 'outline', onClick: () => toggle() }]"
      />
      <template v-else>
        <UAlert color="info" variant="subtle" icon="i-lucide-lock" description="Your key stays in this tab: it is used to sign locally, never stored and never sent. Only the signed message is broadcast. Use a throwaway testnet wallet." />
        <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <UFormField label="Testnet mnemonic (24 words) or private key (hex)" :error="keyError ?? undefined">
            <UTextarea v-model="secret" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-sm' }" autocomplete="off" spellcheck="false" data-testid="secret" />
          </UFormField>
          <UFormField label="Wallet version">
            <USelect v-model="version" :items="[...SIGN_VERSIONS]" class="w-full" />
          </UFormField>
        </div>
        <div v-if="signer" class="space-y-2 rounded-lg border border-default p-4">
          <ResultField label="Wallet address (testnet)" :value="signerAddress" />
          <LoadingState v-if="wLoading" label="Reading seqno and balance…" />
          <ErrorNotice v-else-if="wError" :error="wError" @retry="loadWallet" />
          <div v-else-if="wstate" class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Status: <strong class="text-highlighted">{{ wstate.status }}</strong></span>
            <span>Balance: <TokenAmount :nano="wstate.balance" /></span>
            <span>Seqno: <strong class="font-mono text-highlighted">{{ wstate.seqno }}</strong></span>
            <span v-if="wstate.status !== 'active'" class="text-warning">Not deployed: the message will include the StateInit and deploy it.</span>
          </div>
          <UButton label="Forget key" icon="i-lucide-eraser" color="neutral" variant="outline" size="xs" @click="forgetKey" />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <AddressInput v-model="toText" label="Recipient" @parsed="to = $event" />
          <AmountInput v-model="amountText" v-model:nano="amount" label="Amount" />
        </div>
        <PayloadField v-model:kind="bodyKind" v-model:text="bodyText" label="Message body" />
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Send mode" hint="3 = pay fees separately + ignore errors">
            <UInput v-model="modeText" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
          </UFormField>
          <UFormField label="Valid for (minutes)">
            <UInput v-model="minutes" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
          </UFormField>
          <USwitch v-model="bounce" label="Bounceable (for contracts)" class="sm:mt-7" />
        </div>
        <UAlert v-if="modeWarning" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="modeWarning" />
        <UAlert v-if="signError" color="error" variant="subtle" icon="i-lucide-circle-x" :description="signError" />
        <UButton label="Sign message" icon="i-lucide-pen-line" :disabled="!key || !wstate" @click="sign" />
      </template>
    </div>

    <!-- RAW -->
    <div v-else class="space-y-4">
      <p class="text-sm text-muted">
        Wrap any body (and optional StateInit) into an external-in message, for contracts that accept unsigned externals or that you sign yourself in the body.
      </p>
      <AddressInput v-model="rawToText" label="Destination contract" @parsed="rawTo = $event" />
      <UFormField label="Body BOC (optional)">
        <UTextarea v-model="rawBody" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="te6cc…" />
      </UFormField>
      <UFormField label="StateInit BOC (optional, deploys the contract)">
        <UTextarea v-model="rawInit" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="te6cc…" />
      </UFormField>
      <UAlert v-if="rawError" color="error" variant="subtle" icon="i-lucide-circle-x" :description="rawError" />
      <UButton label="Build external message" icon="i-lucide-hammer" @click="buildRaw" />
    </div>

    <!-- ANALYSIS -->
    <template v-if="analysis">
      <USeparator />
      <UAlert v-if="!analysis.ok" color="error" variant="subtle" icon="i-lucide-circle-x" :description="analysis.error" />
      <div v-else class="space-y-4" data-testid="ext-analysis">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          What this message does
        </h3>
        <div class="divide-y divide-default rounded-lg border border-default px-4">
          <ResultField label="To (contract that receives it)" :value="analysis.info.dest.toString({ testOnly: isTestnet })">
            <AddressLink :address="analysis.info.dest.toString({ testOnly: isTestnet })" full />
          </ResultField>
          <ResultField label="Normalized hash (TEP-467, what explorers show)" :value="analysis.info.normHash" />
          <ResultField label="Message cell hash" :value="analysis.info.hash" />
          <ResultField v-if="tab !== 'broadcast'" label="Signed BOC" :value="boc" />
          <ResultField v-if="analysis.info.hasInit" label="Deploys a contract (StateInit code hash)" :value="analysis.info.initCodeHash ?? 'no code'" />
        </div>
        <div v-if="analysis.info.wallet" class="space-y-3 rounded-lg border border-default p-4">
          <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Wallet body: <strong class="text-highlighted">{{ analysis.info.wallet.kind === 'w5' ? 'W5' : 'v3/v4' }}</strong></span>
            <span>Seqno: <strong class="font-mono text-highlighted">{{ analysis.info.wallet.seqno }}</strong></span>
            <span>Valid until: <strong :class="expired ? 'text-error' : 'text-highlighted'">{{ fmtTime(analysis.info.wallet.validUntil) }}</strong></span>
          </div>
          <UAlert v-if="expired" color="warning" variant="subtle" icon="i-lucide-clock" description="This message has expired: the wallet will reject it. Sign a new one." />
          <ol class="space-y-2">
            <li v-for="(m, i) in analysis.info.wallet.messages" :key="i" class="rounded-md bg-elevated/50 p-3 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <TokenAmount :nano="m.value" class="font-medium" />
                <span class="text-muted">to</span>
                <AddressLink v-if="m.dest" :address="m.dest" :bounceable="m.bounce" />
                <UBadge :label="`mode ${m.mode}`" variant="subtle" color="neutral" size="sm" />
                <UBadge :label="m.body.opHex ? `${m.body.title} · ${m.body.opHex}` : m.body.title" variant="subtle" size="sm" />
              </div>
              <div v-if="m.body.name === 'text_comment'" class="mt-1 text-muted">
                “{{ m.body.fields.text }}”
              </div>
            </li>
          </ol>
        </div>

        <UButton :label="`Broadcast to ${network}`" icon="i-lucide-radio-tower" size="lg" :loading="sending" :disabled="waiting" data-testid="broadcast" @click="broadcast" />
        <p class="-mt-2 text-xs text-muted">
          Sent through toncenter's public sendBocReturnHash. An expired message, a used seqno or a bad signature is rejected by the node for free.
        </p>
        <ErrorNotice v-if="sendError && !accepted" :error="sendError" title="Broadcast failed" @retry="broadcast" />
        <UAlert v-else-if="sendError" color="warning" variant="subtle" icon="i-lucide-clock" title="Accepted, but not seen on chain yet" description="The node took the message, but toncenter has not indexed a transaction for it within 90 s. Check the hash in an explorer before broadcasting again." />
        <ExplorerLinks v-if="accepted && sendError" kind="tx" :value="accepted" />
        <UAlert v-if="sendErrorText" color="error" variant="subtle" icon="i-lucide-circle-x" title="The network rejected this message" :description="sendErrorText" data-testid="broadcast-error" />
        <UAlert v-if="accepted && !trace && !sendError" color="success" variant="subtle" icon="i-lucide-send" title="Accepted by the node" description="Waiting for the transaction to land (up to 90 s)…" />
        <LoadingState v-if="waiting" label="Polling toncenter for the transaction…" />
        <div v-if="trace" class="space-y-2">
          <UAlert color="success" variant="subtle" icon="i-lucide-circle-check" :title="`Landed: ${trace.transactions_order.length} transaction(s)`" />
          <ExplorerLinks kind="tx" :value="trace.external_hash" />
        </div>
      </div>
    </template>
  </div>
</template>
