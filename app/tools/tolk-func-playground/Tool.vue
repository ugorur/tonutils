<script setup lang="ts">
import * as counter from '~/lib/compilers/examples/counter'
import { decodeProject, encodeProject, funcSources, normalizePath, tolkSources, type Lang, type SourceFile } from '~/lib/compilers/files'
import ProjectEditor from '~/lib/compilers/ProjectEditor.vue'
import { describeExitCode } from '~/lib/tx-dev/exitCodes'
import { loadFunc, loadSandbox, loadTolk } from '~/utils/lazy'
import { compiledJson, deployInfo, fromFunc, fromTolk, parseData, stackToJson, type CompileOutput, type CompileSuccess, type GetMethodInfo, type StackJson } from './logic'

const { isTestnet } = useTonNetwork()

const lang = ref<Lang>('tolk')
const projects = reactive<Record<Lang, SourceFile[]>>({ tolk: counter.tolkFiles, func: counter.funcFiles })
const active = ref(0)
const files = computed({ get: () => projects[lang.value], set: v => (projects[lang.value] = v) })
const dataInput = ref(counter.COUNTER_DATA)
const workchain = ref(0)
const stackComments = ref(false)
const srcLineComments = ref(false)

const LANGS = [{ label: 'Tolk', value: 'tolk' }, { label: 'FunC', value: 'func' }]
const WORKCHAINS = [{ label: 'Basechain (0)', value: 0 }, { label: 'Masterchain (-1)', value: -1 }]

// ---------------------------------------------------------------- examples
interface Reference { hash: string, label: string, address: string }
const reference = ref<Reference | null>(null)

interface Example { lang: Lang, files: SourceFile[], data: string, ref?: Reference }
const EXAMPLES: { label: string, load: () => Promise<Example> }[] = [
  { label: 'Tolk: counter', load: async () => ({ lang: 'tolk', files: counter.tolkFiles, data: counter.COUNTER_DATA }) },
  {
    label: 'Tolk: wallet (tolk-js test suite, 3 files)',
    load: async () => ({ lang: 'tolk', files: (await import('~/lib/compilers/examples/tolk-js-wallet')).files, data: '' })
  },
  { label: 'FunC: counter', load: async () => ({ lang: 'func', files: counter.funcFiles, data: counter.COUNTER_DATA }) },
  {
    label: 'FunC: DOGS jetton minter (mainnet, 6 files)',
    load: async () => {
      const d = await import('~/lib/compilers/examples/dogs-minter')
      return { lang: 'func', files: d.files, data: d.DATA_BOC, ref: { hash: d.CODE_HASH, label: 'the DOGS jetton minter on mainnet', address: d.DOGS_MASTER } }
    }
  }
]

async function loadExample(i: number) {
  const ex = await EXAMPLES[i]!.load()
  lang.value = ex.lang
  projects[ex.lang] = ex.files
  active.value = 0
  dataInput.value = ex.data
  reference.value = ex.ref ?? null
  await compile()
}

const exampleItems = EXAMPLES.map((e, i) => ({ label: e.label, onSelect: () => loadExample(i) }))

// ---------------------------------------------------------------- compile
const compiling = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<CompileOutput | null>(null)
const versions = reactive<Partial<Record<Lang, string>>>({})
const ok = computed(() => (result.value?.ok ? result.value : null))

async function compile() {
  const list = files.value
  if (!list.length || !list[0]!.content.trim()) return
  error.value = null
  compiling.value = true
  runs.value = {}
  const t0 = performance.now()
  try {
    if (lang.value === 'tolk') {
      const tolk = await loadTolk()
      const r = await tolk.compile(tolkSources(list), normalizePath(list[0]!.path), { withStackComments: stackComments.value, withSrcLineComments: srcLineComments.value })
      result.value = fromTolk(r, performance.now() - t0)
      versions.tolk ??= await tolk.version()
    }
    else {
      const [func, stdlib] = await Promise.all([loadFunc(), import('~/lib/compilers/stdlib.fc?raw').then(m => m.default)])
      const { sources, addedStdlib } = funcSources(list, stdlib)
      const r = await func.compile(sources, [normalizePath(list[0]!.path)])
      result.value = fromFunc(r, list, addedStdlib, performance.now() - t0)
      versions.func ??= (await func.version()).funcVersion
    }
  }
  catch (e) {
    result.value = null
    error.value = e
  }
  finally {
    compiling.value = false
  }
}

