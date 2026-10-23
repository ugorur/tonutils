<script setup lang="ts">
import type { DictLayout } from '~/lib/boc-advanced/dict'
import DictSchemaFields from '~/lib/boc-advanced/DictSchemaFields.vue'
import { toB64 } from '~/lib/boc-advanced/cells'
import { HMSTR_CLAIMS, HMSTR_MASTER, HMSTR_ROOT } from './examples'
import type { ProofSide } from './logic'
import { buildProof, buildUpdate, inspectProof } from './logic'

// tsTON jetton metadata (on-chain TEP-64 dictionary) for the builder example.
const TSTON_CONTENT = 'te6cckEBDAEA7AABAwDAAQIBIAIEAUO/+HLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+ZAAwBQAGh0dHBzOi8vdG9uc3Rha2Vycy5jb20vamV0dG9uL21ldGEuanNvbgIBIAUKAgEgBggBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwcAHgBUb25zdGFrZXJzIFRPTgFBv27U+UKnhIziywZrd6ESjGof+MQ/Q4otziRhK6n/q4sDCQAMAHRzVE9OAUK/roD9Lx4DSA4igjY1lu51LXuyf1B3a5UIagJ5GJZ1kj4LAAQAOUBccxw='
const AIRDROP_VALUE = 'amount:coins, start_from:uint48, expired_at:uint48'

const { isTestnet } = useTonNetwork()
const mode = ref<'inspect' | 'proof' | 'update'>('inspect')

const keySpec = ref('address')
const valueSpec = ref(AIRDROP_VALUE)
const layout = ref<DictLayout>('direct')
// Verify has its own layout: a proof's virtual root is usually the bare Hashmap, whatever the source dict layout was.
const inspectLayout = ref<DictLayout>('direct')
const decodeEntries = ref(true)

// ---------------------------------------------------------------- inspect
const proofInput = ref('')
const expectedRoot = ref('')

function inspectExample() {
  keySpec.value = 'address'
  valueSpec.value = AIRDROP_VALUE
  inspectLayout.value = 'direct'
  decodeEntries.value = true
  proofInput.value = HMSTR_CLAIMS[0]!.payload
  expectedRoot.value = HMSTR_ROOT
}

