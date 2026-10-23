<script setup lang="ts">
import type { DecodedParam, ParamChange } from '~/lib/network/config'
import { decodeConfig, diffConfigs } from '~/lib/network/config'
import ParamFields from '~/lib/network/ParamFields.vue'
import { filterParams, GROUPS, parseBlockRef } from './logic'

const { network } = useTonNetwork()
// Same ref as the watcher below: separate useCookie refs can lag each other after a switch.
const tc = useToncenter(network)

async function configAt(seqno: number): Promise<DecodedParam[]> {
  const r = await tc.v2<{ config: { bytes: string } }>('getConfigAll', { seqno })
  return decodeConfig(r.config.bytes)
}

const params = shallowRef<DecodedParam[]>([])
const seqno = ref(0)
const loading = ref(false)
const error = ref<unknown>(null)
// Bumped on every network load; results that belong to an earlier one are dropped.
let gen = 0
async function load() {
  const g = ++gen
  loading.value = true
  error.value = null
  try {
    const info = await tc.v2<{ last: { seqno: number } }>('getMasterchainInfo')
    const list = await configAt(info.last.seqno)
    if (g !== gen) return
    params.value = list
    seqno.value = info.last.seqno
  }
  catch (e) {
    if (g === gen) error.value = e
  }
  finally {
    if (g === gen) loading.value = false
  }
}

