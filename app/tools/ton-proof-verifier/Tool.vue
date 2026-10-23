<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import CheckList from '~/lib/security-signing/CheckList.vue'
import { tonapiKeyLookup } from '~/lib/security-signing/chain'
import type { KeyResolution, ProofCheck, ProofInput, ProofSteps } from './logic'
import { EXAMPLE_PROOF, NETWORK_NAMES, parseProofInput, proofChecks, proofSteps, resolvePublicKey, verifyProof } from './logic'

const { network } = useTonNetwork()
// The proof says which network it came from; read the key there, not on the site's network.
const proofNet = ref(network.value)
const keyLookup = tonapiKeyLookup(useTonapi(proofNet))

const text = ref('')
const expectedDomain = ref('')
const expectedPayload = ref('')
const maxAgeMin = ref(15)
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<{ input: ProofInput, steps: ProofSteps, key: KeyResolution, valid: boolean, checks: ProofCheck[] } | null>(null)

async function run() {
  error.value = null
  result.value = null
  loading.value = true
  try {
    const input = parseProofInput(text.value)
    const steps = proofSteps(input)
    const named = NETWORK_NAMES[input.network ?? '']
    proofNet.value = named === 'testnet' || named === 'mainnet' ? named : network.value
    const key = await resolvePublicKey(input, keyLookup)
    const valid = verifyProof(input, key.publicKey)
    const checks = proofChecks(input, { maxAgeSec: Math.max(1, maxAgeMin.value) * 60, expectedDomain: expectedDomain.value.trim(), expectedPayload: expectedPayload.value })
    if (key.mismatch) checks.unshift({ label: 'Reported public key', state: 'fail', detail: key.mismatch })
    if (key.warning) checks.unshift({ label: 'Key ownership', state: 'warn', detail: key.warning })
    result.value = { input, steps, key, valid, checks }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function example() {
  text.value = JSON.stringify(EXAMPLE_PROOF, null, 2)
  expectedDomain.value = 'ton-connect.github.io'
  expectedPayload.value = '1747303885:'
  run()
}

const verdict = computed(() => {
  const r = result.value
  if (!r) return null
  if (!r.valid) return { color: 'error' as const, icon: 'i-lucide-shield-x', title: 'Invalid signature', text: 'The signature does not match these fields and this public key. Reject the login.' }
  if (r.checks.some(c => c.state === 'fail')) return { color: 'error' as const, icon: 'i-lucide-shield-alert', title: 'Signature valid, but a check failed', text: 'The wallet key really signed this, but your backend must still reject it (see the failed checks).' }
  if (r.checks.some(c => c.state === 'warn')) return { color: 'warning' as const, icon: 'i-lucide-shield-alert', title: 'Signature valid, with warnings', text: 'The cryptography is correct. Review the warnings before trusting the login.' }
  return { color: 'success' as const, icon: 'i-lucide-shield-check', title: 'Proof valid', text: 'The owner of this wallet signed this proof for this domain and payload.' }
})

const keyRows = computed<KeyValueItem[]>(() => {
  const r = result.value
  if (!r) return []
  return [
    { label: 'Wallet address', value: r.input.address },
    { label: 'Public key', value: r.key.publicKey, hint: r.key.detail },
    { label: 'Signature (hex)', value: Buffer.from(r.input.proof.signature, 'base64').toString('hex'), hint: `${Buffer.from(r.input.proof.signature, 'base64').length} bytes (Ed25519 needs 64)` }
  ]
})
const hashRows = computed<KeyValueItem[]>(() => {
  const s = result.value?.steps
  if (!s) return []
  return [
    { label: '1. message (hex)', value: s.message, hint: `${s.message.length / 2} bytes: the parts above, concatenated` },
    { label: '2. sha256(message)', value: s.messageHash },
    { label: '3. 0xffff ++ "ton-connect" ++ sha256(message)', value: s.preimage },
    { label: '4. sha256 of step 3 (what the key signs)', value: s.signedHash, hint: 'signature = Ed25519Sign(privateKey, this hash)' }
  ]
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="run">
      <UFormField label="Connect result (JSON)" hint="CheckProofRequest, wallet object or ConnectEvent">
        <UTextarea
          v-model="text"
          :rows="8"
          autoresize
          :maxrows="18"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="{ &quot;address&quot;: &quot;0:…&quot;, &quot;network&quot;: &quot;-239&quot;, &quot;proof&quot;: { &quot;timestamp&quot;: …, &quot;domain&quot;: { &quot;lengthBytes&quot;: …, &quot;value&quot;: &quot;…&quot; }, &quot;payload&quot;: &quot;…&quot;, &quot;signature&quot;: &quot;…&quot;, &quot;state_init&quot;: &quot;…&quot; } }"
          spellcheck="false"
          data-testid="proof-input"
        />
      </UFormField>

      <details class="group rounded-md border border-default">
        <summary class="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-highlighted">
          Backend checks (optional)
          <UIcon name="i-lucide-chevron-down" class="size-4 transition group-open:rotate-180" />
        </summary>
        <div class="grid gap-4 border-t border-default p-4 sm:grid-cols-3">
          <UFormField label="Your domain" hint="Host of your manifest url">
            <UInput v-model="expectedDomain" placeholder="app.example.com" class="w-full" autocomplete="off" />
          </UFormField>
          <UFormField label="Payload you issued">
            <UInput v-model="expectedPayload" placeholder="nonce from your server" class="w-full" autocomplete="off" />
          </UFormField>
          <UFormField label="Max age (minutes)">
            <UInput v-model.number="maxAgeMin" type="number" min="1" class="w-full" />
          </UFormField>
        </div>
      </details>

      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" label="Verify proof" icon="i-lucide-shield-check" :loading="loading" :disabled="!text.trim()" />
        <UButton label="Try a real proof" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example" />
      </div>
      <p class="text-xs text-muted">
        Everything is computed in your browser. Only when the input has no usable walletStateInit is the wallet's public key looked up on tonapi.io.
      </p>
    </form>

    <LoadingState v-if="loading" label="Finding the wallet's public key…" />
    <ErrorNotice :error="error" title="Could not verify" @retry="run" />

    <template v-if="result && verdict">
      <UAlert :color="verdict.color" variant="subtle" :icon="verdict.icon" :title="verdict.title" :description="verdict.text" data-testid="verdict" />

      <section class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Checks
        </h3>
        <CheckList :checks="[{ label: 'Ed25519 signature', state: result.valid ? 'pass' : 'fail', detail: result.valid ? 'Matches the public key' : 'Does not match the public key' }, ...result.checks]" />
      </section>

      <section>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Key and signature
        </h3>
        <KeyValue :items="keyRows" />
      </section>

      <section class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Signed message, part by part
        </h3>
        <div class="divide-y divide-default rounded-md border border-default">
          <div v-for="p in result.steps.parts" :key="p.label" class="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr]">
            <div>
              <div class="text-sm text-highlighted">
                {{ p.label }}
              </div>
              <div class="text-xs break-words text-muted">
                {{ p.note }}
              </div>
            </div>
            <div class="font-mono text-xs break-all text-highlighted">
              {{ p.hex || '(empty)' }}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Hashes
        </h3>
        <KeyValue :items="hashRows" />
      </section>
    </template>
  </div>
</template>
