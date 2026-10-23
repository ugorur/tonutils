<script setup lang="ts">
import { Address, beginCell, storeStateInit } from '@ton/core'
import { WalletContractV4 } from '@ton/ton'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { signDataTypes } from '~/lib/wallet-actions/core'
import { parseBoc } from '~/utils/ton/messages'
import type { SignatureBundle, SignPayload } from './logic'
import { defaultProofText, parseBundle, payloadPreview, publicKeyFromStateInit, verifySignature } from './logic'

const tc = useTonConnect()
const tonapi = useTonapi()
const { network } = useTonNetwork()
const tab = ref<'sign' | 'verify'>('sign')
const TABS = [
  { label: 'Sign', value: 'sign', icon: 'i-lucide-signature', slot: 'sign' as const },
  { label: 'Verify', value: 'verify', icon: 'i-lucide-badge-check', slot: 'verify' as const }
]

// ---------------------------------------------------------------- verify (works without a wallet)
/** `tied`: the key is proven to control the address (on chain or via a matching StateInit). */
interface Verdict { valid: boolean, tied: boolean, keySource: string, publicKey: string, keyWarning?: string }
const bundleText = ref('')
const verifying = ref(false)
const verifyError = ref<unknown>(null)
const checked = shallowRef<{ bundle: SignatureBundle, verdict: Verdict } | null>(null)

/** Public key that really controls the address: on-chain first, then a StateInit that hashes to it, then the bundle (unverified). */
async function resolveKey(b: SignatureBundle): Promise<Omit<Verdict, 'valid'>> {
  try {
    const r = await tonapi.get<{ public_key: string }>(`accounts/${Address.parse(b.address).toRawString()}/publickey`)
    const pk = r.public_key.toLowerCase()
    return { tied: true, publicKey: pk, keySource: 'Read from the wallet contract on chain (get_public_key)', keyWarning: b.publicKey && b.publicKey !== pk ? 'The public key written in the bundle differs from the one on chain; the on-chain key was used.' : undefined }
  }
  catch (e) {
    if (!(e instanceof TonApiError) || e.isRateLimit || e.status === 0 || e.status >= 500) throw e
  }
  if (b.walletStateInit) {
    const r = publicKeyFromStateInit(b.address, b.walletStateInit)
    return { tied: true, publicKey: r.publicKey, keySource: `From the wallet's StateInit (${r.version}, not deployed yet); the StateInit hashes to the signer address` }
  }
  if (b.publicKey) {
    return { tied: false, publicKey: b.publicKey, keySource: 'Taken from the bundle', keyWarning: 'The key could not be read from the chain (the wallet is not deployed or is not a standard wallet) and the bundle has no StateInit, so nothing ties this key to the address. The signature only proves the key holder signed it.' }
  }
  throw new Error(`The wallet is not deployed on ${network.value} and the bundle carries no public key or StateInit, so the signature cannot be checked.`)
}

async function verify() {
  verifyError.value = null
  checked.value = null
  verifying.value = true
  try {
    const bundle = parseBundle(bundleText.value)
    const k = await resolveKey(bundle)
    checked.value = { bundle, verdict: { ...k, valid: verifySignature(bundle, k.publicKey) } }
  }
  catch (e) {
    verifyError.value = e
  }
  finally {
    verifying.value = false
  }
}

// Real signature from a TonConnect wallet (test vector in near/intents ton-connect crate). The wallet was never
// deployed, so its key comes from the v4 StateInit, which hashes to the signer address.
function verifyExample() {
  const publicKey = Buffer.from('22e795a07e832fc9084ca35a488a711f1dbedef637d4e886a6997d93ee2c2e37', 'hex')
  const w = WalletContractV4.create({ workchain: 0, publicKey })
  bundleText.value = JSON.stringify({
    signature: Buffer.from('9cf4c1c16b47afce46940eb9cd410894f31544b74206c2254bb1651f9b32cf5b0e482b78a2e8251e54d3517fae4b06c6f23546667d63ff62dccce70451698d01', 'hex').toString('base64'),
    address: '0:f4809e5ffac9dc42a6b1d94c5e74ad5fd86378de675c805f2274d0055cbc9378',
    timestamp: 1747760435,
    domain: 'ton-connect.github.io',
    payload: { type: 'binary', bytes: Buffer.from('Hello, TON!').toString('base64') },
    publicKey: publicKey.toString('hex'),
    walletStateInit: beginCell().store(storeStateInit(w.init)).endCell().toBoc().toString('base64')
  }, null, 2)
  verify()
}

