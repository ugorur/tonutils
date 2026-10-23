<script setup lang="ts">
import type { CheckState } from './proof'

defineProps<{ checks: { label: string, state: CheckState, detail: string }[] }>()

const ICON: Record<CheckState, string> = {
  pass: 'i-lucide-circle-check',
  fail: 'i-lucide-circle-x',
  warn: 'i-lucide-triangle-alert',
  info: 'i-lucide-info'
}
const COLOR: Record<CheckState, string> = {
  pass: 'text-success',
  fail: 'text-error',
  warn: 'text-warning',
  info: 'text-muted'
}
</script>

<template>
  <ul class="divide-y divide-default rounded-md border border-default">
    <li v-for="c in checks" :key="c.label" class="flex items-start gap-3 px-3 py-2.5" :data-state="c.state">
      <UIcon :name="ICON[c.state]" class="mt-0.5 size-5 shrink-0" :class="COLOR[c.state]" />
      <div class="min-w-0">
        <div class="text-sm font-medium text-highlighted">
          {{ c.label }}
        </div>
        <div class="text-sm break-words text-muted">
          {{ c.detail }}
        </div>
      </div>
    </li>
  </ul>
</template>
