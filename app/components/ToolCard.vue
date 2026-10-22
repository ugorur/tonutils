<script setup lang="ts">
defineProps<{ tool: ToolMeta }>()
</script>

<template>
  <NuxtLink
    :to="`/tools/${tool.slug}`"
    class="group flex items-start gap-3 rounded-lg border border-default p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
  >
    <UIcon :name="tool.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
    <span class="min-w-0">
      <span class="block font-medium text-highlighted">{{ tool.name }}</span>
      <span class="mt-0.5 block text-sm text-muted">{{ tool.short }}</span>
      <span v-if="tool.network === 'offline'" class="mt-2 inline-flex items-center gap-1 text-xs text-success">
        <UIcon name="i-lucide-shield-check" class="size-3.5" /> Local only
      </span>
    </span>
  </NuxtLink>
</template>