const report = computed(() => {
  if (!proofInput.value.trim()) return null
  try {
    return {
      ok: true as const,
      data: inspectProof(proofInput.value, {
        expectedRoot: expectedRoot.value,
        dict: decodeEntries.value ? { keySpec: keySpec.value, valueSpec: valueSpec.value, layout: inspectLayout.value } : null,
        testOnly: isTestnet.value
      })
    }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const sides = computed(() => {
  if (!report.value?.ok) return []
  const r = report.value.data
  return r.kind === 'proof'
    ? [{ title: 'Proven state', side: r.proof }]
    : [{ title: 'Old state', side: r.proof }, { title: 'New state', side: r.update! }]
})

const entryRows = (s: ProofSide) => (s.entries ?? []).map(e => ({ key: e.key, value: typeof e.value === 'string' ? e.value : JSON.stringify(e.value), warning: e.warning }))
const entryColumns = [{ accessorKey: 'key', header: 'Key' }, { accessorKey: 'value', header: 'Value' }]
const prunedColumns = [{ accessorKey: 'path', header: 'Path (ref indexes)' }, { accessorKey: 'hash', header: 'Hash of pruned subtree' }, { accessorKey: 'depth', header: 'Depth' }]

// ---------------------------------------------------------------- build
const source = ref('')
const keysText = ref('')
const updateKey = ref('')
const newValue = ref('')

const sourceArg = computed(() => /^\s*[[{]/.test(source.value) ? { json: source.value } : { boc: source.value })
const dictOpts = computed(() => ({ keySpec: keySpec.value, valueSpec: valueSpec.value, layout: layout.value }))

function buildExample() {
  keySpec.value = 'sha256'
  valueSpec.value = 'content'
  layout.value = 'tep64'
  source.value = TSTON_CONTENT
  keysText.value = 'symbol'
  updateKey.value = 'symbol'
  newValue.value = 'tsGRAM'
}

const built = computed(() => {
  if (mode.value !== 'proof' || !source.value.trim() || !keysText.value.trim()) return null
  try {
    return { ok: true as const, data: buildProof(sourceArg.value, dictOpts.value, keysText.value.split(/[\n,]+/)) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const builtUpdate = computed(() => {
  if (mode.value !== 'update' || !source.value.trim() || !updateKey.value.trim() || !newValue.value.trim()) return null
  try {
    return { ok: true as const, data: buildUpdate(sourceArg.value, dictOpts.value, updateKey.value, newValue.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function inspectBuilt(boc: string, root: string) {
  proofInput.value = boc
  expectedRoot.value = root
  inspectLayout.value = 'direct'
  mode.value = 'inspect'
}
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[
        { label: 'Verify', value: 'inspect', icon: 'i-lucide-shield-check' },
        { label: 'Prove', value: 'proof', icon: 'i-lucide-hammer' },
        { label: 'Update', value: 'update', icon: 'i-lucide-git-compare' }
      ]"
      class="w-full"
    />

    <!-- ============================================================ inspect -->
    <template v-if="mode === 'inspect'">
      <div class="space-y-2">
        <UFormField label="Proof BOC" description="A Merkle proof or update cell, or any BOC that contains one (e.g. a mintless jetton claim custom_payload).">
          <UTextarea v-model="proofInput" :rows="4" autoresize :maxrows="10" class="w-full font-mono" placeholder="te6cckEC…" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-x-4">
          <UButton label="Try an example (real HMSTR airdrop claim)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="inspectExample" />
          <UButton v-if="proofInput" label="Clear" icon="i-lucide-eraser" variant="link" color="neutral" size="sm" class="px-0" @click="proofInput = ''; expectedRoot = ''" />
        </div>
      </div>

      <UFormField label="Expected root hash (optional)" description="hex, 0x-hex, base64 or decimal. For mintless jettons: get_mintless_airdrop_hashmap_root of the jetton master.">
        <UInput v-model="expectedRoot" class="w-full font-mono" placeholder="0x4234ad72…" />
      </UFormField>

      <div class="space-y-3 rounded-lg border border-default p-3 sm:p-4">
        <USwitch v-model="decodeEntries" label="Decode the dictionary entries the proof reveals" />
        <DictSchemaFields v-if="decodeEntries" v-model:key-spec="keySpec" v-model:value-spec="valueSpec" v-model:layout="inspectLayout" :preset-layout="false" />
      </div>

      <UAlert v-if="report && !report.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="Not a valid proof" :description="report.error" />

      <template v-if="report?.ok">
        <UAlert
          v-if="report.data.expected === 'mismatch'"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          title="Root hash does NOT match"
          description="The proof is internally consistent, but it proves a different root than the one you expect. A contract checking against your root would reject it."
        />
        <UAlert
          v-else-if="report.data.expected"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="report.data.expected === 'match' ? 'Root hash matches' : `Root hash matches the ${report.data.expected} state of the update`"
          description="Every kept cell hashes up to this root, so the revealed entries are part of the committed dictionary."
        />
        <UAlert
          v-else
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="Structure verified"
          description="The stored hash and depth match the proof contents. Paste the expected root above to check it is the right one."
        />

        <div class="grid gap-x-6 sm:grid-cols-2">
          <ResultField label="Type" :value="report.data.kind === 'proof' ? 'Merkle proof (exotic type 3)' : 'Merkle update (exotic type 4)'" :mono="false" :copy="false" />
          <ResultField v-if="report.data.wrapper" label="Found in" :value="report.data.wrapper" :mono="false" :copy="false" />
        </div>

        <div v-for="s in sides" :key="s.title" class="space-y-3">
          <h3 v-if="sides.length > 1" class="font-display text-sm font-semibold text-highlighted">
            {{ s.title }}
          </h3>
          <div class="grid gap-x-6 sm:grid-cols-3">
            <ResultField label="Root hash" :value="s.side.hash" class="sm:col-span-3" />
            <ResultField label="Depth" :value="String(s.side.depth)" :copy="false" />
            <ResultField label="Cells kept" :value="String(s.side.cells)" :copy="false" />
            <ResultField label="Pruned branches" :value="String(s.side.pruned.length)" :copy="false" />
          </div>

          <template v-if="decodeEntries">
            <UAlert v-if="s.side.entriesError" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Could not read the entries" :description="s.side.entriesError" />
            <UTable v-else :data="entryRows(s.side)" :columns="entryColumns" class="rounded-md border border-default" :ui="{ td: 'align-top font-mono text-xs whitespace-normal break-all', th: 'text-xs' }">
              <template #value-cell="{ row }">
                <div>{{ row.original.value }}</div>
                <div v-if="row.original.warning" class="mt-1 font-sans text-warning">
                  {{ row.original.warning }}
                </div>
              </template>
              <template #empty>
                <span class="text-sm text-muted">No full entries revealed (all leaves are pruned).</span>
              </template>
            </UTable>
          </template>

          <details v-if="s.side.pruned.length" class="rounded-md border border-default">
            <summary class="cursor-pointer px-3 py-2 text-sm text-muted">
              Show {{ s.side.pruned.length }} pruned branches
            </summary>
            <UTable :data="s.side.pruned" :columns="prunedColumns" class="max-h-96" :ui="{ td: 'font-mono text-xs whitespace-normal break-all', th: 'text-xs' }" />
          </details>
        </div>

        <p v-if="proofInput === HMSTR_CLAIMS[0]!.payload" class="text-xs text-dimmed">
          Example: a real claim of HMSTR (jetton master {{ HMSTR_MASTER }}), sent on mainnet in transaction {{ HMSTR_CLAIMS[0]!.tx }}.
        </p>
      </template>
    </template>

    <!-- ============================================================ build -->
    <template v-else>
      <div class="space-y-2">
        <UFormField label="Full dictionary" description="BOC (base64/hex) or JSON {key: value} like the dictionary codec. A proof needs the whole dictionary.">
          <UTextarea v-model="source" :rows="4" autoresize :maxrows="10" class="w-full font-mono" placeholder="te6cc… or {&quot;key&quot;: value}" />
        </UFormField>
        <UButton v-if="!source" label="Try an example (tsTON metadata)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="buildExample" />
      </div>

      <DictSchemaFields v-model:key-spec="keySpec" v-model:value-spec="valueSpec" v-model:layout="layout" />

      <template v-if="mode === 'proof'">
        <UFormField label="Keys to prove" description="One per line (or comma-separated), in the key type above.">
          <UTextarea v-model="keysText" :rows="2" autoresize class="w-full font-mono" placeholder="UQ… / 42 / name" />
        </UFormField>
        <UAlert v-if="built && !built.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />
        <div v-if="built?.ok" class="space-y-3">
          <div class="divide-y divide-default">
            <ResultField label="Root hash (the value contracts store)" :value="built.data.rootHash" />
            <ResultField label="Merkle proof (base64)" :value="toB64(built.data.proof)" :hint="`Proves ${built.data.keys} of ${built.data.entries} entries; everything else is pruned.`" />
            <ResultField label="TEP-176 claim custom_payload (base64)" :value="toB64(built.data.claim)" hint="merkle_airdrop_claim#0df602d6 proof:^Cell, for a mintless jetton wallet transfer." />
          </div>
          <UButton label="Inspect this proof" icon="i-lucide-shield-check" color="neutral" variant="outline" @click="inspectBuilt(toB64(built.data.proof), built.data.rootHash)" />
        </div>
      </template>

      <template v-else>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Key to change">
            <UInput v-model="updateKey" class="w-full font-mono" placeholder="key" />
          </UFormField>
          <UFormField label="New value" description="Plain value, or JSON object for multi-field values.">
            <UInput v-model="newValue" class="w-full font-mono" placeholder="value" />
          </UFormField>
        </div>
        <UAlert v-if="builtUpdate && !builtUpdate.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="builtUpdate.error" />
        <div v-if="builtUpdate?.ok" class="space-y-3">
          <div class="divide-y divide-default">
            <ResultField label="Old root hash" :value="builtUpdate.data.oldHash" />
            <ResultField label="New root hash" :value="builtUpdate.data.newHash" />
            <ResultField label="Merkle update (base64)" :value="toB64(builtUpdate.data.update)" hint="Exotic type 4: proves the old root turns into the new root by changing this one key." />
          </div>
          <UButton label="Inspect this update" icon="i-lucide-shield-check" color="neutral" variant="outline" @click="inspectBuilt(toB64(builtUpdate.data.update), builtUpdate.data.newHash)" />
        </div>
      </template>
    </template>
  </div>
</template>
