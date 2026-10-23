<script setup lang="ts">
import { loadTlbParser, loadTlbRuntime } from '~/utils/lazy'
import { TLB_PRESETS } from '~/lib/tlb/presets'
import type { Decoded, Schema } from './logic'
import { compileSchema, decodeBoc, encodeJson, summarize } from './logic'

type Runtime = Awaited<ReturnType<typeof loadTlbRuntime>>
type Parser = Parameters<typeof compileSchema>[1]

const libs = shallowRef<{ rt: Runtime, parser: Parser } | null>(null)
const libError = ref<unknown>(null)
onMounted(async () => {
  try {
    const [rt, parser] = await Promise.all([loadTlbRuntime(), loadTlbParser()])
    libs.value = { rt, parser: parser as unknown as Parser }
  }
  catch (e) {
    libError.value = e
  }
})

const presetId = ref('tep74')
const schemaText = ref('')
const presetItems = TLB_PRESETS.map(p => ({ label: p.label, value: p.id }))
const preset = computed(() => TLB_PRESETS.find(p => p.id === presetId.value))

function applyPreset() {
  const p = preset.value
  if (!p || !libs.value) return
  schemaText.value = (p.schema ?? libs.value.rt.blockSchema).trim() + '\n'
  boc.value = ''
  typeName.value = 'auto'
}
watch([presetId, libs], applyPreset)

// compile (debounced: block.tlb is ~800 lines)
const schema = shallowRef<Schema | null>(null)
const schemaError = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch([schemaText, libs], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!libs.value) return
    try {
      schema.value = compileSchema(libs.value.rt, libs.value.parser, schemaText.value)
      schemaError.value = ''
    }
    catch (e) {
      schema.value = null
      schemaError.value = (e as Error).message
    }
  }, 250)
})
const types = computed(() => schema.value ? summarize(schema.value) : [])
const typeItems = computed(() => [{ label: 'Auto-detect', value: 'auto' }, ...(schema.value?.typeNames ?? []).map(t => ({ label: t, value: t }))])

const tab = ref('decode')