// Switching language by hand: the old output and reference no longer apply.
const langTab = computed({
  get: () => lang.value,
  set: (v: Lang) => {
    lang.value = v
    result.value = null
    reference.value = null
    active.value = 0
  }
})

const stem = computed(() => normalizePath(files.value[0]?.path ?? 'contract').split('/').pop()!.replace(/\.\w+$/, '') || 'contract')

function downloadJson(r: CompileSuccess) {
  downloadText(compiledJson(r.codeBoc64), `${stem.value}.compiled.json`, 'application/json')
}

function downloadFift(r: CompileSuccess) {
  downloadText(r.fiftCode, `${stem.value}.fif`, 'text/plain')
}

// ---------------------------------------------------------------- deploy address
const deploy = computed(() => {
  if (!ok.value) return null
  try {
    return { info: deployInfo(ok.value.codeBoc64, parseData(dataInput.value), workchain.value, isTestnet.value), error: null }
  }
  catch (e) {
    return { info: null, error: e instanceof Error ? e.message : String(e) }
  }
})

// ---------------------------------------------------------------- get methods (local TVM)
interface Run { loading: boolean, exitCode?: number, gasUsed?: string, stack?: StackJson[], debug?: string, vmLog?: string, error?: unknown }
const runs = ref<Record<string, Run>>({})
watch([dataInput, workchain], () => (runs.value = {}))

async function runMethod({ name, id }: GetMethodInfo) {
  const info = deploy.value?.info
  if (!ok.value || !info) return
  runs.value[name] = { loading: true }
  try {
    const sb = await loadSandbox()
    const r = await sb.runGetMethod({ code: ok.value.codeBoc64, data: parseData(dataInput.value), address: info.raw, method: id ?? name })
    runs.value[name] = { loading: false, exitCode: r.exitCode, gasUsed: r.gasUsed.toString(), stack: stackToJson(r.stack), debug: r.debugLogs.trim(), vmLog: r.vmLog.trim() }
  }
  catch (e) {
    runs.value[name] = { loading: false, error: e }
  }
}

// ---------------------------------------------------------------- share link
const shareUrl = ref('')
async function share() {
  const hash = await encodeProject({ lang: lang.value, files: files.value, data: dataInput.value.trim() })
  const url = new URL(location.href)
  url.hash = hash
  history.replaceState(history.state, '', url)
  shareUrl.value = url.toString()
}
watch([files, lang, dataInput], () => (shareUrl.value = ''))

const convertLink = ref('')
watch([files, lang], async () => {
  convertLink.value = lang.value === 'func' ? `/tools/func-to-tolk-converter#${await encodeProject({ lang: 'func', files: files.value })}` : ''
}, { immediate: true })

