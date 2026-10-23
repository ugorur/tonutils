<script setup lang="ts">
import { version as TOLK_VERSION } from '@ton/tolk-js/package.json'
import * as counter from '~/lib/compilers/examples/counter'
import { decodeProject, encodeProject, normalizePath, type SourceFile } from '~/lib/compilers/files'
import ProjectEditor from '~/lib/compilers/ProjectEditor.vue'
import treeSitterWasm from '~/lib/compilers/vendor/tree-sitter.wasm?url'
import funcGrammarWasm from '~/lib/compilers/vendor/tree-sitter-func.wasm?url'
import { loadTolk } from '~/utils/lazy'
import { convertProject, DEFAULT_OPTIONS, initConverter, tolkFiles, type ConvertedFile, type ConvertOptions } from './logic'

const files = ref<SourceFile[]>(counter.funcFiles)
const active = ref(0)
const opts = reactive<ConvertOptions>({ ...DEFAULT_OPTIONS })

const EXAMPLES = [
  { label: 'Counter (1 file)', load: async () => counter.funcFiles },
  { label: 'DOGS jetton minter (mainnet, 6 files)', load: async () => (await import('~/lib/compilers/examples/dogs-minter')).files }
]
const exampleItems = EXAMPLES.map(e => ({
  label: e.label,
  onSelect: async () => {
    files.value = await e.load()
    active.value = 0
    await convert()
  }
}))

// ---------------------------------------------------------------- convert
let ready: Promise<void> | null = null
const bytes = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Could not load the FunC parser (${r.status})`)
  return r.arrayBuffer()
}).then(b => new Uint8Array(b))

const converting = ref(false)
const error = ref<unknown>(null)
const output = shallowRef<ConvertedFile[] | null>(null)
const outActive = ref(0)

async function convert() {
  if (!files.value.some(f => f.content.trim())) return
  error.value = null
  converting.value = true
  check.value = null
  try {
    ready ??= Promise.all([bytes(treeSitterWasm), bytes(funcGrammarWasm)]).then(([a, b]) => initConverter(a, b))
    await ready
    output.value = convertProject(files.value, opts, TOLK_VERSION)
    outActive.value = 0
  }
  catch (e) {
    ready = null
    output.value = null
    error.value = e
  }
  finally {
    converting.value = false
  }
}

// Changing an option re-runs the conversion so the output never shows stale settings.
watch(opts, () => output.value && convert())

const converted = computed(() => (output.value ? tolkFiles(output.value) : []))
const skipped = computed(() => output.value?.filter(f => f.kind === 'stdlib') ?? [])
const failed = computed(() => output.value?.flatMap(f => (f.kind === 'error' ? [f] : [])) ?? [])
const warnings = computed(() => output.value?.flatMap(f => (f.kind === 'converted' ? f.warnings.map(w => ({ ...w, path: f.path })) : [])) ?? [])

function downloadCurrent() {
  const f = converted.value[outActive.value]
  if (f) downloadText(f.content, f.path.split('/').pop()!, 'text/plain')
}

// ---------------------------------------------------------------- compile check
const checking = ref(false)
const check = shallowRef<{ ok: true, codeHashHex: string } | { ok: false, message: string } | null>(null)
const checkError = ref<unknown>(null)

async function compileCheck() {
  const list = converted.value
  if (!list.length) return
  checkError.value = null
  checking.value = true
  try {
    const tolk = await loadTolk()
    const r = await tolk.compile(Object.fromEntries(list.map(f => [normalizePath(f.path), f.content])), normalizePath(list[0]!.path))
    check.value = r.status === 'ok' ? { ok: true, codeHashHex: r.codeHashHex.toLowerCase() } : { ok: false, message: r.message }
  }
  catch (e) {
    check.value = null
    checkError.value = e
  }
  finally {
    checking.value = false
  }
}

const playgroundLink = ref('')
watch(converted, async (list) => {
  playgroundLink.value = list.length ? `/tools/tolk-func-playground#${await encodeProject({ lang: 'tolk', files: list })}` : ''
})

