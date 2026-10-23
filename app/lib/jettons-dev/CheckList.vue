<script setup lang="ts">
import type { Check, CheckLevel } from './metadata'

defineProps<{ title: string, checks: Check[] }>()

const ICON: Record<CheckLevel, { icon: string, cls: string, sr: string }> = {
  ok: { icon: 'i-lucide-circle-check', cls: 'text-success', sr: 'OK' },
  warn: { icon: 'i-lucide-triangle-alert', cls: 'text-warning', sr: 'Warning' },
  error: { icon: 'i-lucide-circle-x', cls: 'text-error', sr: 'Error' },
  info: { icon: 'i-lucide-info', cls: 'text-info', sr: 'Note' }
}
</script>

<template>
  <section class="rounded-lg border border-default">
    <h3 class="border-b border-default px-4 py-2 font-display text-sm font-semibold text-highlighted">
      {{ title }}
    </h3>
    <ul class="divide-y divide-default">
      <li v-for="(c, i) in checks" :key="i" class="flex gap-3 px-4 py-2.5">
        <UIcon :name="ICON[c.level].icon" class="mt-0.5 size-4 shrink-0" :class="ICON[c.level].cls" />
        <span class="sr-only">{{ ICON[c.level].sr }}:</span>
        <div class="min-w-0 text-sm">
          <div class="text-highlighted">
            {{ c.title }}
          </div>
          <div v-if="c.detail" class="text-xs break-words text-muted">
            {{ c.detail }}
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
