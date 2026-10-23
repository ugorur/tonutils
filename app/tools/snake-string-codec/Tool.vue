<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { encodeBoc, parseRoots } from '~/lib/boc-basics/boc'
import { COMMENT_BODY_BOC, VODKA_DESC_BOC, VODKA_META } from '~/lib/boc-basics/vectors'
import type { SnakeFormat } from './logic'
import { decodeSnake, encodeSnake, FORMAT_LABEL, MAX_CELL_DEPTH, parseHexBytes } from './logic'

const mode = ref<'encode' | 'decode'>('encode')
const formatItems = (Object.keys(FORMAT_LABEL) as SnakeFormat[]).map(v => ({ label: FORMAT_LABEL[v], value: v }))

// ---------------------------------------------------------------- encode
const text = ref('')
const inputKind = ref<'text' | 'hex'>('text')
const format = ref<SnakeFormat>('comment')

const encoded = computed(() => {
  if (!text.value) return null
  try {
    const bytes = inputKind.value === 'hex' ? parseHexBytes(text.value) : new TextEncoder().encode(text.value)
    const cell = encodeSnake(bytes, format.value)
    return { ok: true as const, bytes: bytes.length, cell, boc: encodeBoc(cell), check: decodeSnake(cell, format.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const encodedItems = computed<KeyValueItem[]>(() => {
  const e = encoded.value
  if (!e?.ok) return []
  return [
    { label: 'Size', value: `${e.bytes} bytes of data in ${e.check.cells} cell${e.check.cells > 1 ? 's' : ''}`, copy: false, mono: false },
    { label: 'BOC (base64)', value: e.boc.base64, hint: 'Use as a message payload / forward payload, or store in contract data.' },
    { label: 'BOC (hex)', value: e.boc.hex },
    { label: 'Cell hash', value: e.cell.hash().toString('hex') }
  ]
})

// ---------------------------------------------------------------- decode
const boc = ref('')
const decodeAs = ref<SnakeFormat | 'auto'>('auto')
const decoded = computed(() => {
  if (!boc.value.trim()) return null
  try {
    const d = decodeSnake(parseRoots(boc.value)[0]!, decodeAs.value)
    return { ok: true as const, ...d, hex: Buffer.from(d.bytes).toString('hex') }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'Encode', value: 'encode', icon: 'i-lucide-arrow-down-to-line' }, { label: 'Decode', value: 'decode', icon: 'i-lucide-arrow-up-from-line' }]"
      class="w-full"
    />

    <template v-if="mode === 'encode'">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Format">
          <USelect v-model="format" :items="formatItems" class="w-full" />
        </UFormField>
        <UFormField label="Input is">
          <USelect v-model="inputKind" :items="[{ label: 'Text (UTF-8)', value: 'text' }, { label: 'Hex bytes', value: 'hex' }]" class="w-full" />
        </UFormField>
      </div>
      <div class="space-y-2">
        <UFormField :label="inputKind === 'hex' ? 'Bytes (hex)' : 'Text'" :hint="text ? `${text.length} characters` : undefined">
          <UTextarea v-model="text" :rows="4" autoresize :maxrows="12" class="w-full" :ui="{ base: inputKind === 'hex' ? 'font-mono text-xs' : '' }" placeholder="Type or paste text" />
        </UFormField>
        <div class="flex flex-wrap gap-x-4">
          <UButton label="Try a jetton description" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="inputKind = 'text'; format = 'snake'; text = VODKA_META.description" />
          <UButton v-if="text" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="text = ''" />
        </div>
      </div>
      <UAlert v-if="encoded && !encoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="encoded.error" />
      <template v-if="encoded?.ok">
        <UAlert
          v-if="encoded.cell.depth() > MAX_CELL_DEPTH"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Too deep for the TON network"
          :description="`This chain is ${encoded.cell.depth()} cells deep, but TVM rejects cells deeper than ${MAX_CELL_DEPTH}. Use the chunked format or store less data.`"
        />
        <KeyValue :items="encodedItems" />
        <div>
          <div class="mb-1 text-xs text-muted">
            Cell layout (fift notation)
          </div>
          <pre class="max-h-72 overflow-auto rounded-lg bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap text-muted">{{ encoded.cell.toString() }}</pre>
        </div>
      </template>
      <p class="text-xs text-dimmed">
        Each cell holds 1023 bits, so 127 bytes; the first cell has less room after the prefix and the rest continues in ref 0
        (the same layout as storeStringTail in @ton/core). Text comments are what wallets show as a message comment; on-chain
        token metadata (TEP-64) uses snake (0x00) or chunked (0x01) values.
      </p>
    </template>

    <template v-else>
      <BocInput
        v-model="boc"
        :examples="[{ label: 'Comment (2 cells)', value: COMMENT_BODY_BOC }, { label: 'Jetton metadata value', value: VODKA_DESC_BOC }]"
      />
      <UFormField label="Read as" class="sm:w-80">
        <USelect v-model="decodeAs" :items="[{ label: 'Detect automatically', value: 'auto' }, ...formatItems]" class="w-full" />
      </UFormField>
      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />
      <template v-if="decoded?.ok">
        <div class="flex flex-wrap gap-2">
          <UBadge color="neutral" variant="subtle" :label="FORMAT_LABEL[decoded.format]" />
          <UBadge color="neutral" variant="subtle" :label="`${decoded.bytes.length} bytes`" />
          <UBadge color="neutral" variant="subtle" :label="`${decoded.cells} cell${decoded.cells > 1 ? 's' : ''}`" />
          <UBadge v-if="decoded.text === null" color="warning" variant="subtle" label="not valid UTF-8" />
        </div>
        <ResultField v-if="decoded.text !== null" label="Text" :value="decoded.text" :mono="false">
          <span class="whitespace-pre-wrap">{{ decoded.text || '(empty)' }}</span>
        </ResultField>
        <ResultField label="Bytes (hex)" :value="decoded.hex" />
      </template>
    </template>
  </div>
</template>
