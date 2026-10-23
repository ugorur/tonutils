<script setup lang="ts">
import type { Check, Level } from './core'

// Red / amber / green checklist shared by the security tools.
defineProps<{ title?: string, checks: Check[] }>()

const STYLE: Record<Level, { icon: string, cls: string, sr: string }> = {
  danger: { icon: 'i-lucide-octagon-x', cls: 'text-error', sr: 'Danger' },
  warn: { icon: 'i-lucide-triangle-alert', cls: 'text-warning', sr: 'Warning' },
  ok: { icon: 'i-lucide-circle-check', cls: 'text-success', sr: 'OK' },
  info: { icon: 'i-lucide-info', cls: 'text-info', sr: 'Note' }
}
</script>

<template>
  <section class="rounded-lg border border-default" data-testid="risk-list">
    <h3 v-if="title" class="border-b border-default px-4 py-2 font-display text-sm font-semibold text-highlighted">
      {{ title }}
    </h3>
    <ul class="divide-y divide-default">
      <li v-for="(c, i) in checks" :key="i" class="flex gap-3 px-4 py-2.5" :data-level="c.level">
        <UIcon :name="STYLE[c.level].icon" class="mt-0.5 size-4 shrink-0" :class="STYLE[c.level].cls" />
        <span class="sr-only">{{ STYLE[c.level].sr }}:</span>
        <div class="min-w-0 flex-1 text-sm">
          <div class="text-highlighted">
            {{ c.title }}
          </div>
          <div v-if="c.detail" class="mt-0.5 text-xs break-words whitespace-pre-line text-muted">
            {{ c.detail }}
          </div>
          <UButton v-if="c.link" :to="c.link.to" :label="c.link.label" trailing-icon="i-lucide-arrow-right" variant="link" size="xs" class="mt-0.5 px-0" />
        </div>
      </li>
    </ul>
  </section>
</template>
