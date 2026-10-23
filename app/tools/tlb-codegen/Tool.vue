<script setup lang="ts">
import { loadTlbParser, loadTlbRuntime } from '~/utils/lazy'
import { TLB_PRESETS } from '~/lib/tlb/presets'
import type { TlbCodegen } from './codegen'
import { loadTlbCodegen } from './codegen'
import type { Generated, TlbSyntax } from './logic'
import { generateTypescript } from './logic'

const libs = shallowRef<{ cg: TlbCodegen, parser: TlbSyntax } | null>(null)
const libError = ref<unknown>(null)
onMounted(async () => {
  try {
    const [cg, parser] = await Promise.all([loadTlbCodegen(), loadTlbParser()])
    libs.value = { cg, parser: parser as unknown as TlbSyntax }
  }
  catch (e) {
    libError.value = e
  }
})

const presets = TLB_PRESETS.filter(p => p.codegen !== false)
const presetItems = presets.map(p => ({ label: p.label, value: p.id }))
const presetId = ref<string>()
const schema = ref('')

watch(presetId, async (id) => {
  const p = presets.find(x => x.id === id)
  if (!p) return
  schema.value = (p.schema ?? (await loadTlbRuntime()).blockSchema).trim() + '\n'
})

const result = shallowRef<Generated | null>(null)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch([schema, libs], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!libs.value || !schema.value.trim()) {
      result.value = null
      error.value = ''
      return
    }
    try {
      result.value = generateTypescript(libs.value.cg, libs.value.parser, schema.value)
      error.value = ''
    }
    catch (e) {
      result.value = null
      error.value = (e as Error).message
    }
  }, 300)
})

const lines = computed(() => result.value ? result.value.code.split('\n').length : 0)
// the type the user most likely wants: the last one declared (TL-B convention: the "main" type comes last)
const mainLoader = computed(() => result.value?.loaders.at(-1))
const usage = computed(() => {
  const l = mainLoader.value
  if (!l) return ''
  const s = l.replace(/^load/, 'store')
  return `import { beginCell, Cell } from '@ton/core'
import { ${l}, ${s} } from './tlb'

const value = ${l}(Cell.fromBase64(boc).beginParse())
const cell = beginCell().store(${s}(value)).endCell()`
})

function download() {
  if (result.value) downloadText(result.value.code, 'tlb.ts', 'text/typescript')
}
</script>

<template>
  <div class="space-y-6">
    <ErrorNotice :error="libError" title="Could not load the code generator" />
    <LoadingState v-if="!libs && !libError" label="Loading the TL-B code generator…" />

    <template v-if="libs">
      <div class="space-y-2">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="Start from" class="min-w-56 flex-1 sm:flex-none">
            <USelect v-model="presetId" :items="presetItems" placeholder="Choose a preset…" class="w-full sm:w-64" />
          </UFormField>
          <UButton v-if="!schema" label="Try the jetton (TEP-74) schema" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0 pb-1.5" @click="presetId = 'tep74'" />
        </div>
        <UFormField label="TL-B schema" :error="error || undefined">
          <UTextarea
            v-model="schema"
            :rows="8"
            autoresize
            :maxrows="18"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
            placeholder="transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) … = InternalMsgBody;"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>
      </div>

      <template v-if="result">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="primary" variant="subtle" :label="`${result.loaders.length} load functions`" />
          <UBadge color="primary" variant="subtle" :label="`${result.storers.length} store functions`" />
          <UBadge color="neutral" variant="subtle" :label="`${lines} lines`" />
          <div class="ml-auto flex gap-2">
            <CopyButton :value="result.code" label="Copy code" size="sm" />
            <UButton label="Download tlb.ts" icon="i-lucide-download" size="sm" variant="soft" @click="download" />
          </div>
        </div>
        <div class="overflow-hidden rounded-md border border-default bg-muted">
          <pre class="max-h-[32rem] overflow-auto p-3 font-mono text-xs leading-relaxed text-default">{{ result.code }}</pre>
        </div>

        <div v-if="usage" class="space-y-1">
          <h3 class="text-sm font-medium text-highlighted">
            How to use it
          </h3>
          <div class="overflow-hidden rounded-md border border-default bg-muted">
            <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
              <span class="text-xs text-muted">example.ts</span>
              <CopyButton :value="usage" size="xs" />
            </div>
            <pre class="overflow-auto p-3 font-mono text-xs leading-relaxed text-default">{{ usage }}</pre>
          </div>
        </div>
      </template>
      <p v-else-if="!schema" class="text-sm text-muted">
        Paste a schema or pick a preset. The code appears as you type.
      </p>

      <p class="text-xs text-dimmed">
        Generated in your browser by <code class="font-mono">@ton-community/tlb-codegen</code> 2.0.0-beta.3. The code needs only
        <code class="font-mono">@ton/core</code>. Every TL-B type becomes an interface with a <code class="font-mono">kind</code> per constructor,
        plus <code class="font-mono">load…(slice)</code> and <code class="font-mono">store…(value)(builder)</code>. Integers wider than 32 bits are
        <code class="font-mono">bigint</code>. Test the result against real cells in the TL-B playground before relying on it.
      </p>
    </template>
  </div>
</template>
