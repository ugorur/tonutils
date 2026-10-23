<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { type ByteFormat, FORMAT_LABELS } from '~/lib/crypto/bytes'
import { convert, detectFormat, OUTPUT_FORMATS } from './logic'

// Wallet v4R2 code hash: the value toncenter/tonapi return as `code_hash` for v4R2 wallets.
const EXAMPLE = '/rX/aCDi/w2Ug+fg1iyBfYRniftK5YDIeIZtlZ2r1cA='

const input = ref('')
const from = ref<ByteFormat | 'auto'>('auto')
const fromItems = [{ label: 'Auto-detect', value: 'auto' }, ...(Object.keys(FORMAT_LABELS) as ByteFormat[]).map(f => ({ label: FORMAT_LABELS[f], value: f }))]

const detected = computed(() => detectFormat(input.value))
const effective = computed<ByteFormat>(() => from.value === 'auto' ? detected.value : from.value)

const result = computed(() => {
  if (!input.value) return null
  try {
    return { ok: true as const, data: convert(input.value, effective.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const HINTS: Partial<Record<ByteFormat, string>> = {
  base64: 'APIs (toncenter, tonapi) return hashes and BOCs like this.',
  base64url: 'URL-safe alphabet (- and _), no padding. Used in friendly addresses and links.',
  base32: 'RFC 4648, lowercase, no padding: the alphabet of .adnl addresses.',
  decimal: 'The bytes read as one unsigned big-endian integer (uint256 for 32 bytes).'
}

const rows = computed<KeyValueItem[]>(() => {
  if (!result.value?.ok) return []
  const { out } = result.value.data
  return OUTPUT_FORMATS.map(f => ({
    label: FORMAT_LABELS[f],
    value: out[f] ?? '',
    mono: f !== 'utf8',
    copy: out[f] !== null,
    hint: f === 'utf8' && out.utf8 === null ? 'Not valid UTF-8 text: these are binary bytes.' : HINTS[f]
  }))
})

const addressRows = computed<KeyValueItem[]>(() => {
  const a = result.value?.ok ? result.value.data.address : null
  if (!a) return []
  return [
    { label: 'Raw (workchain 0)', value: a.raw },
    { label: 'Bounceable', value: a.bounceable },
    { label: 'Non-bounceable', value: a.nonBounceable }
  ]
})

function useOutput(f: ByteFormat) {
  const v = result.value?.ok ? result.value.data.out[f] : null
  if (v == null) return
  input.value = v
  from.value = f
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
        <UFormField label="Value">
          <UTextarea
            v-model="input"
            :rows="3"
            autoresize
            :maxrows="10"
            class="w-full"
            :ui="{ base: 'font-mono text-sm' }"
            placeholder="Hex, base64, base32, a big number, [1, 2, 3] or plain text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>
        <UFormField label="Input is">
          <USelect v-model="from" :items="fromItems" class="w-full sm:w-52" />
        </UFormField>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton v-if="!input" label="Try an example (wallet v4R2 code hash)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = EXAMPLE; from = 'auto'" />
        <UButton v-else label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="input = ''" />
        <span v-if="input && from === 'auto' && result?.ok" class="text-xs text-muted">
          Detected: <span class="font-medium text-highlighted">{{ FORMAT_LABELS[detected] }}</span>. Wrong guess? Pick the format.
        </span>
      </div>
    </div>

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="result?.ok">
      <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
        <UBadge color="neutral" variant="subtle" :label="`${result.data.bytes.length} byte${result.data.bytes.length === 1 ? '' : 's'}`" />
        <span v-if="result.data.bytes.length">{{ result.data.bytes.length * 8 }} bits</span>
      </div>

      <KeyValue :items="rows" />

      <div class="flex flex-wrap gap-2">
        <span class="text-xs text-muted self-center">Use as input:</span>
        <UButton
          v-for="f in OUTPUT_FORMATS.filter(f => f !== effective && result?.ok && result.data.out[f] !== null)"
          :key="f"
          :label="FORMAT_LABELS[f]"
          size="xs"
          color="neutral"
          variant="outline"
          @click="useOutput(f)"
        />
      </div>

      <div v-if="addressRows.length">
        <h3 class="text-sm font-medium text-highlighted">
          As an account hash
        </h3>
        <p class="text-xs text-muted">
          32 bytes is the size of an account id. If this value is one, these are its basechain addresses.
          <NuxtLink to="/tools/address-converter" class="text-primary underline">Address converter</NuxtLink> shows every form.
        </p>
        <KeyValue :items="addressRows" class="mt-1" />
      </div>
    </template>
  </div>
</template>
