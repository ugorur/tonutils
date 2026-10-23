<script setup lang="ts">
import type { DroppedFile } from '~/components/FileDrop.vue'
import BytesField from '~/lib/crypto/BytesField.vue'
import { FORMAT_LABELS, type InputFormat, parseBytes } from '~/lib/crypto/bytes'
import { digestMatches, formatDigest, HASH_ALGOS, HASH_INFO, type HashAlgo, hashAll, hmac, type MacHash, methodId, type OutputFormat, OUTPUT_FORMATS, pbkdf2, tlbOp } from './logic'

const tab = ref<'hash' | 'hmac' | 'pbkdf2'>('hash')
const tabs = [
  { label: 'Hash & checksum', value: 'hash' },
  { label: 'HMAC', value: 'hmac' },
  { label: 'PBKDF2', value: 'pbkdf2' }
]

const outFormat = ref<OutputFormat>('hex')
const outItems = OUTPUT_FORMATS.map(f => ({ label: FORMAT_LABELS[f], value: f }))
const macItems: MacHash[] = ['SHA-256', 'SHA-512']

function parse(text: string, format: InputFormat) {
  try {
    return { ok: true as const, bytes: parseBytes(text, format) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

// ---- Hash ----
const source = ref<'input' | 'file'>('input')
const text = ref('')
const format = ref<InputFormat>('utf8')
const file = ref<DroppedFile | null>(null)
const expected = ref('')

const input = computed(() => {
  if (source.value === 'file') return file.value ? { ok: true as const, bytes: file.value.bytes } : null
  return text.value ? parse(text.value, format.value) : null
})
const digests = ref<Record<HashAlgo, Uint8Array> | null>(null)
const hashError = ref<unknown>(null)
const hashing = ref(false)
let hashRun = 0
watch(input, async (v) => {
  const run = ++hashRun
  hashError.value = null
  if (!v?.ok) return (digests.value = null)
  if (source.value === 'file') digests.value = null // never show the previous file's digests
  hashing.value = true
  try {
    const d = await hashAll(v.bytes)
    if (run === hashRun) digests.value = d
  }
  catch (e) {
    if (run === hashRun) [digests.value, hashError.value] = [null, e]
  }
  finally {
    if (run === hashRun) hashing.value = false
  }
}, { immediate: true })
const isText = computed(() => source.value === 'input' && format.value === 'utf8' && text.value.length > 0 && text.value.length <= 200)

function hashExample() {
  source.value = 'input'
  format.value = 'utf8'
  text.value = 'seqno'
}

// ---- HMAC ----
const macKey = ref('')
const macKeyFormat = ref<InputFormat>('utf8')
const macData = ref('')
const macDataFormat = ref<InputFormat>('utf8')
const macHash = ref<MacHash>('SHA-512')
const macResult = ref<{ ok: true, value: Uint8Array } | { ok: false, error: string } | null>(null)
let macRun = 0
watch([macKey, macKeyFormat, macData, macDataFormat, macHash], async () => {
  const run = ++macRun
  const k = parse(macKey.value, macKeyFormat.value)
  const d = parse(macData.value, macDataFormat.value)
  if (!macKey.value && !macData.value) return (macResult.value = null)
  if (!k.ok || !d.ok) return (macResult.value = { ok: false, error: (k.ok ? '' : `Key: ${k.error} `) + (d.ok ? '' : `Message: ${d.error}`) })
  try {
    const value = await hmac(macHash.value, k.bytes, d.bytes)
    if (run === macRun) macResult.value = { ok: true, value }
  }
  catch (e) {
    if (run === macRun) macResult.value = { ok: false, error: (e as Error).message }
  }
})

function hmacExample() {
  // RFC 4231 test case 2.
  macKey.value = 'Jefe'
  macKeyFormat.value = 'utf8'
  macData.value = 'what do ya want for nothing?'
  macDataFormat.value = 'utf8'
}

// ---- PBKDF2 ----
const password = ref('')
const passwordFormat = ref<InputFormat>('utf8')
const salt = ref('')
const saltFormat = ref<InputFormat>('utf8')
const iterations = ref(100000)
const keyLength = ref(64)
const kdfHash = ref<MacHash>('SHA-512')
const kdfRunning = ref(false)
const kdfResult = ref<{ ok: true, value: Uint8Array, ms: number } | { ok: false, error: string } | null>(null)

watch([password, passwordFormat, salt, saltFormat, iterations, keyLength, kdfHash], () => (kdfResult.value = null))

async function derive() {
  const p = parse(password.value, passwordFormat.value)
  const s = parse(salt.value, saltFormat.value)
  if (!p.ok || !s.ok) return (kdfResult.value = { ok: false, error: (p.ok ? '' : `Password: ${p.error} `) + (s.ok ? '' : `Salt: ${s.error}`) })
  kdfRunning.value = true
  const t = performance.now()
  try {
    const value = await pbkdf2(kdfHash.value, p.bytes, s.bytes, iterations.value ?? 0, keyLength.value ?? 0)
    kdfResult.value = { ok: true, value, ms: Math.round(performance.now() - t) }
  }
  catch (e) {
    kdfResult.value = { ok: false, error: (e as Error).message }
  }
  finally {
    kdfRunning.value = false
  }
}

function tonSeedParams() {
  salt.value = 'TON default seed'
  saltFormat.value = 'utf8'
  iterations.value = 100000
  keyLength.value = 64
  kdfHash.value = 'SHA-512'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <UTabs v-model="tab" :items="tabs" :content="false" class="w-full sm:w-auto" />
      <UFormField label="Output as" class="w-full sm:w-auto">
        <USelect v-model="outFormat" :items="outItems" class="w-full sm:w-48" />
      </UFormField>
    </div>

    <!-- Hash & checksum -->
    <section v-if="tab === 'hash'" class="space-y-4">
      <UTabs
        v-model="source"
        :items="[{ label: 'Text or bytes', value: 'input' }, { label: 'File', value: 'file' }]"
        :content="false"
        variant="link"
        size="sm"
      />
      <template v-if="source === 'input'">
        <BytesField v-model="text" v-model:format="format" label="Input" :rows="3" placeholder="Text, or hex / base64 bytes" />
        <UButton v-if="!text" label="Try an example (&quot;seqno&quot;)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="hashExample" />
      </template>
      <template v-else>
        <FileDrop label="Drop a file here or click to choose (up to 100 MB)" :max-bytes="100 * 1024 * 1024" @file="f => (file = f)" />
        <p v-if="file" class="text-sm text-muted">
          <span class="font-medium text-highlighted">{{ file.name }}</span> · {{ file.size.toLocaleString('en-US') }} bytes
        </p>
      </template>

      <UAlert v-if="input && !input.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="input.error" />
      <ErrorNotice v-if="hashError" :error="hashError" />
      <LoadingState v-if="hashing && !digests" label="Hashing…" />

      <template v-if="digests">
        <UFormField label="Expected checksum" hint="optional, any format">
          <UInput v-model="expected" class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="Paste a checksum to compare" spellcheck="false" />
        </UFormField>
        <div class="divide-y divide-default">
          <ResultField
            v-for="a in HASH_ALGOS"
            :key="a"
            :label="`${HASH_INFO[a].label} · ${digests[a].length * 8} bits`"
            :value="formatDigest(digests[a], outFormat)"
            :hint="HASH_INFO[a].hint"
          >
            <span>{{ formatDigest(digests[a], outFormat) }}</span>
            <UBadge v-if="expected && digestMatches(digests[a], expected)" color="success" variant="subtle" size="sm" icon="i-lucide-check" label="Matches" class="ms-2 align-middle" />
          </ResultField>
          <template v-if="isText">
            <ResultField label="Get-method id" :value="String(methodId(text))" :hint="`(crc16 & 0xffff) | 0x10000 = 0x${methodId(text).toString(16)}. The id a contract uses for a get method named &quot;${text}&quot;.`" />
            <ResultField label="TL-B op code" :value="`0x${tlbOp(digests.crc32).toString(16).padStart(8, '0')}`" hint="crc32 & 0x7fffffff, the TEP-74 convention, when the input is a TL-B scheme." />
          </template>
        </div>
        <UAlert v-if="expected && !HASH_ALGOS.some(a => digestMatches(digests![a], expected))" color="warning" variant="subtle" icon="i-lucide-circle-alert" title="The expected value matches none of these digests." />
      </template>
    </section>

    <!-- HMAC -->
    <section v-if="tab === 'hmac'" class="space-y-4">
      <BytesField v-model="macKey" v-model:format="macKeyFormat" label="Key" />
      <BytesField v-model="macData" v-model:format="macDataFormat" label="Message" :rows="3" />
      <div class="flex flex-wrap items-center gap-4">
        <URadioGroup v-model="macHash" :items="macItems" orientation="horizontal" />
        <UButton v-if="!macKey && !macData" label="Try an example (RFC 4231)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="hmacExample" />
      </div>
      <UAlert v-if="macResult && !macResult.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="macResult.error" />
      <ResultField v-else-if="macResult?.ok" :label="`HMAC-${macHash}`" :value="formatDigest(macResult.value, outFormat)" />
    </section>

    <!-- PBKDF2 -->
    <section v-if="tab === 'pbkdf2'" class="space-y-4">
      <BytesField v-model="password" v-model:format="passwordFormat" label="Password" />
      <BytesField v-model="salt" v-model:format="saltFormat" label="Salt" />
      <div class="grid gap-3 sm:grid-cols-3">
        <UFormField label="Iterations">
          <UInputNumber v-model="iterations" :min="1" :max="10000000" :format-options="{ useGrouping: false }" class="w-full" />
        </UFormField>
        <UFormField label="Key length (bytes)">
          <UInputNumber v-model="keyLength" :min="1" :max="1024" class="w-full" />
        </UFormField>
        <UFormField label="Hash">
          <USelect v-model="kdfHash" :items="macItems" class="w-full" />
        </UFormField>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton label="Derive key" icon="i-lucide-key-round" :loading="kdfRunning" @click="derive" />
        <UButton label="Use TON seed parameters" variant="link" size="sm" class="px-0" @click="tonSeedParams" />
      </div>
      <p class="text-xs text-muted">
        TON mnemonics derive their seed with PBKDF2-HMAC-SHA512, salt "TON default seed", 100,000 iterations, 64 bytes.
        The password there is HMAC-SHA512(key = the words joined by spaces, message = empty), not the words themselves.
      </p>
      <UAlert v-if="kdfResult && !kdfResult.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="kdfResult.error" />
      <ResultField v-else-if="kdfResult?.ok" :label="`PBKDF2-HMAC-${kdfHash} · ${kdfResult.value.length} bytes`" :value="formatDigest(kdfResult.value, outFormat)" :hint="`Took ${kdfResult.ms} ms.`" />
    </section>
  </div>
</template>
