<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: string
  /** Monospace value (addresses, hashes, numbers). */
  mono?: boolean
  /** Show a copy button. */
  copy?: boolean
  /** Small helper text under the value. */
  hint?: string
}>(), { mono: true, copy: true })
</script>

<template>
  <div class="group flex items-start gap-3 py-2.5">
    <div class="min-w-0 flex-1">
      <div class="text-xs text-muted">
        {{ label }}
      </div>
      <div class="mt-0.5 text-sm text-highlighted" :class="mono ? 'font-mono break-all' : 'break-words'">
        <slot>{{ value || '—' }}</slot>
      </div>
      <div v-if="hint" class="mt-0.5 text-xs text-dimmed">
        {{ hint }}
      </div>
    </div>
    <CopyButton v-if="copy && value" :value="value" class="shrink-0" />
  </div>
</template>
