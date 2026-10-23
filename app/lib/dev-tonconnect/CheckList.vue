<script setup lang="ts">
// Findings list for the dev-tonconnect tools: error / warn / info / ok rows.
export interface CheckItem { level: 'error' | 'warn' | 'info' | 'ok', title: string, detail?: string }

defineProps<{ items: CheckItem[] }>()

const STYLE: Record<CheckItem['level'], { icon: string, cls: string, sr: string }> = {
  error: { icon: 'i-lucide-circle-x', cls: 'text-error', sr: 'Error' },
  warn: { icon: 'i-lucide-triangle-alert', cls: 'text-warning', sr: 'Warning' },
  info: { icon: 'i-lucide-info', cls: 'text-muted', sr: 'Note' },
  ok: { icon: 'i-lucide-circle-check', cls: 'text-success', sr: 'Passed' }
}
</script>

<template>
  <ul class="divide-y divide-default rounded-lg border border-default">
    <li v-for="(c, i) in items" :key="i" class="flex gap-3 px-3 py-2.5 text-sm">
      <UIcon :name="STYLE[c.level].icon" class="mt-0.5 size-4 shrink-0" :class="STYLE[c.level].cls" />
      <div class="min-w-0">
        <p class="font-medium break-words text-highlighted">
          <span class="sr-only">{{ STYLE[c.level].sr }}: </span>{{ c.title }}
        </p>
        <p v-if="c.detail" class="mt-0.5 break-words text-muted">
          {{ c.detail }}
        </p>
      </div>
    </li>
  </ul>
</template>
