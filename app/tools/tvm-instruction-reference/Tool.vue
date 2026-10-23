<script setup lang="ts">
import { ALIASES, CATEGORY_LABELS, SOURCE, aliasesOf, categoryLabel, decodeHex, looksLikeHex, searchInstructions, versionLabel } from './logic'

const query = ref('')
const category = ref('all')
const limit = ref(40)

const categories = [{ label: 'All categories', value: 'all' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label))]
const examples = ['ACCEPT', 'SENDRAWMSG', 'DUP', 'F800', 'HASHCU', 'gas']

const results = computed(() => searchInstructions(query.value, category.value === 'all' ? undefined : category.value))
watch([query, category], () => (limit.value = 40))

// tvm-spec descriptions use markdown `code` ticks; show them as plain text.
const plain = (d: string) => d.replace(/`/g, '')

const aliasHit = computed(() => ALIASES.find(a => a.m === query.value.trim().toUpperCase()))

const decoded = computed(() => {
  if (!looksLikeHex(query.value)) return null
  try {
    return { result: decodeHex(query.value), error: null }
  }
  catch (e) {
    return { result: null, error: (e as Error).message }
  }
})
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-3 sm:grid-cols-[1fr_14rem]">
      <UFormField label="Mnemonic, keyword or bytecode hex">
        <UInput
          v-model="query"
          size="xl"
          class="w-full"
          icon="i-lucide-search"
          placeholder="e.g. ACCEPT, DUP, hash, F800"
          autocomplete="off"
          :ui="{ base: 'font-mono' }"
          aria-label="Mnemonic, keyword or bytecode hex"
        />
      </UFormField>
      <UFormField label="Category">
        <USelect v-model="category" :items="categories" size="xl" class="w-full" aria-label="Category" />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">Try:</span>
      <UButton v-for="e in examples" :key="e" :label="e" size="xs" color="neutral" variant="outline" class="font-mono" @click="query = e" />
    </div>

    <UAlert v-if="decoded?.error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="decoded.error" />
    <div v-else-if="decoded" class="rounded-lg border border-primary/40 bg-primary/5 p-4" aria-live="polite">
      <p class="text-xs text-muted">
        As bytecode, <span class="font-mono">{{ query.trim() }}</span> starts with
      </p>
      <p v-if="decoded.result" class="mt-1 text-sm">
        <span class="font-mono text-lg font-semibold text-highlighted">{{ decoded.result.instruction.f.split('\n')[0] }}</span>
        <span class="text-muted"> · prefix {{ decoded.result.instruction.p }} ({{ decoded.result.prefixBits }} bits) · {{ decoded.result.instruction.t }}</span>
      </p>
      <p v-else class="mt-1 text-sm text-muted">
        no known instruction (invalid opcode, exit code 6).
      </p>
      <p class="mt-2 text-xs text-dimmed">
        To disassemble a whole contract, use the <ULink to="/tools/code-disassembler" class="text-primary">code disassembler</ULink>.
      </p>
    </div>

    <p v-if="aliasHit" class="rounded-lg border border-default p-3 text-sm">
      <span class="font-mono font-semibold text-highlighted">{{ aliasHit.m }}</span> is an alias: {{ plain(aliasHit.d) }}
      <span class="font-mono text-muted"> · stack {{ aliasHit.s }}</span>
    </p>

    <p class="text-sm text-muted" aria-live="polite">
      {{ results.length }} {{ results.length === 1 ? 'instruction' : 'instructions' }}
    </p>

    <ul class="divide-y divide-default rounded-lg border border-default">
      <li v-for="i in results.slice(0, limit)" :key="`${i.m}-${i.p}`">
        <details class="group p-3 sm:p-4">
          <summary class="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
            <UIcon name="i-lucide-chevron-right" class="size-4 self-center text-dimmed transition group-open:rotate-90" aria-hidden="true" />
            <span class="font-mono font-semibold text-highlighted">{{ i.f.split('\n')[0] }}</span>
            <span class="font-mono text-xs text-muted">{{ i.p }}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-xs text-toned" :title="i.s">{{ i.s }}</span>
            <span class="text-xs text-muted">gas {{ i.g }}</span>
          </summary>
          <div class="mt-3 space-y-3 ps-6 text-sm">
            <p class="whitespace-pre-line">
              {{ plain(i.d) || 'No description in the spec.' }}
            </p>
            <dl class="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt class="text-muted">
                Fift
              </dt>
              <dd class="font-mono whitespace-pre-line">
                {{ i.f }}
              </dd>
              <dt class="text-muted">
                Stack
              </dt>
              <dd class="font-mono break-all">
                {{ i.s || '–' }}
              </dd>
              <dt class="text-muted">
                Encoding
              </dt>
              <dd class="font-mono break-all">
                {{ i.t }}
              </dd>
              <dt class="text-muted">
                Gas
              </dt>
              <dd>{{ i.g }}</dd>
              <dt class="text-muted">
                Category
              </dt>
              <dd>{{ categoryLabel(i.c) }}</dd>
              <dt class="text-muted">
                Version
              </dt>
              <dd>{{ versionLabel(i.v) }}</dd>
              <template v-if="aliasesOf(i.m).length">
                <dt class="text-muted">
                  Aliases
                </dt>
                <dd class="font-mono">
                  {{ aliasesOf(i.m).map(a => a.m).join(', ') }}
                </dd>
              </template>
            </dl>
          </div>
        </details>
      </li>
    </ul>

    <div v-if="results.length > limit" class="text-center">
      <UButton :label="`Show more (${results.length - limit} left)`" color="neutral" variant="outline" @click="limit += 80" />
    </div>
    <div v-if="!results.length && !decoded" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      No instruction matches. Try a shorter word or another category.
    </div>

    <p class="text-xs text-dimmed">
      Data: <ULink :to="SOURCE.split(' ')[0]" target="_blank" rel="noopener" class="text-primary">ton-community/tvm-spec</ULink> (codepage 0, MIT). Gas "x/y" means the cost depends on the branch taken.
    </p>
  </div>
</template>
