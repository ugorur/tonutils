<script setup lang="ts">
import type { Cell } from '@ton/core'
import { effectiveCode, fetchAccountState, fetchLibraries, libraryHashOf, parseCodeSource } from '~/lib/tvm-wasm/code'
import { loadTasm } from '~/utils/lazy'
import { compareCode, disassemble, type CodeComparison, type Disassembly } from './logic'

const EXAMPLES = [
  { label: 'USD₮ jetton master', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
  { label: 'USD₮ jetton wallet (library code)', value: 'EQAAAABc7L3CPp_kFdUwre5mfvNbTT20zEkIi08xkXmob5lS' }
]

const route = useRoute()
const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const tc = useToncenter()
const api = useTonapi()
const { network } = useTonNetwork()

interface Loaded {
  label: string
  address: string | null
  /** Hash of the stored code (a library cell when `library` is set). */
  storedHash: string
  library: string | null
  compiler: string | null
  dis: Disassembly
}

/** Address → code (+ library) from toncenter, method names from tonapi /inspect (best effort); BOC → decoded locally. */
async function load(value: string): Promise<Loaded> {
  const src = parseCodeSource(value)
  const tasmP = loadTasm()
  let code: Cell
  let stored: Cell
  let names: { id: number, method: string }[] = []
  let compiler: string | null = null
  let address: string | null = null
  if (src.kind === 'address') {
    address = src.address.toString({ testOnly: network.value === 'testnet' })
    const state = await fetchAccountState(tc, src.address)
    stored = state.code
    code = effectiveCode(state.code, state.libs)
    try {
      const r = await api.get<{ methods: { id: number, method: string }[], compiler?: string }>(`blockchain/accounts/${src.address.toRawString()}/inspect`)
      names = r.methods
      compiler = r.compiler ?? null
    }
    catch { /* names are a nice-to-have: fall back to the built-in list */ }
  }
  else {
    stored = src.cell
    code = src.cell
    const lib = libraryHashOf(code)
    if (lib) code = effectiveCode(code, await fetchLibraries(tc, [lib]))
  }
  const tasm = await tasmP
  return {
    label: address ?? 'Pasted BOC',
    address,
    storedHash: stored.hash().toString('hex'),
    library: libraryHashOf(stored),
    compiler,
    dis: disassemble(tasm, code, names)
  }
}

const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<Loaded | null>(null)
const view = ref<string>('all')

async function run() {
  if (!input.value.trim()) return
  error.value = null
  loading.value = true
  try {
    result.value = await load(input.value)
    view.value = 'all'
    comparison.value = null
  }
  catch (e) {
    result.value = null
    error.value = e
  }
  finally {
    loading.value = false
  }
}

const methodLabel = (m: { id: number, name: string | null }) => (m.name ? `${m.name} (${m.id})` : m.id > 0 && m.id < 0x10000 ? `proc ${m.id}` : `method ${m.id}`)
const viewItems = computed(() => [
  { label: 'Whole program', value: 'all' },
  ...(result.value?.dis.methods ?? []).map(m => ({ label: methodLabel(m), value: String(m.id) }))
])
const shownText = computed(() => {
  const d = result.value?.dis
  if (!d) return ''
  if (view.value === 'all') return d.text
  return d.methods.find(m => String(m.id) === view.value)?.text ?? ''
})

function download() {
  if (!result.value) return
  downloadText(result.value.dis.text + '\n', `${result.value.dis.hashHex.slice(0, 12)}.tasm`, 'text/plain')
}

// ---------------------------------------------------------------- compare
const otherInput = ref('')
const comparing = ref(false)
const compareError = ref<unknown>(null)
const other = shallowRef<Loaded | null>(null)
const comparison = shallowRef<CodeComparison | null>(null)

async function compare() {
  if (!result.value || !otherInput.value.trim()) return
  compareError.value = null
  comparing.value = true
  try {
    other.value = await load(otherInput.value)
    comparison.value = compareCode(result.value.dis, other.value.dis)
  }
  catch (e) {
    comparison.value = null
    compareError.value = e
  }
  finally {
    comparing.value = false
  }
}

const STATUS: Record<string, { label: string, color: 'warning' | 'success' | 'error' | 'neutral' }> = {
  changed: { label: 'changed', color: 'warning' },
  added: { label: 'only in B', color: 'success' },
  removed: { label: 'only in A', color: 'error' },
  same: { label: 'same', color: 'neutral' }
}
const counts = computed(() => {
  const c = { changed: 0, added: 0, removed: 0, same: 0 }
  for (const m of comparison.value?.methods ?? []) c[m.status]++
  return c
})
const lineClass = (op: string) => (op === '+' ? 'bg-success/10 text-success' : op === '-' ? 'bg-error/10 text-error' : 'text-muted')

// Code, libraries and explorer links belong to one network: drop results fetched on the other one.
watch(network, () => { result.value = null; other.value = null; comparison.value = null; error.value = null; compareError.value = null })

onMounted(() => {
  if (input.value) run()
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="run">
      <BocInput
        v-model="input"
        label="Contract address or code BOC"
        hint="EQ…/UQ…/0:… fetches the code; or paste a code BOC (base64 or hex)"
        :examples="EXAMPLES"
      />
      <UButton type="submit" label="Disassemble" icon="i-lucide-binary" :loading="loading" :disabled="!input.trim()" />
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="run" />
    <LoadingState v-else-if="loading" label="Fetching code and disassembling…" />

    <template v-if="result && !loading">
      <div class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <ResultField label="Code hash" :value="result.dis.hashHex" :hint="result.library ? 'Hash of the library code that actually runs.' : undefined" />
        <ResultField v-if="result.library" label="Stored code" value="Library cell (code lives on the masterchain)" :mono="false" :copy="false" hint="Resolved through toncenter getLibraries and checked against its hash." />
        <ResultField v-if="result.library" label="Stored library cell hash" :value="result.storedHash" />
        <ResultField v-if="result.compiler" label="Compiler (tonapi)" :value="result.compiler" :copy="false" />
        <ResultField v-if="result.address" label="Contract" :value="result.address" :copy="false">
          <AddressLink :address="result.address" full />
        </ResultField>
      </div>

      <div class="space-y-2">
        <h3 class="font-medium text-highlighted">
          Methods ({{ result.dis.methods.length }})
        </h3>
        <p v-if="!result.dis.methods.length" class="text-sm text-muted">
          No method dictionary: this code dispatches by hand (for example wallet v1–v3), so the program below is the single entry point.
        </p>
        <div v-else class="flex flex-wrap gap-1.5">
          <UButton
            v-for="m in result.dis.methods"
            :key="m.id"
            :label="methodLabel(m)"
            size="xs"
            class="font-mono"
            :variant="view === String(m.id) ? 'solid' : 'soft'"
            :color="view === String(m.id) ? 'primary' : (m.kind === 'entry' ? 'warning' : 'neutral')"
            @click="view = view === String(m.id) ? 'all' : String(m.id)"
          />
        </div>
        <p v-if="result.dis.methods.some(m => m.kind === 'get' && !m.name)" class="text-xs text-dimmed">
          Unnamed get-methods are custom: the id is crc16 of the name, which cannot be reversed without the source.
        </p>
        <p v-if="result.dis.methods.some(m => m.kind === 'proc')" class="text-xs text-dimmed">
          "proc N" entries are internal functions the compiler numbered and calls with CALLDICT N, not get-methods.
        </p>
      </div>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <USelect v-model="view" :items="viewItems" class="w-full font-mono sm:w-80" aria-label="Show" />
          <div class="flex items-center gap-1">
            <CopyButton :value="shownText" label="Copy" />
            <UButton label=".tasm" icon="i-lucide-download" size="sm" variant="ghost" color="neutral" @click="download" />
          </div>
        </div>
        <pre class="max-h-[70vh] overflow-auto rounded-md border border-default bg-elevated/50 p-3 font-mono text-xs leading-5" data-testid="asm">{{ shownText }}</pre>
        <p class="text-xs text-dimmed">
          TASM syntax (@ton/tasm, same as tonviewer's Code tab). The whole-program text assembles back to the same code hash in the
          <ULink to="/tools/fift-asm-assembler" class="text-primary">TVM assembler</ULink>.
        </p>
      </div>

      <div class="space-y-3 border-t border-default pt-5">
        <h3 class="font-medium text-highlighted">
          Compare with another contract
        </h3>
        <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="compare">
          <UInput v-model="otherInput" class="w-full font-mono" placeholder="Address or code BOC of contract B" aria-label="Contract B" autocomplete="off" spellcheck="false" />
          <UButton type="submit" label="Compare" icon="i-lucide-git-compare" :loading="comparing" :disabled="!otherInput.trim()" class="justify-center" />
        </form>
        <p class="text-xs text-dimmed">
          A = the contract above, B = this one. Useful to see what an upgrade changed, or whether two jettons share the same code.
        </p>
        <ErrorNotice v-if="compareError" :error="compareError" @retry="compare" />

        <template v-if="comparison && other">
          <UAlert v-if="comparison.identical" color="success" variant="subtle" icon="i-lucide-circle-check" title="Identical code" :description="`Both run code ${other.dis.hashHex}.`" />
          <template v-else>
            <p v-if="comparison.methods.length" class="text-sm">
              <span class="font-medium">{{ counts.changed }}</span> changed ·
              <span class="font-medium">{{ counts.added }}</span> only in B ·
              <span class="font-medium">{{ counts.removed }}</span> only in A ·
              <span class="font-medium">{{ counts.same }}</span> same
            </p>
            <div v-if="comparison.methods.length" class="space-y-2">
              <details v-for="m in comparison.methods" :key="m.id" class="rounded-md border border-default">
                <summary class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <span class="min-w-0 truncate font-mono">{{ methodLabel(m) }}</span>
                  <UBadge :label="STATUS[m.status]!.label" :color="STATUS[m.status]!.color" variant="subtle" size="sm" class="ml-auto" />
                </summary>
                <div class="border-t border-default p-2">
                  <p v-if="m.status === 'same'" class="text-xs text-muted">
                    Same instructions in both.
                  </p>
                  <p v-else-if="m.status !== 'changed'" class="text-xs text-muted">
                    This method exists only in {{ m.status === 'added' ? 'B' : 'A' }}.
                  </p>
                  <p v-else-if="!m.diff" class="text-xs text-muted">
                    Too large to diff in the browser.
                  </p>
                  <pre v-else class="max-h-96 overflow-auto font-mono text-xs leading-5"><div v-for="(l, i) in m.diff" :key="i" :class="lineClass(l.op)">{{ l.op }} {{ l.text }}</div></pre>
                </div>
              </details>
            </div>
            <template v-else>
              <p v-if="!comparison.whole" class="text-sm text-muted">
                One side has no method dictionary and the programs are too large to diff line by line.
              </p>
              <pre v-else class="max-h-[60vh] overflow-auto rounded-md border border-default p-2 font-mono text-xs leading-5"><div v-for="(l, i) in comparison.whole" :key="i" :class="lineClass(l.op)">{{ l.op }} {{ l.text }}</div></pre>
            </template>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>
