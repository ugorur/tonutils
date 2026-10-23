<script setup lang="ts">
import { LANGS, RESERVE_MODES, SEND_MODES, STDLIB_MAP, STRING_POSTFIXES, filterTopics } from './logic'
import type { Lang } from './logic'

const tab = ref('compare')
const tabs = [
  { label: 'Side by side', value: 'compare', icon: 'i-lucide-columns-3' },
  { label: 'Send & reserve modes', value: 'modes', icon: 'i-lucide-send' },
  { label: 'FunC → Tolk', value: 'migrate', icon: 'i-lucide-arrow-right-left' }
]

const pairs: { label: string, value: string, langs: Lang[] }[] = [
  { label: 'Tolk vs FunC', value: 'tolk-func', langs: ['tolk', 'func'] },
  { label: 'Tolk vs Tact', value: 'tolk-tact', langs: ['tolk', 'tact'] },
  { label: 'All three', value: 'all', langs: ['tolk', 'func', 'tact'] }
]
const pair = ref('tolk-func')
const langs = computed(() => pairs.find(p => p.value === pair.value)!.langs)
const langName = (l: Lang) => LANGS.find(x => x.id === l)!.name

const filter = ref('')
const topics = computed(() => filterTopics(filter.value))
const gridCols = computed(() => langs.value.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')
</script>

<template>
  <div class="space-y-5">
    <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" />

    <template v-if="tab === 'compare'">
      <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <UFormField label="Filter">
          <UInput v-model="filter" icon="i-lucide-search" placeholder="e.g. storeCoins, getter, bounce" class="w-full" autocomplete="off" aria-label="Filter topics" />
        </UFormField>
        <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Languages to compare">
          <UButton
            v-for="p in pairs"
            :key="p.value"
            :label="p.label"
            size="sm"
            :color="pair === p.value ? 'primary' : 'neutral'"
            :variant="pair === p.value ? 'solid' : 'outline'"
            role="radio"
            :aria-checked="pair === p.value"
            @click="pair = p.value"
          />
        </div>
      </div>

      <ul class="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Topics">
        <li v-for="t in topics" :key="t.id">
          <a :href="`#cs-${t.id}`" class="text-primary hover:underline">{{ t.title }}</a>
        </li>
      </ul>

      <div class="grid gap-2 text-xs text-muted sm:grid-cols-3">
        <p v-for="l in LANGS" :key="l.id">
          <span class="font-semibold text-toned">{{ l.name }}:</span> {{ l.note }}
        </p>
      </div>

      <section v-for="t in topics" :id="`cs-${t.id}`" :key="t.id" class="scroll-mt-20 space-y-3 border-t border-default pt-5">
        <div>
          <h3 class="font-display text-base font-semibold text-highlighted">
            {{ t.title }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ t.intro }}
          </p>
        </div>

        <div v-if="t.rows" class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full min-w-[32rem] text-left text-sm">
            <thead class="bg-elevated text-xs text-muted">
              <tr>
                <th class="px-3 py-2 font-medium" />
                <th v-for="l in langs" :key="l" class="px-3 py-2 font-medium">
                  {{ langName(l) }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="r in t.rows" :key="r.label">
                <td class="px-3 py-2 text-muted">
                  {{ r.label }}
                </td>
                <td v-for="l in langs" :key="l" class="px-3 py-2 font-mono text-xs">
                  {{ r[l] ?? '–' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="t.example" class="grid gap-3" :class="gridCols">
          <div v-for="l in langs" :key="l" class="min-w-0 rounded-lg border border-default">
            <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
              <span class="text-xs font-semibold text-toned">{{ langName(l) }}</span>
              <CopyButton v-if="t.example[l]" :value="t.example[l]!" size="xs" />
            </div>
            <pre v-if="t.example[l]" class="overflow-x-auto p-3 font-mono text-xs leading-relaxed"><code>{{ t.example[l] }}</code></pre>
            <p v-else class="p-3 text-xs text-muted">
              No example.
            </p>
          </div>
        </div>
      </section>

      <div v-if="!topics.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        Nothing matches “{{ filter }}”.
      </div>
    </template>

    <template v-else-if="tab === 'modes'">
      <section v-for="table in [{ title: 'Send modes', rows: SEND_MODES, note: 'Combine one base mode (0, 64 or 128) with flags by adding them: 64 + 2 = 66, 128 + 32 = 160.' }, { title: 'Reserve modes', rows: RESERVE_MODES, note: 'Used by raw_reserve / reserveGramsOnBalance / nativeReserve. Flags add up: 4 + 8 + 1 = 13 keeps the original balance minus the amount.' }]" :key="table.title" class="space-y-2">
        <h3 class="font-display text-base font-semibold text-highlighted">
          {{ table.title }}
        </h3>
        <p class="text-sm text-muted">
          {{ table.note }}
        </p>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full min-w-[40rem] text-left text-sm">
            <thead class="bg-elevated text-xs text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Value
                </th>
                <th class="px-3 py-2 font-medium">
                  Tolk
                </th>
                <th class="px-3 py-2 font-medium">
                  Tact
                </th>
                <th class="px-3 py-2 font-medium">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="m in table.rows" :key="m.value">
                <td class="px-3 py-2 font-mono font-semibold">
                  {{ m.value }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ m.tolk }}
                </td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ m.tact }}
                </td>
                <td class="px-3 py-2 text-xs">
                  {{ m.meaning }}<span v-if="m.core" class="block text-dimmed">@ton/core: {{ table.title === 'Send modes' ? 'SendMode' : 'ReserveMode' }}.{{ m.core }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p class="text-sm">
        Not sure which mode you need? Try the <ULink to="/tools/send-mode-calculator" class="text-primary">send mode calculator</ULink>.
      </p>
    </template>

    <template v-else>
      <section class="space-y-2">
        <h3 class="font-display text-base font-semibold text-highlighted">
          Standard library: FunC → Tolk
        </h3>
        <p class="text-sm text-muted">
          Most global FunC functions became methods; <code>x~f()</code> becomes <code>x.f()</code>.
        </p>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full min-w-[28rem] text-left text-xs">
            <thead class="bg-elevated text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  FunC
                </th>
                <th class="px-3 py-2 font-medium">
                  Tolk
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default font-mono">
              <tr v-for="[f, t] in STDLIB_MAP" :key="f">
                <td class="px-3 py-1.5">
                  {{ f }}
                </td>
                <td class="px-3 py-1.5 text-highlighted">
                  {{ t }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="font-display text-base font-semibold text-highlighted">
          String suffixes
        </h3>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full min-w-[28rem] text-left text-xs">
            <thead class="bg-elevated text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">
                  FunC
                </th>
                <th class="px-3 py-2 font-medium">
                  Tolk
                </th>
                <th class="px-3 py-2 font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="[f, t, m] in STRING_POSTFIXES" :key="f">
                <td class="px-3 py-1.5 font-mono">
                  {{ f }}
                </td>
                <td class="px-3 py-1.5 font-mono text-highlighted">
                  {{ t }}
                </td>
                <td class="px-3 py-1.5">
                  {{ m }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p class="text-sm">
        Converting a whole contract? Use the <ULink to="/tools/func-to-tolk-converter" class="text-primary">FunC to Tolk converter</ULink>, then try it in the <ULink to="/tools/tolk-func-playground" class="text-primary">Tolk / FunC playground</ULink>.
      </p>
    </template>

    <p class="text-xs text-dimmed">
      Every Tolk and FunC example on this page is compiled in our test suite (Tolk 1.5, FunC 0.4.6). Sources:
      <ULink to="https://docs.ton.org/tolk/overview" target="_blank" rel="noopener" class="text-primary">Tolk docs</ULink>,
      <ULink to="https://docs.ton.org/tolk/from-func/stdlib-comparison" target="_blank" rel="noopener" class="text-primary">stdlib comparison</ULink>,
      <ULink to="https://docs.tact-lang.org/" target="_blank" rel="noopener" class="text-primary">Tact docs</ULink>.
    </p>
  </div>
</template>