const fmtTime = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function detailRows(b: SignatureBundle, v: Verdict): KeyValueItem[] {
  return [
    { label: 'Signed by', value: b.address },
    { label: 'Signed at', value: `${fmtTime(b.timestamp)} (${b.timestamp})`, mono: false },
    { label: 'For site', value: b.domain, mono: false, hint: 'The wallet adds the site that asked for the signature. A signature made for another site cannot be reused here unnoticed.' },
    { label: `Message (${b.payload.type})`, value: payloadPreview(b.payload), mono: b.payload.type !== 'text' },
    { label: 'Public key', value: v.publicKey, hint: v.keySource }
  ]
}

// ---------------------------------------------------------------- sign (needs a wallet)
type Kind = SignPayload['type']
const kind = ref<Kind>('text')
const KINDS = [
  { label: 'Text', value: 'text' },
  { label: 'Bytes (hex)', value: 'binary' },
  { label: 'Cell (BOC + TL-B)', value: 'cell' }
]
const text = ref(defaultProofText())
const hex = ref('')
const cellBoc = ref('')
const schema = ref('message#_ text:SnakeData = Message;')
const signing = ref(false)
const signError = ref<unknown>(null)
const signed = shallowRef<{ bundle: SignatureBundle, json: string, valid: boolean } | null>(null)

