<script setup lang="ts">
import { STATUS_COLOR, searchTeps } from './logic'

const query = ref('')
const mergedOnly = ref(false)
const examples = ['74', 'NFT', 'metadata', 'get_wallet_data', '0x5fcc3d14', 'TON Connect']

const results = computed(() => searchTeps(query.value, { merged: mergedOnly.value }))
const toolLinks = (slugs: string[] = []) => slugs.map(getTool).filter((t): t is ToolMeta => !!t)
const opHexOf = (op: string) => {
  const m = /#([0-9a-f]{8})/.exec(op)
  return m ? `0x${m[1]}` : null
}
</script>

<template>
  <div class="space-y-5">
    <UFormField label="TEP number, keyword, op code or getter">
      <UInput
        v-model="query"
        size="xl"
        class="w-full"
        icon="i-lucide-search"
        placeholder="e.g. 74, jettons, royalty, dnsresolve"
        autocomplete="off"
        aria-label="TEP number, keyword, op code or getter"
      />
    </UFormField>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="e in examples" :key="e" :label="e" size="xs" color="neutral" variant="outline" @click="query = e" />
      </div>
      <USwitch v-model="mergedOnly" label="Merged standards only" />
    </div>

    <p class="text-sm text-muted" aria-live="polite">
      {{ results.length }} {{ results.length === 1 ? 'proposal' : 'proposals' }}
    </p>

    <ul v-if="results.length" class="space-y-3">
      <li v-for="t in results" :key="t.num" class="rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-display text-lg font-semibold text-highlighted">TEP-{{ t.num }}</span>
          <UBadge :color="STATUS_COLOR[t.status]" variant="subtle" size="sm" :label="t.status" />
          <UBadge color="neutral" variant="outline" size="sm" :label="t.type" />
          <span class="ms-auto text-xs text-muted">{{ t.created !== '–' ? `created ${t.created}` : '' }}</span>
        </div>
        <p class="mt-1 font-medium text-highlighted">
          {{ t.title }}
        </p>
        <p class="mt-1 text-sm text-toned">
          {{ t.summary }}
        </p>

        <div v-if="t.ops?.length" class="mt-3">
          <p class="text-xs font-medium text-muted">
            Messages
          </p>
          <div class="mt-1 flex flex-wrap gap-1.5">
            <template v-for="op in t.ops" :key="op">
              <ULink v-if="opHexOf(op)" :to="`/tools/opcode-lookup?q=${opHexOf(op)}`" class="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-primary break-all hover:underline">
                {{ op }}
              </ULink>
              <span v-else class="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs break-all">{{ op }}</span>
            </template>
          </div>
        </div>

        <div v-if="t.getters?.length" class="mt-3">
          <p class="text-xs font-medium text-muted">
            Get-methods
          </p>
          <ul class="mt-1 space-y-1">
            <li v-for="g in t.getters" :key="g" class="flex items-start gap-1">
              <code class="min-w-0 flex-1 rounded bg-elevated px-1.5 py-0.5 text-xs break-all">{{ g }}</code>
              <CopyButton :value="g.split(' → ')[0]!" size="xs" />
            </li>
          </ul>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <ULink :to="t.url" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary">
            {{ t.url.includes('/pull/') ? 'Pull request' : 'Read the TEP' }} <UIcon name="i-lucide-external-link" class="size-3.5" aria-hidden="true" />
          </ULink>
          <ULink v-for="tool in toolLinks(t.tools)" :key="tool.slug" :to="`/tools/${tool.slug}`" class="inline-flex items-center gap-1 text-toned hover:text-primary">
            <UIcon :name="tool.icon" class="size-3.5" aria-hidden="true" /> {{ tool.name }}
          </ULink>
        </div>
      </li>
    </ul>
    <div v-else class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      No proposal matches. Try a TEP number or a single word.
    </div>

    <p class="text-xs text-dimmed">
      Source: <ULink to="https://github.com/ton-blockchain/TEPs" target="_blank" rel="noopener" class="text-primary">ton-blockchain/TEPs</ULink>. A standard counts once several parties use it; "Proposed" and "Open PR" entries may still change.
    </p>
  </div>
</template>
