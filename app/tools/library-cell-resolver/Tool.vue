<script setup lang="ts">
import type { LibraryRef } from '~/lib/contracts-read/cells'
import { cellFromApi, findLibraryCells, statsText } from '~/lib/contracts-read/cells'
import { libraryQuery, parseResolverInput, pickLibrary, type LibrariesResult, type ResolvedLibrary } from './logic'

const EXAMPLES = [
  { label: 'USD₮ jetton wallet', value: 'EQAmJs8wtwK93thF78iD76RQKf9Z3v2sxM57iwpZZtdQAiVM' },
  { label: 'Library hash', value: '8f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68' }
]

const route = useRoute()
const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const tc = useToncenter()

interface Row { ref: LibraryRef, resolved: ResolvedLibrary | null, error?: unknown }
const loading = ref(false)
const error = ref<unknown>(null)
const source = ref('')
const codeHash = ref('')
const rows = ref<Row[]>([])
const done = ref(false)

async function run() {
  error.value = null
  rows.value = []
  done.value = false
  codeHash.value = ''
  loading.value = true
  try {
    const parsed = parseResolverInput(input.value)
    let refs: LibraryRef[]
    if (parsed.kind === 'hash') {
      source.value = 'Library hash'
      refs = [{ cellHash: '', libraryHash: parsed.hex, path: 'given' }]
    }
    else {
      let cell = parsed.kind === 'boc' ? parsed.cell : null
      if (parsed.kind === 'address') {
        const acc = await tc.v3<{ code: string | null, status: string }>('account', { address: parsed.address.toRawString() })
        if (!acc.code) throw new Error(`This account has no code (status: ${acc.status}). Only deployed contracts have code.`)
        cell = cellFromApi(acc.code)
        source.value = 'Account code'
      }
      else source.value = 'Pasted BOC'
      codeHash.value = cell!.hash().toString('hex')
      refs = findLibraryCells(cell!)
    }
    // ponytail: one request per library; a contract with more than a handful of libraries is unheard of
    for (const ref of refs.slice(0, 10)) {
      try {
        const res = await tc.v2<LibrariesResult>('getLibraries', { libraries: libraryQuery(ref.libraryHash) })
        rows.value.push({ ref, resolved: pickLibrary(res, ref.libraryHash) })
      }
      catch (e) {
        rows.value.push({ ref, resolved: null, error: e })
      }
    }
    done.value = true
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function useExample(v: string) {
  input.value = v
  run()
}

const toolLink = (slug: string, q: string) => `/tools/${slug}?q=${encodeURIComponent(q)}`

if (input.value) onMounted(run)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Address, code BOC or library hash" help="Address: we read its code from the chain. BOC: base64 (te6cc…) or hex. Hash: 64 hex characters or base64.">
        <UTextarea v-model="input" :rows="2" autoresize class="w-full font-mono" placeholder="EQ… / 0:… / te6cc… / 8f452d7a…" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Resolve" icon="i-lucide-search" :loading="loading" :disabled="!input.trim()" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="run" />
    <LoadingState v-else-if="loading && !rows.length" label="Reading code and libraries…" />

    <template v-if="done || rows.length">
      <ResultField v-if="codeHash" :label="`${source} hash (what explorers show)`" :value="codeHash" />

      <UAlert
        v-if="done && !rows.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="No library cells"
        description="This code is stored directly, not through a library. Its hash above is the real code hash."
      />

      <div v-for="row in rows" :key="row.ref.libraryHash + row.ref.path" class="space-y-3 rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="row.ref.path !== 'given'" color="neutral" variant="subtle" :label="row.ref.path === 'root' ? 'Whole code is a library cell' : `Library cell at ${row.ref.path}`" />
          <UBadge v-if="row.resolved" color="success" variant="subtle" icon="i-lucide-check" label="Resolved, hash verified" />
          <UBadge v-else-if="!row.error" color="warning" variant="subtle" label="Not found on chain" />
        </div>

        <ResultField v-if="row.ref.cellHash && row.ref.path !== 'root'" label="Library cell hash" :value="row.ref.cellHash" hint="Hash of the 33-byte exotic cell (tag 0x02 + library hash)." />
        <ResultField label="Library hash = real code hash" :value="row.ref.libraryHash" hint="Use this hash to look up verified source or compare with known contracts." />

        <ErrorNotice v-if="row.error" :error="row.error" @retry="run" />
        <UAlert
          v-else-if="!row.resolved"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="No public library with this hash"
          description="The masterchain has no library with this hash on the selected network. A contract that needs it cannot run."
        />

        <template v-if="row.resolved">
          <KeyValue
            :items="[
              { label: 'Code size', value: statsText(row.resolved.summary.stats), mono: false, copy: false },
              ...(row.resolved.summary.wallet ? [{ label: 'Recognised as', value: row.resolved.summary.wallet.label, mono: false, copy: false }] : [])
            ]"
          />
          <div>
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-highlighted">Resolved code (BOC, base64)</span>
              <CopyButton :value="row.resolved.boc" label="Copy" />
            </div>
            <pre class="max-h-32 overflow-auto rounded-md bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap">{{ row.resolved.boc }}</pre>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <ULink :to="toolLink('contract-source-verifier-lookup', row.ref.libraryHash)" class="text-primary">Look up verified source</ULink>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
