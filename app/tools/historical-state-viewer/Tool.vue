<script setup lang="ts">
import type { Cell } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { AccountSnapshot, McBlock } from '~/lib/accounts-history/state'
import { fetchAccountAt, fetchLibraries, libraryRef, libsDict, mcBlockAt, mcBlockBySeqno } from '~/lib/accounts-history/state'
import { loadSandbox } from '~/utils/lazy'
import type { StackRow } from './logic'
import { exitCodeHint, formatStack, parseArgs, parseWhen, suggestMethods } from './logic'

const EXAMPLE = { address: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N', when: '2024-01-01T00:00' }

const tc = useToncenter()
const { network, isTestnet } = useTonNetwork()

const address = ref('')
const mode = ref<'date' | 'seqno'>('date')
const when = ref('')
const seqnoInput = ref('')

const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<{ address: string, block: McBlock, state: AccountSnapshot } | null>(null)
const libs = shallowRef(new Map<string, Cell>())
let session = 0

const canLoad = computed(() => !!address.value.trim() && (mode.value === 'date' ? parseWhen(when.value) !== null : /^\d+$/.test(seqnoInput.value.trim())))

async function load() {
  if (!canLoad.value) return
  const my = ++session
  loading.value = true
  error.value = null
  result.value = null
  getResult.value = null
  try {
    const block = mode.value === 'date'
      ? await mcBlockAt(tc.v2, parseWhen(when.value)!)
      : await mcBlockBySeqno(tc.v2, Number(seqnoInput.value.trim()))
    const state = await fetchAccountAt(tc.v2, address.value.trim(), block.seqno)
    if (my !== session) return
    result.value = { address: address.value.trim(), block, state }
    const s = suggestMethods(state)
    if (!s.methods.includes(method.value)) method.value = s.methods[0]!
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

watch(network, () => {
  session++
  loading.value = false
  result.value = null
  getResult.value = null
  libs.value = new Map()
})

function example() {
  address.value = EXAMPLE.address
  mode.value = 'date'
  when.value = EXAMPLE.when
  load()
}

const fmtTime = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
const STATUS: Record<AccountSnapshot['status'], { label: string, color: 'success' | 'neutral' | 'info' | 'warning' }> = {
  active: { label: 'Active', color: 'success' },
  uninit: { label: 'Uninitialized (has a balance, no code yet)', color: 'info' },
  frozen: { label: 'Frozen (storage debt)', color: 'warning' },
  nonexist: { label: 'Did not exist at this block', color: 'neutral' }
}

const suggestions = computed(() => (result.value ? suggestMethods(result.value.state) : null))

const rows = computed<KeyValueItem[]>(() => {
  const s = result.value?.state
  if (!s) return []
  const out: KeyValueItem[] = []
  if (s.lastTxLt !== '0') out.push({ label: 'Last transaction lt', value: s.lastTxLt })
  if (s.storage) {
    out.push(
      { label: 'Storage used', value: `${s.storage.cells} cells, ${s.storage.bits} bits`, copy: false },
      { label: 'Storage fees last paid', value: s.storage.lastPaid ? fmtTime(s.storage.lastPaid) : '—', mono: false, copy: false }
    )
  }
  if (s.codeHash) out.push({ label: 'Code hash', value: s.codeHash })
  if (s.dataHash) out.push({ label: 'Data hash', value: s.dataHash })
  if (s.stateHash) out.push({ label: s.status === 'frozen' ? 'Frozen state hash' : 'StateInit hash', value: s.stateHash, hint: s.status === 'frozen' ? 'Hash of the code and data the account had when it was frozen.' : 'Hash of the code + data cell. An account frozen now could be restored with exactly this state.' })
  return out
})

// ---------------------------------------------------------------- get-methods
const method = ref('seqno')
const argsText = ref('')
const running = ref(false)
const getError = ref<unknown>(null)
const getResult = ref<{ method: string, exitCode: number, gasUsed: bigint, stack: StackRow[], logs: string } | null>(null)

async function runMethod() {
  const r = result.value
  if (!r?.state.code || !r.state.data || !method.value.trim()) return
  running.value = true
  getError.value = null
  getResult.value = null
  try {
    const stack = parseArgs(argsText.value)
    const sb = await loadSandbox()
    const known = new Map(libs.value)
    const codeLib = libraryRef(r.state.code)
    if (codeLib && !known.has(codeLib)) for (const [h, c] of await fetchLibraries(tc.v2, [codeLib])) known.set(h, c)
    // Code may reference more libraries deeper inside; fetch each one the emulator reports missing.
    for (let i = 0; i < 5; i++) {
      const res = await sb.runGetMethod({
        code: r.state.code,
        data: r.state.data,
        address: r.address,
        method: method.value.trim(),
        stack,
        balance: r.state.balance,
        unixTime: r.block.utime,
        libs: libsDict(known)
      })
      const missing = res.missingLibrary?.toLowerCase()
      if (missing && !known.has(missing)) {
        for (const [h, c] of await fetchLibraries(tc.v2, [missing])) known.set(h, c)
        continue
      }
      libs.value = known
      getResult.value = { method: method.value.trim(), exitCode: res.exitCode, gasUsed: res.gasUsed, stack: formatStack(res.stack, isTestnet.value), logs: res.debugLogs }
      return
    }
    throw new Error('The contract needs more library cells than expected.')
  }
  catch (e) {
    getError.value = e
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="load">
      <AddressInput v-model="address" label="Account address" required />

      <div class="space-y-2">
        <UTabs
          v-model="mode"
          :content="false"
          :items="[{ label: 'Date and time', value: 'date' }, { label: 'Block number', value: 'seqno' }]"
          variant="link"
          class="w-full"
        />
        <UFormField v-if="mode === 'date'" label="As of" hint="Your local time zone">
          <UInput v-model="when" type="datetime-local" class="w-full sm:w-72" size="lg" />
        </UFormField>
        <UFormField v-else label="Masterchain block seqno" hint="Find it on any explorer's block page">
          <UInput v-model="seqnoInput" inputmode="numeric" placeholder="35122647" class="w-full sm:w-72" size="lg" :ui="{ base: 'font-mono' }" />
        </UFormField>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" label="Show state" icon="i-lucide-history" :loading="loading" :disabled="!canLoad" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Finding the block and reading the account state…" />
    <ErrorNotice :error="error" title="Could not read the state" @retry="load" />

    <template v-if="result">
      <section class="space-y-3" aria-labelledby="hs-state">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="hs-state" class="font-display text-sm font-semibold text-highlighted">
            State at block #{{ result.block.seqno }}
          </h3>
          <span class="text-sm text-muted">{{ fmtTime(result.block.utime) }}</span>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-default p-4">
            <div class="text-xs text-muted">
              Status
            </div>
            <UBadge class="mt-1" :color="STATUS[result.state.status].color" variant="subtle" :label="STATUS[result.state.status].label" />
          </div>
          <div class="rounded-lg border border-default p-4">
            <div class="text-xs text-muted">
              Balance
            </div>
            <TokenAmount :nano="result.state.balance" class="mt-1 block text-lg" />
          </div>
          <div class="rounded-lg border border-default p-4">
            <div class="text-xs text-muted">
              Contract
            </div>
            <div class="mt-1 text-sm text-highlighted">
              {{ suggestions?.wallet ?? (result.state.code ? 'Smart contract' : 'No code') }}
            </div>
          </div>
        </div>

        <div class="text-sm">
          <AddressLink :address="result.address" />
        </div>

        <KeyValue :items="rows" />

        <div v-if="result.state.lastTxHash" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="text-muted">Last transaction before this block:</span>
          <ExplorerLinks kind="tx" :value="result.state.lastTxHash" />
        </div>

        <details v-if="result.state.code" class="rounded-lg border border-default p-3 text-sm">
          <summary class="cursor-pointer text-muted">
            Code and data BOC
          </summary>
          <ResultField label="Code (base64 BOC)" :value="result.state.code.toBoc().toString('base64')" class="[&_.font-mono]:max-h-40 [&_.font-mono]:overflow-auto" />
          <ResultField v-if="result.state.data" label="Data (base64 BOC)" :value="result.state.data.toBoc().toString('base64')" class="[&_.font-mono]:max-h-40 [&_.font-mono]:overflow-auto" />
        </details>
      </section>

      <section v-if="result.state.code && result.state.data" class="space-y-3 border-t border-default pt-6" aria-labelledby="hs-get">
        <h3 id="hs-get" class="font-display text-sm font-semibold text-highlighted">
          Run a get-method on this past state
        </h3>
        <p class="text-sm text-muted">
          Runs in a TVM emulator inside your browser with the code, data and balance shown above and the block's time. It uses today's network config.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="m in suggestions?.methods"
            :key="m"
            :label="m"
            size="xs"
            :variant="m === method ? 'solid' : 'outline'"
            color="neutral"
            class="font-mono"
            @click="method = m"
          />
        </div>
        <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="runMethod">
          <UFormField label="Method name">
            <UInput v-model="method" class="w-full" :ui="{ base: 'font-mono' }" autocomplete="off" spellcheck="false" />
          </UFormField>
          <UFormField label="Arguments (optional)" hint="Numbers, addresses or BOCs, one per line">
            <UTextarea v-model="argsText" :rows="1" autoresize class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
          <div>
            <UButton type="submit" label="Run" icon="i-lucide-play" :loading="running" :disabled="!method.trim()" />
          </div>
        </form>

        <LoadingState v-if="running" label="Loading the emulator and running…" />
        <ErrorNotice :error="getError" title="Could not run the method" @retry="runMethod" />

        <div v-if="getResult" class="space-y-2 rounded-lg border border-default p-4" data-testid="get-result">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-mono text-highlighted">{{ getResult.method }}()</span>
            <UBadge :color="getResult.exitCode <= 1 ? 'success' : 'error'" variant="subtle" :label="`exit code ${getResult.exitCode}`" />
            <span class="text-muted">{{ getResult.gasUsed }} gas</span>
          </div>
          <p v-if="exitCodeHint(getResult.exitCode)" class="text-sm text-warning">
            {{ exitCodeHint(getResult.exitCode) }}
          </p>
          <p v-if="getResult.exitCode <= 1 && !getResult.stack.length" class="text-sm text-muted">
            The method returned nothing.
          </p>
          <div v-for="(row, i) in getResult.stack" :key="i" class="border-t border-default pt-2">
            <ResultField :label="`#${i} · ${row.type}`" :value="row.value" class="[&_.font-mono]:max-h-32 [&_.font-mono]:overflow-auto" />
            <ResultField v-if="row.alt" :label="row.type === 'int' ? 'hex' : 'as address'" :value="row.alt" />
          </div>
        </div>
      </section>

      <UAlert
        v-else-if="result.state.status === 'frozen'"
        color="warning"
        variant="subtle"
        icon="i-lucide-snowflake"
        title="Frozen accounts have no code to run"
        description="Pick an earlier date to see the state before it was frozen. To restore it, use the Unfreeze account tool."
      />
    </template>
  </div>
</template>
