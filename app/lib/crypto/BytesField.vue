<script setup lang="ts">
// A data field plus "is text / hex / base64" select. Parse the value with parseBytes(text, format).
import { FORMAT_LABELS, INPUT_FORMATS, type InputFormat } from './bytes'

withDefaults(defineProps<{ label: string, placeholder?: string, rows?: number, hint?: string }>(), { rows: 1 })
const text = defineModel<string>({ required: true })
const format = defineModel<InputFormat>('format', { required: true })
const items = INPUT_FORMATS.map(f => ({ label: FORMAT_LABELS[f], value: f }))
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
    <UFormField :label="label" :hint="hint">
      <UTextarea
        v-model="text"
        :rows="rows"
        autoresize
        :maxrows="10"
        class="w-full"
        :ui="{ base: format === 'utf8' ? 'text-sm' : 'font-mono text-sm' }"
        :placeholder="placeholder"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </UFormField>
    <UFormField :label="`${label} is`">
      <USelect v-model="format" :items="items" class="w-full sm:w-40" />
    </UFormField>
  </div>
</template>