// Opened from the playground with a FunC project in the #fragment.
onMounted(async () => {
  const p = await decodeProject(location.hash)
  if (p?.lang !== 'func') return
  files.value = p.files
  await convert()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">
        Paste a FunC file, or open a whole project (the first file is the entrypoint).
      </p>
      <UDropdownMenu :items="exampleItems">
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="soft" size="sm" trailing-icon="i-lucide-chevron-down" />
      </UDropdownMenu>
    </div>

    <ProjectEditor v-model="files" v-model:active="active" ext="fc" accept=".fc,.func" label="FunC sources" placeholder="() recv_internal(slice in_msg_body) impure { … }" />

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <UButton label="Convert to Tolk" icon="i-lucide-arrow-right-left" :loading="converting" :disabled="!files.some(f => f.content.trim())" @click="convert" />
      <UCheckbox v-model="opts.camelCaseFunctions" label="camelCase function names" />
      <UCheckbox v-model="opts.camelCaseLocals" label="camelCase variables" />
      <UCheckbox v-model="opts.warningsAsComments" label="Warnings as comments in code" />
    </div>

    <ErrorNotice v-if="error" :error="error" @retry="convert" />
    <LoadingState v-else-if="converting" label="Converting…" />

    <template v-if="output && !converting">
      <UAlert
        v-if="skipped.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="`Skipped ${skipped.map(f => f.from).join(', ')}`"
        description="Tolk has its own standard library (common functions are built in, the rest via import &quot;@stdlib/…&quot;), so stdlib.fc is not converted and its #include is dropped."
      />
      <UAlert v-for="f in failed" :key="f.from" color="error" variant="subtle" icon="i-lucide-circle-x" :title="`Could not convert ${f.from}`" :description="f.error" />

      <template v-if="converted.length">
        <ProjectEditor :model-value="converted" v-model:active="outActive" ext="tolk" label="Tolk output" readonly />
        <div class="flex flex-wrap items-center gap-2">
          <CopyButton :value="converted[outActive]?.content ?? ''" label="Copy file" />
          <UButton label="Download file" icon="i-lucide-download" size="sm" variant="ghost" color="neutral" @click="downloadCurrent" />
          <UButton label="Compile check (Tolk)" icon="i-lucide-hammer" size="sm" variant="soft" :loading="checking" @click="compileCheck" />
          <UButton label="Open in compiler playground" icon="i-lucide-square-terminal" size="sm" variant="soft" color="neutral" :to="playgroundLink" :disabled="!playgroundLink" />
        </div>

        <div class="space-y-2">
          <h3 class="font-medium text-highlighted">
            Needs a manual look ({{ warnings.length }})
          </h3>
          <p v-if="!warnings.length" class="text-sm text-muted">
            The converter flagged nothing. Still compile and test the result: it is a syntax translation, not a proof of equal behaviour.
          </p>
          <ul v-else class="divide-y divide-default rounded-md border border-default text-sm">
            <li v-for="(w, i) in warnings" :key="i" class="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
              <span class="shrink-0 font-mono text-xs text-muted">{{ w.path }}:{{ w.line }}</span>
              <span class="min-w-0 break-words">{{ w.text }}</span>
            </li>
          </ul>
        </div>

        <ErrorNotice v-if="checkError" :error="checkError" title="The Tolk compiler failed to start" @retry="compileCheck" />
        <LoadingState v-else-if="checking" label="Compiling with Tolk (the first run downloads the ~9 MB compiler)…" />
        <template v-else-if="check">
          <UAlert v-if="check.ok" color="success" variant="subtle" icon="i-lucide-circle-check" :title="`Compiles with Tolk ${TOLK_VERSION}`" :description="`Code hash ${check.codeHashHex}. It will differ from the FunC build: same logic, different compiler.`" />
          <div v-else class="space-y-2" role="alert">
            <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`Does not compile with Tolk ${TOLK_VERSION} yet`" description="Usual for real contracts: fix what the compiler points at (often the warnings above), then compile again in the playground." />
            <pre class="max-h-80 overflow-auto rounded-md border border-warning/40 bg-warning/5 p-3 font-mono text-xs leading-5 whitespace-pre-wrap" data-testid="check-error">{{ check.message }}</pre>
          </div>
        </template>
      </template>
    </template>

    <p class="text-xs text-dimmed">
      Uses the official converter, @ton/convert-func-to-tolk 1.0.0, running in your browser; nothing is uploaded. It writes Tolk 1.0 syntax and we set the
      <code class="font-mono">tolk</code> version line to {{ TOLK_VERSION }}, the compiler used for the check.
    </p>
  </div>
</template>
