<script setup lang="ts">
import { nanoToTon, tonToNano } from './logic'

// Auto-imported from ~/utils/currency: COIN_SYMBOL, NANO_NAME, NANO_FORMER

const ton = ref('1')
const nano = ref('')
const error = ref<{ field: 'ton' | 'nano', message: string } | null>(null)

// Two linked fields: editing one recomputes the other. `source` stops the echo.
let source: 'ton' | 'nano' | null = null

function run(field: 'ton' | 'nano', fn: () => void) {
  if (source && source !== field) return
  source = field
  try {
    fn()
    error.value = null
  }
  catch (e) {
    error.value = { field, message: (e as Error).message }
  }
  nextTick(() => (source = null))
}

watch(ton, v => run('ton', () => {
  nano.value = v.trim() ? tonToNano(v).nano.toString() : ''
}), { immediate: true })

watch(nano, v => run('nano', () => {
  ton.value = v.trim() ? nanoToTon(v).ton : ''
}))

const summary = computed(() => {
  if (error.value || !nano.value) return null
  try {
    return nanoToTon(nano.value)
  }
  catch {
    return null
  }
})

const presets = ['0.05', '1', '1000']
</script>

<template>
  <div class="space-y-6">
    <div class="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
      <UFormField :label="COIN_SYMBOL" :error="error?.field === 'ton' ? error.message : undefined">
        <UInput v-model="ton" inputmode="decimal" size="xl" class="w-full" :ui="{ base: 'font-mono' }" autocomplete="off" :aria-label="`Amount in ${COIN_SYMBOL}`" />
      </UFormField>
      <UIcon name="i-lucide-arrow-left-right" class="mx-auto size-5 text-dimmed sm:mt-10" aria-hidden="true" />
      <UFormField :label="NANO_NAME" :hint="`also called ${NANO_FORMER}`" :error="error?.field === 'nano' ? error.message : undefined">
        <UInput v-model="nano" inputmode="numeric" size="xl" class="w-full" :ui="{ base: 'font-mono' }" autocomplete="off" :aria-label="`Amount in ${NANO_NAME}`" />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">Quick fill:</span>
      <UButton v-for="p in presets" :key="p" :label="`${p} ${COIN_SYMBOL}`" size="xs" color="neutral" variant="outline" @click="ton = p" />
    </div>

    <KeyValue
      v-if="summary"
      :items="[
        { label: `${COIN_SYMBOL}, formatted`, value: `${summary.tonFormatted} ${COIN_SYMBOL}`, copy: false },
        { label: `${NANO_NAME}, formatted`, value: summary.nanoFormatted, copy: false },
        { label: 'For code (bigint)', value: `${summary.nano}n`, hint: 'toNano() in @ton/core returns this value.' }
      ]"
    />
    <p class="text-xs text-dimmed">
      {{ COIN_RENAME_NOTE }} 1 {{ COIN_SYMBOL }} = 1,000,000,000 {{ NANO_NAME }} ({{ NANO_FORMER }}).
    </p>
  </div>
</template>
