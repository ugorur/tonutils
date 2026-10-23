<script setup lang="ts">
// BOC text area + .boc file drop + example buttons. A dropped binary file becomes base64 text.
import type { DroppedFile } from '~/components/FileDrop.vue'

const model = defineModel<string>({ required: true })
withDefaults(defineProps<{
  label?: string
  hint?: string
  examples?: { label: string, value: string }[]
}>(), { label: 'BOC', hint: 'base64 (te6cc…), base64url or hex (b5ee9c72…)' })

function onFile(f: DroppedFile) {
  const text = new TextDecoder().decode(f.bytes).trim()
  // A text file holding base64/hex is used as is; anything else is treated as a binary .boc.
  model.value = /^[\w+/=\-\s]+$/.test(text) ? text : Buffer.from(f.bytes).toString('base64')
}
</script>

<template>
  <div class="space-y-2">
    <UFormField :label="label" :hint="hint">
      <UTextarea
        v-model="model"
        :rows="4"
        autoresize
        :maxrows="10"
        class="w-full"
        :ui="{ base: 'font-mono text-xs break-all' }"
        placeholder="te6cckEB…"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </UFormField>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <UButton
        v-for="ex in examples"
        :key="ex.label"
        :label="ex.label"
        icon="i-lucide-sparkles"
        variant="link"
        size="sm"
        class="px-0"
        @click="model = ex.value"
      />
      <UButton v-if="model" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="model = ''" />
    </div>
    <FileDrop v-if="!model" accept=".boc,.txt,application/octet-stream" :max-bytes="5 * 1024 * 1024" label="Or drop a .boc file" @file="onFile" />
  </div>
</template>