// decode
const boc = ref('')
const typeName = ref('auto')
watch(schema, (s) => {
  if (s && typeName.value !== 'auto' && !s.typeNames.includes(typeName.value)) typeName.value = 'auto'
})
const decoded = computed<{ ok: Decoded } | { error: string } | null>(() => {
  if (!schema.value || !boc.value.trim()) return null
  try {
    return { ok: decodeBoc(schema.value, boc.value.trim(), typeName.value) }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})
function tryExample() {
  const ex = preset.value?.example
  if (!ex) return
  boc.value = ex.boc
  typeName.value = ex.type
}

// encode
const json = ref('')
const encoded = computed<{ boc: string, hex: string, hash: string } | { error: string } | null>(() => {
  if (!schema.value || !json.value.trim()) return null
  try {
    const c = encodeJson(schema.value, json.value)
    const b = c.toBoc()
    return { boc: b.toString('base64'), hex: b.toString('hex'), hash: c.hash().toString('hex') }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})
function editAsJson() {
  if (decoded.value && 'ok' in decoded.value) {
    json.value = JSON.stringify(decoded.value.ok.value, null, 2)
    tab.value = 'encode'
  }
}
function decodeEncoded() {
  if (encoded.value && 'boc' in encoded.value) {
    boc.value = encoded.value.boc
    tab.value = 'decode'
  }
}
</script>

<template>
  <div class="space-y-6">
    <ErrorNotice :error="libError" title="Could not load the TL-B runtime" />
    <LoadingState v-if="!libs && !libError" label="Loading the TL-B runtime…" />

    <template v-if="libs">
      <div class="space-y-2">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="Preset" class="min-w-56 flex-1 sm:flex-none">
            <USelect v-model="presetId" :items="presetItems" class="w-full sm:w-64" />
          </UFormField>
          <p class="pb-1.5 text-xs text-dimmed">
            Loads a schema you can edit. Your own schema works too.
          </p>
        </div>
        <UFormField label="TL-B schema" :error="schemaError || undefined">
          <UTextarea
            v-model="schemaText"
            :rows="8"
            autoresize
            :maxrows="18"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>
        <details v-if="types.length" class="text-sm">
          <summary class="cursor-pointer text-muted">
            {{ types.length }} type{{ types.length === 1 ? '' : 's' }} compiled
          </summary>
          <ul class="mt-2 max-h-64 space-y-1 overflow-auto font-mono text-xs">
            <li v-for="t in types" :key="t.name">
              <span class="text-highlighted">{{ t.name }}</span>
              <span class="text-dimmed"> = </span>
              <span v-for="(c, i) in t.constructors" :key="c.name">
                <span v-if="i" class="text-dimmed"> | </span>{{ c.name }}<span class="text-primary">{{ c.tag }}</span>
              </span>
            </li>
          </ul>
        </details>
      </div>

      <UTabs
        v-model="tab"
        :content="false"
        :items="[
          { label: 'Decode', value: 'decode', icon: 'i-lucide-arrow-down-to-line' },
          { label: 'Encode', value: 'encode', icon: 'i-lucide-arrow-up-from-line' }
        ]"
        class="w-full"
      />

      <div v-if="tab === 'decode'" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <UFormField label="Cell (BOC)" hint="base64 or hex">
            <UTextarea
              v-model="boc"
              :rows="3"
              autoresize
              :maxrows="8"
              class="w-full"
              :ui="{ base: 'font-mono text-xs break-all' }"
              placeholder="te6cck…"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </UFormField>
          <UFormField label="Decode as type">
            <USelect v-model="typeName" :items="typeItems" class="w-full" />
          </UFormField>
        </div>
        <UButton
          v-if="preset?.example && !boc"
          :label="`Try: ${preset.example.note}`"
          icon="i-lucide-sparkles"
          variant="link"
          size="sm"
          class="px-0 text-left"
          @click="tryExample"
        />

        <UAlert v-if="decoded && 'error' in decoded" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="Could not decode" :description="decoded.error" />
        <template v-else-if="decoded">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="primary" variant="subtle" :label="decoded.ok.type" />
            <UBadge
              v-if="decoded.ok.leftover.bits || decoded.ok.leftover.refs"
              color="warning"
              variant="subtle"
              :label="`${decoded.ok.leftover.bits} bits and ${decoded.ok.leftover.refs} refs left unread`"
            />
            <UBadge v-else color="success" variant="subtle" label="Whole cell consumed" />
            <UButton label="Edit as JSON" icon="i-lucide-pencil" size="xs" variant="soft" class="ml-auto" @click="editAsJson" />
          </div>
          <JsonView :value="decoded.ok.value" label="Decoded" />
          <ResultField label="Cell hash" :value="decoded.ok.cellHash" />
          <p class="text-xs text-dimmed">
            Integers are strings (no precision loss), addresses are bounceable EQ… form, bit strings are hex with TON's
            <code class="font-mono">_</code> completion tag, and cells are base64 BOCs. A constructor shows as
            <code class="font-mono">Type_constructor</code> in <code class="font-mono">kind</code>.
          </p>
        </template>
      </div>

      <div v-else class="space-y-4">
        <UFormField label="JSON" hint="Same shape the decoder outputs">
          <UTextarea
            v-model="json"
            :rows="8"
            autoresize
            :maxrows="20"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
            placeholder="{ &quot;kind&quot;: &quot;InternalMsgBody_excesses&quot;, &quot;query_id&quot;: &quot;0&quot; }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>
        <p v-if="!json" class="text-sm text-muted">
          Decode a cell first and press <strong>Edit as JSON</strong>, change a value, and the new BOC appears here.
        </p>
        <UAlert v-if="encoded && 'error' in encoded" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="Could not encode" :description="encoded.error" />
        <template v-else-if="encoded">
          <div class="divide-y divide-default">
            <ResultField label="BOC (base64)" :value="encoded.boc" />
            <ResultField label="BOC (hex)" :value="encoded.hex" />
            <ResultField label="Cell hash" :value="encoded.hash" />
          </div>
          <UButton label="Decode this BOC" icon="i-lucide-arrow-down-to-line" size="sm" variant="soft" @click="decodeEncoded" />
        </template>
      </div>

      <p class="text-xs text-dimmed">
        Runs in your browser with <code class="font-mono">@ton-community/tlb-runtime</code>. It does not support dependent types such as
        <code class="font-mono">SnakeData ~n</code> or <code class="font-mono">HashmapAugE</code> encoding; simplify those fields to
        <code class="font-mono">Cell</code> or <code class="font-mono">^Cell</code> to inspect the rest.
      </p>
    </template>
  </div>
</template>
