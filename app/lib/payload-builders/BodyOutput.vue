<script setup lang="ts">
import type { Cell } from '@ton/core'
import { bocOut } from './common'

// Built body as base64 / hex BOC with copy buttons, plus an optional ton:// deep link.
const props = defineProps<{ body: Cell, link?: string | null, label?: string }>()
const out = computed(() => bocOut(props.body))
</script>

<template>
  <div class="divide-y divide-default rounded-lg border border-default px-4" data-testid="body-output">
    <ResultField :label="`${label ?? 'Message body'} (base64 BOC)`" :value="out.base64" />
    <ResultField label="Hex BOC" :value="out.hex" />
    <ResultField label="Cell hash" :value="out.hash" />
    <ResultField v-if="link" label="ton:// transfer link" :value="link" hint="Opens a TON wallet with this exact message pre-filled (Tonkeeper and others)." />
  </div>
</template>
