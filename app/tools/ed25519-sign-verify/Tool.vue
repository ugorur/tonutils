<script setup lang="ts">
import { getSecureRandomBytes } from '@ton/crypto'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import BytesField from '~/lib/crypto/BytesField.vue'
import { encodeBytes, type InputFormat, toHex } from '~/lib/crypto/bytes'
import { DEFAULT_SAFE_SEED, type Keys, parsePrivateKey, prepareMessage, type SignMode, signMessage, verifyMessage, verifyWalletBody } from './logic'

type Tab = 'sign' | 'verify' | 'wallet'
const tab = ref<Tab>('sign')
const tabs = [
  { label: 'Sign', value: 'sign' },
  { label: 'Verify', value: 'verify' },
  { label: 'Wallet message', value: 'wallet' }
]

// ---- Message (shared by Sign and Verify) ----
const mode = ref<SignMode>('data')
const modes = [
  { label: 'Text or bytes', value: 'data', description: 'Sign the data exactly as entered.' },
  { label: 'Cell hash', value: 'cell', description: 'Sign the 256-bit hash of a cell, as wallets sign their messages.' },
  { label: 'Safe sign', value: 'safe', description: '@ton/core safeSign: a signature that can never be replayed as a wallet message.' }
]
const data = ref('')
const format = ref<InputFormat>('utf8')
const boc = ref('')
const safeSeed = ref(DEFAULT_SAFE_SEED)
const useDomain = ref(false)
const globalId = ref<number | null>(null)