// ---------------------------------------------------------------- browse
const search = ref('')
const group = ref('all')
const GROUP_ITEMS = [{ label: 'All', value: 'all' }, ...GROUPS.map(g => ({ label: g.label, value: g.id }))]
const shown = computed(() => filterParams(params.value, search.value, group.value))
const openJson = ref(new Set<number>())
function toggleJson(id: number) {
  const s = new Set(openJson.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  openJson.value = s
}

// ---------------------------------------------------------------- compare
const ref0 = ref('')
const comparing = ref(false)
const compareError = ref<unknown>(null)
const changes = shallowRef<ParamChange[] | null>(null)
const compareSeqno = ref(0)
const refError = computed(() => (ref0.value.trim() && !parseBlockRef(ref0.value) ? 'Enter a masterchain block number or a past date (YYYY-MM-DD)' : undefined))

async function compare() {
  const r = parseBlockRef(ref0.value)
  if (!r || !params.value.length) return
  const g = gen
  comparing.value = true
  compareError.value = null
  changes.value = null
  try {
    let at: number
    if ('seqno' in r) {
      at = r.seqno
    }
    else {
      const b = await tc.v2<{ seqno: number }>('lookupBlock', { workchain: -1, shard: '-9223372036854775808', unixtime: r.unixtime })
      at = b.seqno
    }
    if (at > seqno.value) throw new Error(`Block ${at} is newer than the latest block ${seqno.value}.`)
    const old = await configAt(at)
    if (g !== gen) return
    compareSeqno.value = at
    changes.value = diffConfigs(old, params.value)
  }
  catch (e) {
    if (g === gen) compareError.value = e
  }
  finally {
    comparing.value = false
  }
}
function example(days: number) {
  ref0.value = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  compare()
}
watch(network, () => {
  params.value = []
  changes.value = null
  load()
}, { immediate: true })

const KIND = { added: { label: 'Added', color: 'success' }, removed: { label: 'Removed', color: 'error' }, changed: { label: 'Changed', color: 'warning' } } as const
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading" label="Reading the blockchain config from toncenter…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not read the config" @retry="load" />

    <template v-if="params.length">
      <p class="text-sm text-muted">
        {{ params.length }} params set on {{ network }} at masterchain block <span class="font-mono text-highlighted">{{ seqno.toLocaleString('en-US') }}</span>.
        Prices are in {{ NANO_NAME }} (formerly {{ NANO_FORMER }}) unless shown in {{ COIN_SYMBOL }}.
      </p>

      <!-- Compare -->
      <details class="rounded-lg border border-default p-4" :open="!!changes">
        <summary class="cursor-pointer text-sm font-medium text-highlighted">
          Compare with an earlier block or date
        </summary>
        <div class="mt-3 space-y-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
            <UFormField :error="refError" class="w-full sm:flex-1">
              <UInput v-model="ref0" placeholder="Block number (e.g. 60000000) or date (2025-01-31)" class="w-full" aria-label="Block number or date" @keydown.enter="compare" />
            </UFormField>
            <UButton label="Compare" icon="i-lucide-git-compare" :loading="comparing" :disabled="!ref0.trim() || !!refError" @click="compare" />
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="text-muted">Try:</span>
            <UButton label="30 days ago" size="xs" variant="soft" @click="example(30)" />
            <UButton label="1 year ago" size="xs" variant="soft" @click="example(365)" />
          </div>
          <ErrorNotice v-if="compareError" :error="compareError" title="Could not load that config" @retry="compare" />
          <div v-if="changes" class="space-y-3" data-testid="diff">
            <p class="text-sm text-muted">
              {{ changes.length ? `${changes.length} ${changes.length === 1 ? 'param differs' : 'params differ'}` : 'No differences' }} between block {{ compareSeqno.toLocaleString('en-US') }} and the latest block.
              Validator sets (32–37) change every round.
            </p>
            <div v-for="c in changes" :key="c.id" class="rounded-md border border-default p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs text-muted">#{{ c.id }}</span>
                <span class="font-medium text-highlighted">{{ (c.after ?? c.before)!.name }}</span>
                <UBadge :label="KIND[c.kind].label" :color="KIND[c.kind].color" variant="subtle" size="sm" />
              </div>
              <div class="mt-2 grid gap-3 md:grid-cols-2">
                <div v-if="c.before">
                  <div class="text-xs font-medium text-muted">
                    Before (block {{ compareSeqno }})
                  </div>
                  <ParamFields v-if="c.before.fields.length" :fields="c.before.fields" />
                  <p v-else class="max-h-32 overflow-auto font-mono text-xs break-all text-dimmed">
                    {{ c.before.boc }}
                  </p>
                </div>
                <div v-if="c.after">
                  <div class="text-xs font-medium text-muted">
                    Now
                  </div>
                  <ParamFields v-if="c.after.fields.length" :fields="c.after.fields" />
                  <p v-else class="max-h-32 overflow-auto font-mono text-xs break-all text-dimmed">
                    {{ c.after.boc }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      <!-- Browse -->
      <div class="flex flex-col gap-2 sm:flex-row">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search: 21, gas, storage, -1:3333…" class="w-full sm:flex-1" aria-label="Search params" />
        <USelect v-model="group" :items="GROUP_ITEMS" class="w-full sm:w-56" aria-label="Filter by group" />
      </div>

      <p v-if="!shown.length" class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
        No param matches “{{ search }}”.
      </p>

      <article v-for="p in shown" :key="p.id" class="rounded-lg border border-default p-4" :data-testid="`param-${p.id}`">
        <header class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-medium text-highlighted">
              <span class="mr-1 font-mono text-sm text-muted">#{{ p.id }}</span>{{ p.name }}
            </h3>
            <p class="text-xs text-muted">
              {{ p.about }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <UButton v-if="p.json !== null" :label="openJson.has(p.id) ? 'Hide JSON' : 'JSON'" size="xs" variant="ghost" color="neutral" icon="i-lucide-braces" @click="toggleJson(p.id)" />
            <CopyButton :value="p.boc" label="BOC" size="xs" />
          </div>
        </header>
        <ParamFields v-if="p.fields.length" :fields="p.fields" class="mt-2" />
        <UAlert v-if="p.error" class="mt-2" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="`Could not decode: ${p.error}. The raw BOC is still correct.`" />
        <div v-if="!p.fields.length" class="mt-2">
          <div class="text-xs text-muted">
            Raw value (base64 BOC){{ p.json === null && !p.error ? ', no decoder for this param yet' : '' }}
          </div>
          <p class="mt-1 max-h-24 overflow-auto font-mono text-xs break-all text-default">
            {{ p.boc }}
          </p>
        </div>
        <JsonView v-if="openJson.has(p.id)" :value="p.json" :label="`Param ${p.id} decoded`" class="mt-3" />
        <p class="mt-2 truncate font-mono text-[11px] text-dimmed" :title="p.hash">
          cell hash {{ p.hash }}
        </p>
      </article>
    </template>
  </div>
</template>
