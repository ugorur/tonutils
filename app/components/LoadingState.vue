<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Loading…' })
</script>

<template>
  <div class="flex items-center gap-2 py-6 text-sm text-muted" role="status" aria-live="polite" aria-busy="true">
    <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-primary" />
    <span>{{ label }}</span>
  </div>
</template>
