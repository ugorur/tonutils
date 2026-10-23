<script setup lang="ts">
import { GROUP_LABELS, codeRange, parseExitCode, searchExitCodes } from './logic'
import type { ExitGroup } from './logic'

// Deep link: /tools/tvm-exit-codes?code=37
const initial = useRoute().query.code
const query = ref(typeof initial === 'string' ? initial : '')
const group = ref<ExitGroup | 'all'>('all')

const groups = [{ label: 'All', value: 'all' }, ...Object.entries(GROUP_LABELS).map(([value, label]) => ({ label, value }))]
const examples = ['-14', '9', '37', '35', '709', '0xffff']

const results = computed(() => searchExitCodes(query.value, group.value === 'all' ? undefined : group.value))
const asNumber = computed(() => parseExitCode(query.value))
const range = computed(() => asNumber.value === null ? null : codeRange(asNumber.value))

const groupColor: Record<ExitGroup, 'error' | 'warning' | 'primary' | 'info' | 'success' | 'neutral'> = {
  compute: 'error',
  action: 'warning',
  compiler: 'info',
  wallet: 'primary',
  jetton: 'success',
  nft: 'success',
  convention: 'neutral'
}
</script>

<template>
  <div class="space-y-5">
    <UFormField label="Exit code or keyword" hint="decimal, negative or 0x hex">
      <UInput
        v-model="query"
        size="xl"
        class="w-full"
        icon="i-lucide-search"
        placeholder="e.g. -14, 37, 0xffff or “out of gas”"
        autocomplete="off"
        :ui="{ base: 'font-mono' }"
        aria-label="Exit code or keyword"
      />
    </UFormField>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">Common:</span>
      <UButton v-for="e in examples" :key="e" :label="e" size="xs" color="neutral" variant="outline" class="font-mono" @click="query = e" />
    </div>

    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by source">
      <UButton
        v-for="g in groups"
        :key="g.value"
        :label="g.label"
        size="xs"
        :color="group === g.value ? 'primary' : 'neutral'"
        :variant="group === g.value ? 'solid' : 'ghost'"
        role="radio"
        :aria-checked="group === g.value"
        @click="group = g.value as ExitGroup | 'all'"
      />
    </div>

    <UAlert
      v-if="range"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="`About code ${asNumber}`"
      :description="results.length > 1 ? `${range} Several contracts use this number, so check which contract failed.` : range"
    />

    <p class="text-sm text-muted" aria-live="polite">
      {{ results.length }} {{ results.length === 1 ? 'match' : 'matches' }}
    </p>

    <ul v-if="results.length" class="space-y-3">
      <li v-for="e in results" :key="`${e.code}-${e.source}`" class="rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
          <span class="font-mono text-xl font-semibold text-highlighted">{{ e.max ? `${e.code}–${e.max}` : e.code }}</span>
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">
              {{ e.title }}
            </p>
            <p class="text-xs text-muted">
              {{ e.source }}
            </p>
          </div>
          <UBadge :color="groupColor[e.group]" variant="subtle" size="sm" :label="GROUP_LABELS[e.group]" />
        </div>
        <p class="mt-2 text-sm text-default">
          {{ e.description }}
        </p>
        <p v-if="e.hint" class="mt-2 flex gap-1.5 text-sm text-toned">
          <UIcon name="i-lucide-lightbulb" class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{{ e.hint }}</span>
        </p>
        <ULink :to="e.url" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-xs text-primary">
          Source <UIcon name="i-lucide-external-link" class="size-3" aria-hidden="true" />
        </ULink>
      </li>
    </ul>

    <div v-else class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      No known code matches. {{ asNumber === null ? 'Try a number, or fewer words.' : 'The meaning is set by the contract that threw it.' }}
    </div>

    <p class="text-xs text-dimmed">
      Compute-phase codes come from TVM or the contract; action-phase codes (32+) are result codes of sending messages. A wallet's 33–36 are thrown in the compute phase and differ from the action-phase meaning of the same numbers.
    </p>
  </div>
</template>
