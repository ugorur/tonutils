<script setup lang="ts">
const props = defineProps<{
  value: unknown
  /** Caption above the block. */
  label?: string
}>()

// bigint-safe stringify
const text = computed(() =>
  JSON.stringify(props.value, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) ?? 'undefined'
)
</script>

<template>
  <div class="overflow-hidden rounded-md border border-default bg-muted">
    <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
      <span class="text-xs text-muted">{{ label ?? 'JSON' }}</span>
      <CopyButton :value="text" size="xs" />
    </div>
    <pre class="max-h-[28rem] overflow-auto p-3 font-mono text-xs leading-relaxed text-default">{{ text }}</pre>
  </div>
</template>