onMounted(async () => {
  const p = await decodeProject(location.hash)
  if (!p) return
  lang.value = p.lang
  projects[p.lang] = p.files
  dataInput.value = p.data ?? ''
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UTabs v-model="langTab" :items="LANGS" :content="false" size="sm" class="w-44" />
      <UDropdownMenu :items="exampleItems">
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="soft" size="sm" trailing-icon="i-lucide-chevron-down" />
      </UDropdownMenu>
    </div>

    <ProjectEditor
      v-model="files"
      v-model:active="active"
      :ext="lang === 'tolk' ? 'tolk' : 'fc'"
      :accept="lang === 'tolk' ? '.tolk' : '.fc,.func'"
      :placeholder="lang === 'tolk' ? 'fun onInternalMessage(in: InMessage) { … }' : '() recv_internal(slice in_msg_body) impure { … }'"
    />

    <div class="space-y-2 text-xs text-muted">
      <p v-if="lang === 'tolk'">
        Tolk's standard library is built in: <code class="font-mono">import "@stdlib/…"</code> works as is. Relative imports resolve against the file paths above.
      </p>
      <p v-else>
        <code class="font-mono">#include "…/stdlib.fc"</code> gets Blueprint's stdlib.fc automatically if you don't add your own copy.
        Moving to Tolk? <ULink :to="convertLink" class="text-primary">Convert this project</ULink>.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <UButton label="Compile" icon="i-lucide-hammer" :loading="compiling" :disabled="!files[0]?.content.trim()" @click="compile" />
      <template v-if="lang === 'tolk'">
        <UCheckbox v-model="stackComments" label="Stack comments in Fift" />
        <UCheckbox v-model="srcLineComments" label="Source lines in Fift" />
      </template>
    </div>

    <ErrorNotice v-if="error" :error="error" title="The compiler failed to start" @retry="compile" />
    <LoadingState v-else-if="compiling" :label="`Compiling with ${lang === 'tolk' ? 'Tolk' : 'FunC'} (the first run downloads the ~9 MB compiler)…`" />

    <template v-if="result && !compiling">
      <div v-if="!result.ok" class="space-y-2" role="alert">
        <UAlert color="error" variant="subtle" icon="i-lucide-circle-x" title="Compilation failed" />
        <pre class="max-h-96 overflow-auto rounded-md border border-error/40 bg-error/5 p-3 font-mono text-xs leading-5 whitespace-pre-wrap" data-testid="compile-error">{{ result.message }}</pre>
      </div>

      <template v-else>
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          title="Compiled"
          :description="`${result.lang === 'tolk' ? 'Tolk' : 'FunC'} ${versions[result.lang] ?? ''} · ${Math.round(result.ms)} ms${result.addedStdlib.length ? ` · bundled stdlib.fc supplied for ${result.addedStdlib.join(', ')}` : ''}`"
        />
        <UAlert
          v-if="reference"
          :color="reference.hash === result.codeHashHex ? 'success' : 'warning'"
          variant="subtle"
          :icon="reference.hash === result.codeHashHex ? 'i-lucide-badge-check' : 'i-lucide-triangle-alert'"
          :title="reference.hash === result.codeHashHex ? `Same code hash as ${reference.label}` : `Code hash differs from ${reference.label}`"
          :description="reference.hash === result.codeHashHex ? 'These sources reproduce the deployed contract bit for bit.' : `On-chain: ${reference.hash}`"
        />

        <div class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <ResultField label="Code hash (hex)" :value="result.codeHashHex" />
          <ResultField label="Code hash (base64)" :value="result.codeHashB64" />
        </div>
        <ResultField label="Code BOC (base64)" :value="result.codeBoc64" hint="The contract's code cell, ready for a StateInit or blueprint.">
          <span class="line-clamp-3">{{ result.codeBoc64 }}</span>
        </ResultField>

        <div v-if="result.warnings" class="space-y-1">
          <h3 class="text-sm font-medium text-warning">
            Compiler warnings
          </h3>
          <pre class="max-h-60 overflow-auto rounded-md border border-warning/40 bg-warning/5 p-3 font-mono text-xs whitespace-pre-wrap">{{ result.warnings }}</pre>
        </div>

        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-medium text-highlighted">
              Fift assembly
            </h3>
            <div class="flex items-center gap-1">
              <CopyButton :value="result.fiftCode" label="Copy" />
              <UButton label=".fif" icon="i-lucide-download" size="sm" variant="ghost" color="neutral" @click="downloadFift(result)" />
              <UButton label="compiled.json" icon="i-lucide-download" size="sm" variant="ghost" color="neutral" @click="downloadJson(result)" />
            </div>
          </div>
          <pre class="max-h-[50vh] overflow-auto rounded-md border border-default bg-elevated/50 p-3 font-mono text-xs leading-5" data-testid="fift">{{ result.fiftCode }}</pre>
          <p class="text-xs text-dimmed">
            compiled.json has Blueprint's format (<code class="font-mono">hash</code>, <code class="font-mono">hashBase64</code>, <code class="font-mono">hex</code>).
            Inspect the code cell in the <ULink to="/tools/code-disassembler" class="text-primary">disassembler</ULink>.
          </p>
        </div>

        <div class="space-y-3 border-t border-default pt-5">
          <h3 class="font-medium text-highlighted">
            Deploy address
          </h3>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <UFormField label="Initial data (BOC, base64 or hex)" hint="Empty = empty cell">
              <UTextarea v-model="dataInput" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc…" spellcheck="false" />
            </UFormField>
            <UFormField label="Workchain">
              <USelect v-model="workchain" :items="WORKCHAINS" class="w-full sm:w-44" />
            </UFormField>
          </div>
          <UAlert v-if="deploy?.error" color="error" variant="subtle" icon="i-lucide-circle-x" title="Initial data is not a valid BOC" :description="deploy.error" />
          <template v-else-if="deploy?.info">
            <ResultField label="Address (bounceable)" :value="deploy.info.bounceable">
              <AddressLink :address="deploy.info.bounceable" full />
            </ResultField>
            <div class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <ResultField label="Non-bounceable" :value="deploy.info.nonBounceable" />
              <ResultField label="Raw" :value="deploy.info.raw" />
            </div>
            <ResultField label="StateInit BOC (base64)" :value="deploy.info.stateInitBoc" :hint="`Code + data. Attach it to the first message sent to this address to deploy (${isTestnet ? 'testnet' : 'mainnet'} address format).`">
              <span class="line-clamp-2">{{ deploy.info.stateInitBoc }}</span>
            </ResultField>
          </template>
        </div>

        <div class="space-y-3 border-t border-default pt-5">
          <h3 class="font-medium text-highlighted">
            Get methods
          </h3>
          <p v-if="!result.getMethods.length" class="text-sm text-muted">
            No get methods found.
          </p>
          <p v-else class="text-xs text-dimmed">
            Runs in a local TVM (@ton/sandbox) on the code above and the initial data. Nothing is deployed.
          </p>
          <div v-for="m in result.getMethods" :key="m.name" class="space-y-2 rounded-md border border-default p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="min-w-0 font-mono text-sm break-all">{{ m.name }}<span class="text-dimmed">{{ m.params ? `(${m.params} ${m.params === 1 ? 'arg' : 'args'})` : '()' }}</span></span>
              <UBadge v-if="m.id !== undefined" :label="`id ${m.id}`" size="sm" variant="soft" color="neutral" class="font-mono" />
              <UButton
                v-if="!m.params"
                label="Run"
                icon="i-lucide-play"
                size="xs"
                class="ml-auto"
                :loading="runs[m.name]?.loading"
                :disabled="!deploy?.info"
                @click="runMethod(m)"
              />
              <span v-else class="ml-auto text-xs text-dimmed">takes arguments: try the <ULink to="/tools/local-get-method-emulator" class="text-primary">get-method emulator</ULink></span>
            </div>
            <template v-if="runs[m.name] && !runs[m.name]!.loading">
              <ErrorNotice v-if="runs[m.name]!.error" :error="runs[m.name]!.error" @retry="runMethod(m)" />
              <template v-else>
                <p class="text-xs" :class="runs[m.name]!.exitCode! <= 1 ? 'text-success' : 'text-error'">
                  Exit code {{ runs[m.name]!.exitCode }}: {{ describeExitCode(runs[m.name]!.exitCode!) }} · gas {{ runs[m.name]!.gasUsed }}
                </p>
                <JsonView v-if="runs[m.name]!.exitCode! <= 1" :value="runs[m.name]!.stack" label="Result stack" />
                <pre v-if="runs[m.name]!.debug" class="max-h-40 overflow-auto rounded bg-elevated/50 p-2 font-mono text-xs whitespace-pre-wrap" aria-label="Debug output">{{ runs[m.name]!.debug }}</pre>
                <details v-if="runs[m.name]!.vmLog" class="text-xs">
                  <summary class="cursor-pointer text-muted">
                    VM log
                  </summary>
                  <pre class="mt-1 max-h-60 overflow-auto rounded bg-elevated/50 p-2 font-mono whitespace-pre-wrap">{{ runs[m.name]!.vmLog }}</pre>
                </details>
              </template>
            </template>
          </div>
        </div>
      </template>
    </template>

    <div class="space-y-2 border-t border-default pt-5">
      <div class="flex flex-wrap items-center gap-2">
        <UButton label="Share as link" icon="i-lucide-link" variant="soft" color="neutral" size="sm" @click="share" />
        <span class="text-xs text-dimmed">The whole project and the initial data go into the link's #fragment, which browsers never send to a server.</span>
      </div>
      <ResultField v-if="shareUrl" label="Share link" :value="shareUrl">
        <span class="line-clamp-2">{{ shareUrl }}</span>
      </ResultField>
    </div>
  </div>
</template>