const supported = computed(() => signDataTypes(tc.wallet.value?.device.features))
const payload = computed<SignPayload | { error: string }>(() => {
  if (kind.value === 'text') return text.value.trim() ? { type: 'text', text: text.value } : { error: 'Enter the text to sign.' }
  if (kind.value === 'binary') {
    const h = hex.value.replace(/\s+/g, '').replace(/^0x/i, '')
    if (!h || h.length % 2 || /[^0-9a-f]/i.test(h)) return { error: 'Enter bytes as hex, e.g. 48656c6c6f.' }
    return { type: 'binary', bytes: Buffer.from(h, 'hex').toString('base64') }
  }
  try {
    if (!schema.value.trim()) return { error: 'Enter the TL-B schema of the cell.' }
    return { type: 'cell', schema: schema.value.trim(), cell: parseBoc(cellBoc.value).toBoc().toString('base64') }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})

async function sign() {
  const p = payload.value
  const w = tc.wallet.value
  if ('error' in p || !w) return
  signError.value = null
  signed.value = null
  signing.value = true
  try {
    const res = await tc.signData({ ...p, from: w.address })
    const bundle: SignatureBundle = { ...res, payload: res.payload as SignatureBundle['payload'], publicKey: w.publicKey, walletStateInit: w.walletStateInit }
    let valid = false
    try {
      valid = !!w.publicKey && verifySignature(bundle, w.publicKey)
    }
    catch { /* shown as unverified */ }
    signed.value = { bundle, json: JSON.stringify(bundle, null, 2), valid }
  }
  catch (e) {
    signError.value = e
  }
  finally {
    signing.value = false
  }
}

function download() {
  if (signed.value) downloadText(signed.value.json, `signature-${signed.value.bundle.timestamp}.json`, 'application/json')
}
function checkSigned() {
  if (!signed.value) return
  bundleText.value = signed.value.json
  tab.value = 'verify'
  verify()
}
</script>

<template>
  <UTabs v-model="tab" :items="TABS" class="w-full" :ui="{ content: 'pt-5' }">
    <template #sign>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Your wallet signs the message together with your address, the site name and the time. Anyone can check the result with the Verify tab. Signing never moves funds and cannot authorize a transaction.
        </p>
        <URadioGroup v-model="kind" :items="KINDS" orientation="horizontal" />
        <UFormField v-if="kind === 'text'" label="Text to sign" hint="Include something only you would write now (a date, a nonce) so an old signature cannot be passed off as new.">
          <UTextarea v-model="text" :rows="3" autoresize class="w-full" data-testid="sign-text" />
        </UFormField>
        <UFormField v-else-if="kind === 'binary'" label="Bytes (hex)" hint="Wallets show a warning for bytes they cannot display.">
          <UTextarea v-model="hex" :rows="2" class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="48656c6c6f2c20544f4e21" />
        </UFormField>
        <template v-else>
          <UFormField label="TL-B schema" hint="Its crc32 is part of what is signed, so a contract can check it">
            <UInput v-model="schema" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
          <UFormField label="Cell (BOC, base64 or hex)">
            <UTextarea v-model="cellBoc" :rows="2" class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="te6cc…" />
          </UFormField>
        </template>
        <UAlert v-if="'error' in payload && (kind !== 'text' ? (kind === 'binary' ? hex : cellBoc) : true)" color="neutral" variant="subtle" icon="i-lucide-info" :description="payload.error" />

        <WalletGate purpose="sign a message">
          <template #default="{ wallet }">
            <div class="space-y-3">
              <UAlert
                v-if="!supported.length"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :title="`${wallet.walletName} does not support message signing`"
                description="It does not advertise TonConnect signData. Try Tonkeeper, MyTonWallet or Tonhub."
              />
              <UAlert
                v-else-if="!supported.includes(kind)"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :description="`${wallet.walletName} can sign ${supported.join(', ')} but not ${kind} payloads.`"
              />
              <UButton
                v-else
                label="Sign with wallet"
                icon="i-lucide-signature"
                size="lg"
                :loading="signing"
                :disabled="'error' in payload"
                data-testid="sign-button"
                @click="sign"
              />
              <ErrorNotice v-if="signError" :error="signError" />
            </div>
          </template>
        </WalletGate>

        <div v-if="signed" class="space-y-3 rounded-lg border border-default p-4">
          <UAlert v-if="signed.valid" color="success" variant="subtle" icon="i-lucide-circle-check" title="Signed. Signature checks out against your wallet's key." />
          <UAlert v-else color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Signed, but it could not be checked locally" description="Use the Verify tab: it reads your key from the chain." />
          <JsonView :value="signed.bundle" label="Signature bundle (share this)" />
          <div class="flex flex-wrap gap-2">
            <CopyButton :value="signed.json" label="Copy bundle" />
            <UButton label="Download .json" icon="i-lucide-download" variant="outline" color="neutral" size="sm" @click="download" />
            <UButton label="Verify it" icon="i-lucide-badge-check" variant="outline" color="neutral" size="sm" @click="checkSigned" />
          </div>
        </div>
      </div>
    </template>

    <template #verify>
      <form class="space-y-4" @submit.prevent="verify">
        <UFormField label="Signature bundle (JSON)" hint="From this tool, or a TonConnect signData response with the public key">
          <UTextarea v-model="bundleText" :rows="8" class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="{ &quot;signature&quot;: &quot;…&quot;, &quot;address&quot;: &quot;0:…&quot;, &quot;timestamp&quot;: …, &quot;domain&quot;: &quot;…&quot;, &quot;payload&quot;: { … } }" data-testid="bundle-input" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-3">
          <UButton type="submit" label="Verify signature" icon="i-lucide-badge-check" :loading="verifying" :disabled="!bundleText.trim()" />
          <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="verifyExample" />
        </div>
        <p class="text-xs text-muted">
          Checked in your browser. Only the signer's public key is looked up on tonapi.io ({{ network }}).
        </p>
      </form>

      <div class="mt-4 space-y-3">
        <ErrorNotice v-if="verifyError" :error="verifyError" title="Could not verify" @retry="verify" />
        <template v-if="checked">
          <UAlert
            v-if="checked.verdict.valid && !checked.verdict.tied"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Signature matches the key in the bundle, not proven for this address"
            description="The math checks out, but nothing ties this key to the address. Do not treat it as proof of wallet ownership."
            data-testid="verify-untied"
          />
          <UAlert
            v-else-if="checked.verdict.valid"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            title="Valid signature"
            :description="`The holder of this wallet's key signed this exact message for ${checked.bundle.domain}.`"
            data-testid="verify-valid"
          />
          <UAlert
            v-else
            color="error"
            variant="subtle"
            icon="i-lucide-octagon-x"
            title="Invalid signature"
            description="The signature does not match this address, message, site and time. Something was changed, or it was signed by another key."
            data-testid="verify-invalid"
          />
          <UAlert v-if="checked.verdict.keyWarning" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="checked.verdict.keyWarning" />
          <KeyValue :items="detailRows(checked.bundle, checked.verdict)" />
          <ExplorerLinks :value="checked.bundle.address" />
        </template>
      </div>
    </template>
  </UTabs>
</template>
