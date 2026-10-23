<script setup lang="ts">
import type { OwnedJetton } from './core'

// Selectable list of the owner's jettons (single choice for sending, multiple for burning).
const selected = defineModel<string[]>('selected', { default: () => [] })
const props = withDefaults(defineProps<{
  jettons: OwnedJetton[]
  multiple?: boolean
  /** Show spam (blacklisted) tokens initially. */
  showSpam?: boolean
}>(), { multiple: false, showSpam: false })

const spamVisible = ref(props.showSpam)
const query = ref('')
const spamCount = computed(() => props.jettons.filter(j => j.verification === 'blacklist').length)
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.jettons.filter(j => (spamVisible.value || j.verification !== 'blacklist' || selected.value.includes(j.master))
    && (!q || j.symbol.toLowerCase().includes(q) || j.name.toLowerCase().includes(q) || j.master.includes(q)))
})

/** Logos that failed to load: show the symbol instead. */
const broken = reactive(new Set<string>())

function toggle(master: string) {
  if (!props.multiple) {
    selected.value = [master]
    return
  }
  selected.value = selected.value.includes(master) ? selected.value.filter(m => m !== master) : [...selected.value, master]
}

const BADGE: Record<string, { label: string, color: 'success' | 'neutral' | 'error' | 'warning' }> = {
  whitelist: { label: 'Verified', color: 'success' },
  blacklist: { label: 'Spam / scam', color: 'error' },
  graylist: { label: 'Suspicious', color: 'warning' }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <UInput v-if="jettons.length > 6" v-model="query" icon="i-lucide-search" placeholder="Filter tokens" size="sm" class="w-full sm:w-56" />
      <USwitch v-if="spamCount" v-model="spamVisible" size="sm" :label="`Show spam (${spamCount})`" />
    </div>
    <ul class="max-h-96 divide-y divide-default overflow-y-auto rounded-lg border border-default" :aria-multiselectable="multiple" role="listbox" data-testid="jetton-list">
      <li
        v-for="j in shown"
        :key="j.master"
        role="option"
        :aria-selected="selected.includes(j.master)"
        tabindex="0"
        class="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-elevated/60 focus-visible:bg-elevated/60 focus-visible:outline-none"
        :class="selected.includes(j.master) ? 'bg-primary/10' : ''"
        @click="toggle(j.master)"
        @keydown.enter.prevent="toggle(j.master)"
        @keydown.space.prevent="toggle(j.master)"
      >
        <UIcon
          :name="multiple ? (selected.includes(j.master) ? 'i-lucide-square-check' : 'i-lucide-square') : (selected.includes(j.master) ? 'i-lucide-circle-dot' : 'i-lucide-circle')"
          class="size-4 shrink-0"
          :class="selected.includes(j.master) ? 'text-primary' : 'text-dimmed'"
        />
        <img v-if="j.image && !broken.has(j.master)" :src="j.image" alt="" class="size-8 shrink-0 rounded-full bg-elevated object-cover" loading="lazy" @error="broken.add(j.master)">
        <div v-else class="grid size-8 shrink-0 place-items-center rounded-full bg-elevated text-xs font-semibold text-muted">
          {{ j.symbol.slice(0, 2) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="truncate font-medium text-highlighted">{{ j.symbol }}</span>
            <UBadge v-if="BADGE[j.verification]" :color="BADGE[j.verification]!.color" variant="subtle" size="sm" :label="BADGE[j.verification]!.label" />
            <UBadge v-if="j.needsClaim" color="warning" variant="subtle" size="sm" label="Not claimed" />
          </div>
          <div class="truncate text-xs text-muted">
            {{ j.name }}
          </div>
        </div>
        <TokenAmount :nano="j.balance" :decimals="j.decimals" :symbol="''" :max-decimals="4" class="shrink-0 text-right font-mono text-sm" />
      </li>
      <li v-if="!shown.length" class="px-3 py-6 text-center text-sm text-muted">
        {{ jettons.length ? 'No tokens match.' : 'This wallet holds no jettons.' }}
      </li>
    </ul>
  </div>
</template>