const prepared = computed(() => {
  if (mode.value !== 'data' && !boc.value.trim()) return null
  try {
    return {
      ok: true as const,
      value: prepareMessage({
        mode: mode.value,
        data: data.value,
        format: format.value,
        boc: boc.value,
        safeSeed: safeSeed.value,
        globalId: useDomain.value && mode.value !== 'safe' ? (globalId.value ?? Number.NaN) : null
      })
    }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const preparedRows = computed<KeyValueItem[]>(() => {
  const p = prepared.value?.ok ? prepared.value.value : null
  if (!p) return []
  const rows: KeyValueItem[] = []
  if (p.cellHash) rows.push({ label: 'Cell hash', value: toHex(p.cellHash) })
  if (p.domainPrefix) rows.push({ label: 'Domain prefix', value: toHex(p.domainPrefix), hint: 'sha256 of the signature domain, prepended to the data.' })
  rows.push({
    label: `Bytes that get signed (${p.signed.length})`,
    value: toHex(p.signed),
    hint: mode.value === 'safe' ? 'sha256(0xffff ++ seed ++ cell hash)' : undefined
  })
  return rows
})

// ---- Sign ----
const privateKey = ref('')
const showKey = ref(false)
const keys = ref<{ ok: true, value: Keys } | { ok: false, error: string } | null>(null)
let keyRun = 0
watch(privateKey, async (v) => {
  const run = ++keyRun
  if (!v.trim()) {
    keys.value = null
    return
  }
  try {
    const value = await parsePrivateKey(v)
    if (run === keyRun) keys.value = { ok: true, value }
  }
  catch (e) {
    if (run === keyRun) keys.value = { ok: false, error: (e as Error).message }
  }
})

async function generateKey() {
  privateKey.value = toHex(await getSecureRandomBytes(32))
  showKey.value = true
}

const SOURCE_LABEL = { seed: '32-byte private key', secret: '64-byte secret key', mnemonic: 'TON mnemonic' }

const signature = computed(() => {
  if (!keys.value?.ok || !prepared.value?.ok) return null
  return signMessage(prepared.value.value, keys.value.value.secretKey)
})

const signRows = computed<KeyValueItem[]>(() => {
  if (!keys.value?.ok) return []
  const rows: KeyValueItem[] = [{ label: 'Public key', value: toHex(keys.value.value.publicKey), hint: `Derived from the ${SOURCE_LABEL[keys.value.value.source]}. Safe to share.` }]
  if (signature.value) {
    rows.push(
      { label: 'Signature (hex)', value: toHex(signature.value) },
      { label: 'Signature (base64)', value: encodeBytes(signature.value, 'base64')! }
    )
  }
  return rows
})

function checkInVerify() {
  if (!keys.value?.ok || !signature.value) return
  publicKey.value = toHex(keys.value.value.publicKey)
  sigInput.value = toHex(signature.value)
  tab.value = 'verify'
}

// ---- Verify ----
const publicKey = ref('')
const sigInput = ref('')
const verification = computed(() => {
  if (!publicKey.value.trim() || !sigInput.value.trim() || !prepared.value?.ok) return null
  try {
    return { ok: true as const, valid: verifyMessage(prepared.value.value, sigInput.value, publicKey.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function verifyExample() {
  // RFC 8032 section 7.1, TEST 2: the message is the single byte 0x72.
  mode.value = 'data'
  format.value = 'hex'
  data.value = '72'
  useDomain.value = false
  publicKey.value = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c'
  sigInput.value = '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'
}

// ---- Wallet message ----
const bodyBoc = ref('')
const walletPub = ref('')
// Mainnet wallet v4r2 demigods.ton: the external message body of one of its transfers, and its get_public_key.
const EXAMPLE_BODY = 'te6cckEBAgEAogABnBD3pBjkMH78vDEEyRefSXgIxZVY136q872j2lEQQF4CiofJQHeJfyxl3YLAfLMMkCRIw+4h2LA/Hm95vuvTnAUpqaMXatkkfgAAA14AAwEAnkIAMSTIUU8hSyp59rCJMJqa9B1yYMdc2bMi4io529ubAJ4o+3UEMAAAAAAAAAAAAAAAAAAAAAAAAFQ2RVhzUk12cjNuWmpweDRRcGJ4NDFKpfgX'
const exampleTx = computed(() => bodyBoc.value === EXAMPLE_BODY ? 'ic5v6rptswpKyqaAAWAHbgYTCrMRZOvD7mJUFQJRb08=' : '')
const walletCheck = computed(() => {
  if (!bodyBoc.value.trim() || !walletPub.value.trim()) return null
  try {
    return { ok: true as const, value: verifyWalletBody(bodyBoc.value, walletPub.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const walletRows = computed<KeyValueItem[]>(() => {
  const r = walletCheck.value?.ok ? walletCheck.value.value : null
  if (!r) return []
  return [
    { label: 'Signature', value: toHex(r.signature), hint: r.layout === 'signature-first' ? 'First 512 bits of the body (wallet v3, v4, highload v2).' : 'Last 512 bits of the body (wallet W5 / v5r1).' },
    { label: 'Signed hash', value: toHex(r.signedHash), hint: 'Hash of the body without the signature.' }
  ]
})

function walletExample() {
  bodyBoc.value = EXAMPLE_BODY
  walletPub.value = '3e8982e754e70f1a488a0e401f9fe0f858368fce47103e8d3df4cd1ac3997ac7'
}

const monoUi = { base: 'font-mono text-sm' }
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" />

    <!-- Message: shared by Sign and Verify -->
    <section v-if="tab !== 'wallet'" class="space-y-4">
      <UFormField label="What to sign">
        <URadioGroup v-model="mode" :items="modes" orientation="vertical" />
      </UFormField>

      <BytesField v-if="mode === 'data'" v-model="data" v-model:format="format" label="Message" :rows="3" placeholder="Text, or hex / base64 bytes" />
      <template v-else>
        <UFormField label="Cell (BOC)" hint="base64 or hex">
          <UTextarea v-model="boc" :rows="3" autoresize :maxrows="8" class="w-full" :ui="monoUi" placeholder="te6cc…" spellcheck="false" />
        </UFormField>
        <UFormField v-if="mode === 'safe'" label="Safe-sign seed" description="8 to 64 bytes. Keep the default unless the verifier uses another seed.">
          <UInput v-model="safeSeed" class="w-full" :ui="monoUi" />
        </UFormField>
      </template>

      <div v-if="mode !== 'safe'" class="space-y-2">
        <USwitch v-model="useDomain" label="Signature domain (L2 network)" description="TON mainnet and testnet use no domain. Some L2 networks prepend a domain hash derived from their global id." />
        <UFormField v-if="useDomain" label="Network global id">
          <UInputNumber v-model="globalId" :format-options="{ useGrouping: false }" placeholder="e.g. 2000" class="w-full sm:w-48" />
        </UFormField>
      </div>

      <UAlert v-if="prepared && !prepared.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="prepared.error" />
      <KeyValue v-else-if="preparedRows.length" :items="preparedRows" />
    </section>

    <!-- Sign -->
    <section v-if="tab === 'sign'" class="space-y-3">
      <UFormField label="Private key" description="32-byte private key or 64-byte secret key (hex or base64), or a 24-word TON mnemonic.">
        <UInput
          v-model="privateKey"
          :type="showKey ? 'text' : 'password'"
          class="w-full"
          :ui="{ base: 'font-mono text-sm', trailing: 'pe-1' }"
          autocomplete="off"
          spellcheck="false"
          placeholder="Never paste the key of a wallet that holds funds on a device you don't trust"
        >
          <template #trailing>
            <UButton
              :icon="showKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="showKey ? 'Hide key' : 'Show key'"
              color="neutral"
              variant="link"
              size="sm"
              @click="showKey = !showKey"
            />
          </template>
        </UInput>
      </UFormField>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <UButton label="Generate a random test key" icon="i-lucide-dices" variant="link" size="sm" class="px-0" @click="generateKey" />
        <UButton v-if="privateKey" label="Clear key" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="privateKey = ''; showKey = false" />
      </div>

      <UAlert v-if="keys && !keys.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="keys.error" />
      <template v-if="keys?.ok">
        <KeyValue :items="signRows" />
        <p v-if="!signature" class="text-sm text-muted">
          Enter a message above to sign it.
        </p>
        <UButton v-else label="Check it in Verify" icon="i-lucide-shield-check" color="neutral" variant="outline" size="sm" @click="checkInVerify" />
      </template>
    </section>

    <!-- Verify -->
    <section v-if="tab === 'verify'" class="space-y-3">
      <UFormField label="Public key" description="32 bytes, hex or base64.">
        <UInput v-model="publicKey" class="w-full" :ui="monoUi" spellcheck="false" autocomplete="off" />
      </UFormField>
      <UFormField label="Signature" description="64 bytes, hex or base64.">
        <UTextarea v-model="sigInput" :rows="2" autoresize class="w-full" :ui="monoUi" spellcheck="false" />
      </UFormField>
      <UButton v-if="!publicKey && !sigInput" label="Try an example (RFC 8032 test vector)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="verifyExample" />

      <UAlert v-if="verification && !verification.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="verification.error" />
      <UAlert
        v-else-if="verification?.ok"
        :color="verification.valid ? 'success' : 'error'"
        variant="subtle"
        :icon="verification.valid ? 'i-lucide-shield-check' : 'i-lucide-shield-x'"
        :title="verification.valid ? 'Valid signature' : 'Invalid signature'"
        :description="verification.valid ? 'This public key signed exactly these bytes.' : 'Wrong key, wrong signature, or the message (mode, format, domain) differs from what was signed.'"
      />
      <p v-else-if="publicKey && sigInput && !prepared" class="text-sm text-muted">
        Paste the cell above.
      </p>
    </section>

    <!-- Wallet message -->
    <section v-if="tab === 'wallet'" class="space-y-3">
      <p class="text-sm text-muted">
        Check who signed a wallet transaction. Paste the body of the external message (the in_msg body of the wallet's transaction) and the wallet's public key
        (its <span class="font-mono">get_public_key</span> result). Works for wallet v3, v4, W5 and highload v2.
      </p>
      <UFormField label="External message body (BOC)" hint="base64 or hex">
        <UTextarea v-model="bodyBoc" :rows="3" autoresize :maxrows="8" class="w-full" :ui="monoUi" placeholder="te6cc…" spellcheck="false" />
      </UFormField>
      <UFormField label="Wallet public key" description="32 bytes, hex or base64.">
        <UInput v-model="walletPub" class="w-full" :ui="monoUi" spellcheck="false" autocomplete="off" />
      </UFormField>
      <UButton v-if="!bodyBoc && !walletPub" label="Try an example (a mainnet wallet v4R2 transfer)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="walletExample" />

      <UAlert v-if="walletCheck && !walletCheck.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="walletCheck.error" />
      <template v-else-if="walletCheck?.ok">
        <UAlert
          :color="walletCheck.value.valid ? 'success' : 'error'"
          variant="subtle"
          :icon="walletCheck.value.valid ? 'i-lucide-shield-check' : 'i-lucide-shield-x'"
          :title="walletCheck.value.valid ? 'Signed by this public key' : 'Not signed by this public key'"
          :description="walletCheck.value.valid ? undefined : 'Neither layout (signature first or last) verifies. Check the key, or the body may come from another wallet type.'"
        />
        <KeyValue :items="walletRows" />
        <div v-if="exampleTx" class="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          Example transaction: <ExplorerLinks kind="tx" :value="exampleTx" network="mainnet" />
        </div>
      </template>
    </section>
  </div>
</template>
