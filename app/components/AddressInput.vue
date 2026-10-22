<script setup lang="ts">
import { Address } from '@ton/core'

// Client-only (imports @ton/core): use inside Tool.vue, not in SSR pages.
const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{
  label?: string
  placeholder?: string
  /** Show an error when empty (after the user typed something). */
  required?: boolean
}>(), { label: 'Address', placeholder: 'EQ… / UQ… / 0:…' })
const emit = defineEmits<{
  /** Parsed address, or null when empty/invalid. */
  parsed: [address: Address | null]
}>()

const touched = ref(false)
const parsed = computed(() => {
  const v = model.value.trim()
  if (!v) return { address: null, error: props.required && touched.value ? 'Enter an address' : undefined }
  try {
    return { address: Address.parse(v), error: undefined }
  }
  catch {
    return { address: null, error: 'Not a valid TON address. Use raw (0:…) or user-friendly (EQ…, UQ…) form.' }
  }
})

watch(() => parsed.value.address, a => emit('parsed', a), { immediate: true })
</script>

<template>
  <UFormField :label="label" :error="parsed.error">
    <UInput
      v-model="model"
      :placeholder="placeholder"
      class="w-full"
      size="lg"
      :ui="{ base: 'font-mono text-sm' }"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      @blur="touched = true"
    >
      <template v-if="parsed.address" #trailing>
        <UIcon name="i-lucide-circle-check" class="size-4 text-success" aria-label="Valid address" />
      </template>
    </UInput>
  </UFormField>
</template>
