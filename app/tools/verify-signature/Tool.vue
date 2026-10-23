<script setup lang="ts">
import { Address } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { TonNetwork } from '~/composables/useTonNetwork'
import CheckList from '~/lib/security-signing/CheckList.vue'
import { tonapiKeyLookup } from '~/lib/security-signing/chain'
import { EXAMPLE_PROOF, exampleSignData } from '~/lib/security-signing/examples'
import type { KeyResolution, ProofCheck } from '~/lib/security-signing/proof'
import { NETWORK_NAMES, proofChecks, resolvePublicKey, verifyProof } from '~/lib/security-signing/proof'
import { payloadPreview, verifySignature } from '~/tools/sign-message/logic'
import type { Encoding } from './logic'
import { decodeBytes, detectBundle, parsePublicKey, parseSignature, verifyRaw } from './logic'

const { network } = useTonNetwork()
const lookupNet = ref<TonNetwork>(network.value)
const keyLookup = tonapiKeyLookup(useTonapi(lookupNet))
const netFrom = (id?: string): TonNetwork => {
  const n = NETWORK_NAMES[id ?? '']
  return n === 'mainnet' || n === 'testnet' ? n : network.value
}

const tab = ref('bundle')
const TABS = [
  { label: 'Signed bundle', value: 'bundle', icon: 'i-lucide-file-json', slot: 'bundle' as const },
  { label: 'Raw Ed25519', value: 'raw', icon: 'i-lucide-binary', slot: 'raw' as const }
]
const fmtTime = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

// ---------------------------------------------------------------- bundle (signData or ton_proof)
interface BundleResult { kind: 'signData' | 'proof', valid: boolean, key: KeyResolution, rows: KeyValueItem[], checks: ProofCheck[] }
const text = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<BundleResult | null>(null)

