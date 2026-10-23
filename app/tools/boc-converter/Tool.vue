<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { downloadBytes } from '~/lib/boc-basics/boc'
import { COMMENT_BODY_BOC, PROOF_BOC_HEX, TX1_BOC } from '~/lib/boc-basics/vectors'
import { inspectBoc, reencode } from './logic'

const EXAMPLES = [
  { label: 'Transaction', value: TX1_BOC },
  { label: 'Comment body', value: COMMENT_BODY_BOC },
  { label: 'Proof (hex, 2 roots)', value: PROOF_BOC_HEX }
]

const input = ref('')
const rootIndex = ref(0)
const idx = ref(false)
const crc32 = ref(true)

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: inspectBoc(input.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const data = computed(() => (result.value?.ok ? result.value.data : null))
watch(data, () => (rootIndex.value = 0))

const FORMAT_LABEL = { hex: 'Hex', base64: 'Base64', base64url: 'Base64url' }

const info = computed<KeyValueItem[]>(() => {
  const d = data.value
  if (!d) return []
  const h = d.header
  const flags = [h.hasIndex && 'index', h.hasCrc32c && 'CRC32C', h.hasCacheBits && 'cache bits'].filter(Boolean).join(', ') || 'none'
  return [
    { label: 'Detected input', value: `${FORMAT_LABEL[d.format]}, ${d.sizeBytes.toLocaleString('en-US')} bytes`, mono: false, copy: false },
    { label: 'Header', value: `${h.magic}; flags: ${flags}; ${h.refBytes}-byte refs, ${h.offsetBytes}-byte offsets`, mono: false, copy: false },
    { label: 'Roots / cells in file', value: `${h.roots} / ${h.cells}${h.absent ? ` (${h.absent} absent)` : ''}`, copy: false },
    { label: 'Distinct cells, data bits, refs', value: `${d.stats.cells} cells, ${d.stats.bits.toLocaleString('en-US')} bits, ${d.stats.refs} refs${d.stats.exotic ? `, ${d.stats.exotic} exotic` : ''}`, copy: false },
    { label: 'Max depth', value: String(d.stats.depth), copy: false },
    ...d.rootHashes.map((hash, i) => ({ label: d.rootHashes.length > 1 ? `Root ${i} hash` : 'Root cell hash', value: hash, hint: i === 0 ? 'Representation hash (hex). For a transaction or message BOC this is its hash.' : undefined }))
  ]
})

const encoded = computed(() => {
  const root = data.value?.roots[rootIndex.value]
  return root ? reencode(root, { idx: idx.value, crc32: crc32.value }) : null
})

const outputs = computed<KeyValueItem[]>(() => {
  const e = encoded.value
  if (!e) return []
  return [
    { label: 'Base64', value: e.base64, hint: 'What APIs, TonConnect and most SDKs expect.' },
    { label: 'Base64url', value: e.base64url, hint: 'URL-safe alphabet (- and _), e.g. for ton:// links.' },
    { label: 'Hex', value: e.hex }
  ]
})

function download() {
  if (encoded.value) downloadBytes(encoded.value.bytes, `cell-${data.value!.rootHashes[rootIndex.value]!.slice(0, 8)}.boc`)
}
</script>

<template>
  <div class="space-y-6">
    <BocInput v-model="input" :examples="EXAMPLES" />

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="data">
      <KeyValue :items="info" />

      <div class="space-y-3 rounded-lg border border-default p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Re-encode
        </h3>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <USelect
            v-if="data.roots.length > 1"
            v-model="rootIndex"
            :items="data.roots.map((_, i) => ({ label: `Root ${i}`, value: i }))"
            class="w-32"
            aria-label="Root to re-encode"
          />
          <UCheckbox v-model="crc32" label="CRC32C checksum" />
          <UCheckbox v-model="idx" label="Cell index" />
          <UButton label="Download .boc" icon="i-lucide-download" color="neutral" variant="outline" size="sm" @click="download" />
        </div>
        <p class="text-xs text-dimmed">
          Default (checksum, no index) gives the usual te6cck… form. The hash never changes; for bigger trees the cell order can differ from
          what a node produced, so the bytes may not match the original.
          <template v-if="data.roots.length > 1">
            Re-encoding writes one root per file.
          </template>
        </p>
        <div class="divide-y divide-default">
          <ResultField v-for="o in outputs" :key="o.label" :label="o.label" :value="o.value" :hint="o.hint">
            <div class="max-h-32 overflow-auto">
              {{ o.value }}
            </div>
          </ResultField>
        </div>
        <p v-if="encoded" class="text-xs text-muted">
          {{ encoded.bytes.length.toLocaleString('en-US') }} bytes
        </p>
      </div>
    </template>
  </div>
</template>
