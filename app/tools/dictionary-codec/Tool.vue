<script setup lang="ts">
import type { DroppedFile } from '~/components/FileDrop.vue'
import type { DictLayout } from '~/lib/boc-advanced/dict'
import DictSchemaFields from '~/lib/boc-advanced/DictSchemaFields.vue'
import { toB64 } from '~/lib/boc-advanced/cells'
import { buildDictionary, decodeDictionary } from './logic'

// tsTON (Tonstakers) jetton master content cell, read from mainnet account data.
const EXAMPLE_BOC = 'te6cckEBDAEA7AABAwDAAQIBIAIEAUO/+HLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+ZAAwBQAGh0dHBzOi8vdG9uc3Rha2Vycy5jb20vamV0dG9uL21ldGEuanNvbgIBIAUKAgEgBggBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwcAHgBUb25zdGFrZXJzIFRPTgFBv27U+UKnhIziywZrd6ESjGof+MQ/Q4otziRhK6n/q4sDCQAMAHRzVE9OAUK/roD9Lx4DSA4igjY1lu51LXuyf1B3a5UIagJ5GJZ1kj4LAAQAOUBccxw='
const EXAMPLE_JSON = JSON.stringify({
  'UQARdqETVZjzwzP-t1YekVJ7sdRXUuMPZ7ERBAhtjhEI29IK': '1500000000',
  'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N': '250000000'
}, null, 2)

const { isTestnet } = useTonNetwork()
const mode = ref<'decode' | 'build'>('decode')

// shared schema between both modes
const keySpec = ref('sha256')
const valueSpec = ref('content')
const layout = ref<DictLayout>('auto')

const boc = ref('')
const json = ref('')

function onFile(f: DroppedFile) {
  const text = f.text?.trim() ?? ''
  boc.value = /^[A-Za-z0-9+/=_\-\s]+$/.test(text) && text ? text : Buffer.from(f.bytes).toString('base64')
}

function tryDecodeExample() {
  keySpec.value = 'sha256'
  valueSpec.value = 'content'
  layout.value = 'auto'
  boc.value = EXAMPLE_BOC
}
function tryBuildExample() {
  keySpec.value = 'address'
  valueSpec.value = 'coins'
  json.value = EXAMPLE_JSON
}

const decoded = computed(() => {
  if (!boc.value.trim()) return null
  try {
    return { ok: true as const, data: decodeDictionary(boc.value, keySpec.value, valueSpec.value, layout.value, isTestnet.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const built = computed(() => {
  if (!json.value.trim()) return null
  try {
    return { ok: true as const, data: buildDictionary(json.value, keySpec.value, valueSpec.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const LAYOUT_NAMES = { direct: 'Hashmap root (direct)', hashmapE: 'HashmapE (1 bit + ref)', tep64: 'TEP-64 on-chain content (0x00 + HashmapE)' }
const columns = [
  { accessorKey: 'key', header: 'Key' },
  { accessorKey: 'value', header: 'Value' }
]
const rows = computed(() => decoded.value?.ok
  ? decoded.value.data.entries.map(e => ({ key: e.key, value: typeof e.value === 'string' ? e.value : JSON.stringify(e.value), warning: e.warning }))
  : [])

function editInBuilder() {
  if (!decoded.value?.ok) return
  json.value = decoded.value.data.json
  mode.value = 'build'
}
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'Decode a cell', value: 'decode', icon: 'i-lucide-scan-search' }, { label: 'Build from JSON', value: 'build', icon: 'i-lucide-hammer' }]"
      class="w-full"
    />

    <DictSchemaFields v-model:key-spec="keySpec" v-model:value-spec="valueSpec" v-model:layout="layout" :show-layout="mode === 'decode'" />

    <template v-if="mode === 'decode'">
      <div class="space-y-2">
        <UFormField label="Dictionary BOC" description="base64 (te6cc…) or hex. A jetton content cell, a contract data field, a get-method result…">
          <UTextarea v-model="boc" :rows="4" autoresize :maxrows="10" class="w-full font-mono" placeholder="te6cckEB…" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-x-4">
          <UButton label="Try an example (tsTON metadata)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryDecodeExample" />
          <UButton v-if="boc" label="Clear" icon="i-lucide-eraser" variant="link" color="neutral" size="sm" class="px-0" @click="boc = ''" />
        </div>
        <FileDrop v-if="!boc" accept=".boc,.txt,.b64" text label="…or drop a .boc file" @file="onFile" />
      </div>

      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />

      <template v-if="decoded?.ok">
        <div class="grid gap-x-6 sm:grid-cols-3">
          <ResultField label="Entries" :value="String(decoded.data.entries.length)" :copy="false" />
          <ResultField label="Stored as" :value="LAYOUT_NAMES[decoded.data.layout]" :mono="false" :copy="false" class="sm:col-span-2" />
          <ResultField label="Hashmap root hash" :value="decoded.data.rootHash ?? 'empty dictionary'" hint="What a Merkle proof of this dictionary commits to." class="sm:col-span-3" />
        </div>

        <UAlert
          v-if="decoded.data.warnings"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${decoded.data.warnings} value(s) did not match &quot;${valueSpec}&quot;`"
          description="The dictionary structure is valid, but values have leftover or missing bits. Check the value fields above."
        />

        <UTable :data="rows" :columns="columns" class="max-h-[32rem] rounded-md border border-default" :ui="{ td: 'align-top font-mono text-xs whitespace-normal break-all', th: 'text-xs' }">
          <template #value-cell="{ row }">
            <div>{{ row.original.value }}</div>
            <div v-if="row.original.warning" class="mt-1 font-sans text-warning">
              {{ row.original.warning }}
            </div>
          </template>
          <template #empty>
            <span class="text-sm text-muted">The dictionary is empty.</span>
          </template>
        </UTable>

        <JsonView :value="JSON.parse(decoded.data.json)" label="Entries as JSON (paste into the builder)" />
        <UButton label="Edit in builder" icon="i-lucide-pencil" color="neutral" variant="outline" @click="editInBuilder" />
      </template>
    </template>

    <template v-else>
      <div class="space-y-2">
        <UFormField label="Entries (JSON)" description='{"key": value} or [[key, value], …]. Multi-field values are objects: {"amount": "1000", "start_from": 0, …}. Numbers may be strings (decimal or 0x).'>
          <UTextarea v-model="json" :rows="6" autoresize :maxrows="16" class="w-full font-mono" placeholder="{&quot;1&quot;: &quot;100&quot;}" />
        </UFormField>
        <UButton v-if="!json" label="Try an example (address → coins)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryBuildExample" />
      </div>

      <UAlert v-if="built && !built.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />

      <div v-if="built?.ok" class="divide-y divide-default">
        <ResultField label="Entries" :value="String(built.data.count)" :copy="false" />
        <ResultField label="HashmapE cell (base64)" :value="toB64(built.data.hashmapE)" hint="1 bit + ref: what storeDict / loadDict use inside contract data." />
        <ResultField v-if="built.data.direct" label="Hashmap root cell (base64)" :value="toB64(built.data.direct)" hint="storeDictDirect / loadDictDirect, or a ref you store yourself." />
        <ResultField v-if="built.data.direct" label="Hashmap root hash" :value="built.data.direct.hash().toString('hex')" hint="Merkle root of this dictionary (e.g. a mintless airdrop root)." />
        <ResultField v-if="keySpec === 'sha256'" label="TEP-64 on-chain content cell (base64)" :value="toB64(built.data.tep64)" hint="0x00 prefix + HashmapE: the content field of a jetton minter or NFT." />
      </div>
    </template>
  </div>
</template>
