<script setup lang="ts">
import type { PayloadKind } from './common'
import { PAYLOAD_KINDS } from './common'

// "None / text comment / custom BOC" picker used for forward payloads.
const kind = defineModel<PayloadKind>('kind', { default: 'none' })
const text = defineModel<string>('text', { default: '' })
defineProps<{ label: string, hint?: string, error?: string }>()
</script>

<template>
  <UFormField :label="label" :hint="hint" :error="error">
    <div class="space-y-2">
      <URadioGroup v-model="kind" orientation="horizontal" :items="PAYLOAD_KINDS" />
      <UInput v-if="kind === 'comment'" v-model="text" placeholder="Comment shown to the recipient" class="w-full" />
      <UTextarea v-else-if="kind === 'boc'" v-model="text" placeholder="te6cc… or b5ee9c72…" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
    </div>
  </UFormField>
</template>