async function verifyBundle() {
  error.value = null
  result.value = null
  loading.value = true
  try {
    const d = detectBundle(text.value)
    const checks: ProofCheck[] = []
    if (d.kind === 'proof') {
      const i = d.input
      lookupNet.value = netFrom(i.network)
      const key = await resolvePublicKey(i, keyLookup)
      // Old proofs are fine to check here; only the structural checks apply outside a live login.
      checks.push(...proofChecks(i).filter(c => c.label === 'Domain length' || c.label === 'Domain format'))
      result.value = finish('proof', verifyProof(i, key.publicKey), key, checks, [
        { label: 'Signed by', value: i.address },
        { label: 'Signed at', value: `${fmtTime(i.proof.timestamp)} (${i.proof.timestamp})`, mono: false },
        { label: 'For site', value: i.proof.domain.value, mono: false, hint: 'A ton_proof is a login signature: the wallet proves its owner connected to this site.' },
        { label: 'Payload', value: i.proof.payload, hint: 'Nonce chosen by the site' }
      ])
    }
    else {
      const b = d.bundle
      lookupNet.value = netFrom(b.payload.network)
      const key = await resolvePublicKey(b, keyLookup)
      result.value = finish('signData', verifySignature(b, key.publicKey), key, checks, [
        { label: 'Signed by', value: b.address },
        { label: 'Signed at', value: `${fmtTime(b.timestamp)} (${b.timestamp})`, mono: false },
        { label: 'For site', value: b.domain, mono: false, hint: 'The wallet adds the site that asked for the signature, so it cannot be passed off as signed elsewhere.' },
        { label: `Message (${b.payload.type})`, value: payloadPreview(b.payload), mono: b.payload.type !== 'text' }
      ])
    }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function finish(kind: BundleResult['kind'], valid: boolean, key: KeyResolution, checks: ProofCheck[], rows: KeyValueItem[]): BundleResult {
  if (key.mismatch) checks.unshift({ label: 'Reported public key', state: 'fail', detail: key.mismatch })
  if (key.warning) checks.unshift({ label: 'Key ownership', state: 'warn', detail: key.warning })
  checks.unshift({ label: 'Ed25519 signature', state: valid ? 'pass' : 'fail', detail: valid ? 'Matches the wallet key' : 'Does not match the wallet key and these fields' })
  rows.push({ label: 'Public key', value: key.publicKey, hint: key.detail })
  return { kind, valid, key, rows, checks }
}

function example(kind: 'signData' | 'proof') {
  text.value = JSON.stringify(kind === 'proof' ? EXAMPLE_PROOF : exampleSignData(), null, 2)
  verifyBundle()
}

const verdict = computed(() => {
  const r = result.value
  if (!r) return null
  if (!r.valid) return { color: 'error' as const, icon: 'i-lucide-shield-x', title: 'Signature is NOT valid', text: 'This wallet did not sign this exact message, or the bundle was edited. Do not trust it.' }
  if (r.key.mismatch || r.checks.some(c => c.state === 'fail')) return { color: 'error' as const, icon: 'i-lucide-shield-alert', title: 'Signature valid, but a check failed', text: 'Read the failed checks below before trusting it.' }
  if (r.key.warning) return { color: 'warning' as const, icon: 'i-lucide-shield-alert', title: 'Valid signature, key not tied to the address', text: r.key.warning }
  return { color: 'success' as const, icon: 'i-lucide-shield-check', title: 'Valid signature', text: 'The owner of this wallet signed exactly this message, for the site shown.' }
})

// ---------------------------------------------------------------- raw Ed25519
const rawMsg = ref('')
const rawEnc = ref<Encoding>('text')
const ENCODINGS = [{ label: 'Text (UTF-8)', value: 'text' }, { label: 'Hex', value: 'hex' }, { label: 'Base64', value: 'base64' }]
const rawSig = ref('')
const rawKey = ref('')
const rawLoading = ref(false)
const rawError = ref<unknown>(null)
const rawResult = shallowRef<{ match: 'message' | 'sha256' | null, publicKey: string, keyNote: string } | null>(null)

async function verifyRawForm() {
  rawError.value = null
  rawResult.value = null
  rawLoading.value = true
  try {
    const msg = decodeBytes(rawMsg.value, rawEnc.value)
    const sig = parseSignature(rawSig.value)
    let publicKey = parsePublicKey(rawKey.value)
    let keyNote = 'Public key you entered'
    if (!publicKey) {
      let addr: Address
      try {
        addr = Address.parse(rawKey.value.trim())
      }
      catch {
        throw new Error('Enter a 32-byte public key (64 hex characters) or a TON wallet address.')
      }
      lookupNet.value = network.value
      publicKey = (await keyLookup(addr.toRawString()))?.toLowerCase() ?? null
      if (!publicKey) throw new Error(`This address has no public key on ${network.value} (not deployed, or not a standard wallet). Paste the public key instead.`)
      keyNote = `Read from the wallet on ${network.value} (get_public_key)`
    }
    rawResult.value = { match: verifyRaw(msg, sig, publicKey), publicKey, keyNote }
  }
  catch (e) {
    rawError.value = e
  }
  finally {
    rawLoading.value = false
  }
}

// RFC 8032 Ed25519 TEST 2: message 0x72.
function rawExample() {
  rawMsg.value = '72'
  rawEnc.value = 'hex'
  rawSig.value = '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'
  rawKey.value = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c'
  verifyRawForm()
}
</script>

<template>
  <UTabs v-model="tab" :items="TABS" variant="link" class="w-full" :ui="{ content: 'pt-5' }">
    <template #bundle>
      <div class="space-y-6">
        <form class="space-y-4" @submit.prevent="verifyBundle">
          <UFormField label="Signature bundle or connect result (JSON)" hint="signData or ton_proof">
            <UTextarea
              v-model="text"
              :rows="8"
              autoresize
              :maxrows="18"
              class="w-full"
              :ui="{ base: 'font-mono text-xs' }"
              placeholder="{ &quot;signature&quot;: &quot;…&quot;, &quot;address&quot;: &quot;0:…&quot;, &quot;timestamp&quot;: …, &quot;domain&quot;: &quot;…&quot;, &quot;payload&quot;: { &quot;type&quot;: &quot;text&quot;, &quot;text&quot;: &quot;…&quot; } }"
              spellcheck="false"
              data-testid="bundle-input"
            />
          </UFormField>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <UButton type="submit" label="Verify" icon="i-lucide-badge-check" :loading="loading" :disabled="!text.trim()" />
            <span class="text-sm text-muted">Try:</span>
            <UButton label="Signed message" variant="link" size="sm" class="px-0" data-testid="try-signdata" @click="example('signData')" />
            <UButton label="Login proof (ton_proof)" variant="link" size="sm" class="px-0" data-testid="try-proof" @click="example('proof')" />
          </div>
          <p class="text-xs text-muted">
            Checked in your browser. Only the signer's public key may be looked up on tonapi.io.
          </p>
        </form>

        <LoadingState v-if="loading" label="Finding the wallet's public key…" />
        <ErrorNotice :error="error" title="Could not verify" @retry="verifyBundle" />

        <template v-if="result && verdict">
          <UAlert :color="verdict.color" variant="subtle" :icon="verdict.icon" :title="verdict.title" :description="verdict.text" data-testid="verdict" />
          <div class="flex flex-wrap items-center gap-3">
            <UBadge color="neutral" variant="subtle" :label="result.kind === 'proof' ? 'TonConnect ton_proof (login)' : 'TonConnect signData'" />
            <UButton v-if="result.kind === 'proof'" to="/tools/ton-proof-verifier" label="See every byte in the ton_proof verifier" variant="link" size="sm" class="px-0" trailing-icon="i-lucide-arrow-right" />
          </div>
          <CheckList :checks="result.checks" />
          <KeyValue :items="result.rows" />
          <ExplorerLinks :value="result.rows[0]!.value" :network="lookupNet" />
        </template>
      </div>
    </template>

    <template #raw>
      <div class="space-y-6">
        <form class="space-y-4" @submit.prevent="verifyRawForm">
          <UFormField label="Message">
            <div class="space-y-2">
              <UTextarea v-model="rawMsg" :rows="3" autoresize class="w-full" :ui="{ base: rawEnc === 'text' ? '' : 'font-mono text-sm' }" spellcheck="false" />
              <URadioGroup v-model="rawEnc" :items="ENCODINGS" orientation="horizontal" size="sm" />
            </div>
          </UFormField>
          <UFormField label="Signature" hint="64 bytes, hex or base64">
            <UInput v-model="rawSig" class="w-full" :ui="{ base: 'font-mono text-sm' }" autocomplete="off" spellcheck="false" />
          </UFormField>
          <UFormField label="Public key or wallet address" hint="An address is resolved on chain">
            <UInput v-model="rawKey" class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="64 hex characters, or UQ…/EQ…" autocomplete="off" spellcheck="false" />
          </UFormField>
          <div class="flex flex-wrap items-center gap-3">
            <UButton type="submit" label="Verify" icon="i-lucide-badge-check" :loading="rawLoading" :disabled="!rawSig.trim() || !rawKey.trim()" />
            <UButton label="Try RFC 8032 test vector" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-raw" @click="rawExample" />
          </div>
        </form>

        <ErrorNotice :error="rawError" title="Could not verify" @retry="verifyRawForm" />
        <template v-if="rawResult">
          <UAlert
            v-if="rawResult.match"
            color="success"
            variant="subtle"
            icon="i-lucide-shield-check"
            title="Valid signature"
            :description="rawResult.match === 'message' ? 'The key signed exactly these bytes.' : 'The key signed the SHA-256 hash of these bytes (not the bytes themselves).'"
            data-testid="raw-verdict"
          />
          <UAlert v-else color="error" variant="subtle" icon="i-lucide-shield-x" title="Signature is NOT valid" description="Neither the message nor its SHA-256 hash was signed by this key. Check the encoding of the message." data-testid="raw-verdict" />
          <ResultField label="Public key" :value="rawResult.publicKey" :hint="rawResult.keyNote" />
        </template>
      </div>
    </template>
  </UTabs>
</template>
