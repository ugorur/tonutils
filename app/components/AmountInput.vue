<script setup lang="ts">
// Decimal amount input with exact bigint parsing. v-model is the text, v-model:nano the base units.
const model = defineModel<string>({ default: '' })
const nano = defineModel<bigint | null>('nano', { default: null })
const props = withDefaults(defineProps<{
  label?: string
  /** Unit shown in the field. */
  unit?: string
  /** Decimal places of the unit (TON = 9, USDT = 6). */
  decimals?: number
  placeholder?: string
}>(), { label: 'Amount', unit: 'TON', decimals: 9, placeholder: '0.0' })

const error = computed(() => {
  if (!model.value.trim()) return undefined
  try {
    parseUnits(model.value, props.decimals)
    return undefined
  }
  catch (e) {
    return (e as Error).message
  }
})

watch([model, () => props.decimals], () => {
  try {
    nano.value = model.value.trim() ? parseUnits(model.value, props.decimals) : null
  }
  catch {
    nano.value = null
  }
}, { immediate: true })
</script>

<template>
  <UFormField :label="label" :error="error">
    <UInput
      v-model="model"
      inputmode="decimal"
      :placeholder="placeholder"
      class="w-full"
      size="lg"
      :ui="{ base: 'font-mono' }"
      autocomplete="off"
    >
      <template #trailing>
        <span class="text-xs text-muted">{{ unit }}</span>
      </template>
    </UInput>
  </UFormField>
</template>
