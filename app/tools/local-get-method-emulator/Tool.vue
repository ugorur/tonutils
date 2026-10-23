<script setup lang="ts">
import { Address } from '@ton/core'
import { fetchAccountState, type AccountState } from '~/lib/tvm-wasm/code'
import { readable, type ReadableItem } from '~/tools/tvm-stack-codec/logic'
import { loadSandbox, loadTasm, type GetMethodResult } from '~/utils/lazy'
import { availableMethods, buildRun, exitInfo, type ArgRow, type RunPlan } from './logic'

const EXAMPLES: { label: string, address: string, method: string, args: ArgRow[] }[] = [
  { label: 'Wallet v4r2: seqno', address: 'UQDOOjaP487stfk9E38me2LsuunR93JtiY3dGfPWOUOH9S8e', method: 'seqno', args: [] },
  { label: 'USD₮ master: get_wallet_address', address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', method: 'get_wallet_address', args: [{ type: 'address', value: 'UQBehRIx6FzdxsfsBvxVw5DZmgG-W-_M1UyNOzoOE4DPviCG' }] },
  { label: 'USD₮ jetton wallet (library code)', address: 'EQAAAABc7L3CPp_kFdUwre5mfvNbTT20zEkIi08xkXmob5lS', method: 'get_wallet_data', args: [] }
]
const ARG_TYPES = [
  { label: 'int', value: 'int' },
  { label: 'address', value: 'address' },
  { label: 'cell', value: 'cell' },
  { label: 'slice', value: 'slice' },
  { label: 'null', value: 'null' }
]

const { network } = useTonNetwork()
const tc = useToncenter()

// ---------------------------------------------------------------- state
const address = ref('')
const parsed = shallowRef<Address | null>(null)
const loadingState = ref(false)
const stateError = ref<unknown>(null)
const state = shallowRef<AccountState | null>(null)
const methods = shallowRef<{ id: number, name: string | null }[]>([])
const fetchedAt = ref<Date | null>(null)

async function loadState() {
  if (!parsed.value) return
  stateError.value = null
  loadingState.value = true
  result.value = null
  try {
    const [s, tasm] = await Promise.all([fetchAccountState(tc, parsed.value), loadTasm()])
    state.value = s
    fetchedAt.value = new Date()
    methods.value = availableMethods(tasm, s.code, s.libs)
    resetOverrides()
  }
  catch (e) {
    state.value = null
    stateError.value = e
  }
  finally {
    loadingState.value = false
  }
}

async function useExample(ex: typeof EXAMPLES[number]) {
  address.value = ex.address
  parsed.value = Address.parse(ex.address)
  await loadState()
  method.value = ex.method
  args.value = ex.args.map(a => ({ ...a }))
}

watch(network, () => { state.value = null; result.value = null })
// A different address in the field must not keep running against the previous account's state.
watch(parsed, (a) => {
  if (state.value && !(a && a.equals(state.value.address))) { state.value = null; result.value = null }
})

// ---------------------------------------------------------------- call
const method = ref('')
const args = ref<ArgRow[]>([])
const addArg = () => args.value.push({ type: 'int', value: '' })

// "what if" overrides
const balanceText = ref('')
const balanceNano = ref<bigint | null>(null)
const time = ref('')
const gasLimit = ref('')
const dataOverride = ref('')
const codeOverride = ref('')
function resetOverrides() {
  balanceText.value = ''
  time.value = ''
  gasLimit.value = ''
  dataOverride.value = ''
  codeOverride.value = ''
}
const editCurrent = (what: 'data' | 'code') => {
  const b64 = state.value![what].toBoc().toString('base64')
  if (what === 'data') dataOverride.value = b64
  else codeOverride.value = b64
}

const running = ref(false)
const runError = ref<unknown>(null)
const result = shallowRef<{ plan: RunPlan, res: GetMethodResult, ms: number } | null>(null)

async function run() {
  if (!state.value) return
  runError.value = null
  running.value = true
  try {
    const gas = gasLimit.value.trim()
    if (gas && !/^\d+$/.test(gas)) throw new Error('Gas limit must be a whole number.')
    const plan = buildRun(state.value, method.value, args.value, {
      balance: balanceNano.value,
      unixTime: time.value ? Math.floor(new Date(time.value).getTime() / 1000) : null,
      gasLimit: gas ? BigInt(gas) : null,
      data: dataOverride.value,
      code: codeOverride.value
    })
    const sb = await loadSandbox()
    const t0 = performance.now()
    const res = await sb.runGetMethod(plan.args)
    result.value = { plan, res, ms: Math.round(performance.now() - t0) }
  }
  catch (e) {
    result.value = null
    runError.value = e
  }
  finally {
    running.value = false
  }
}

const exit = computed(() => (result.value ? exitInfo(result.value.res.exitCode) : null))
const exitHint = computed(() => {
  const r = result.value
  if (!r) return undefined
  if (r.res.missingLibrary) return `The code needs library ${r.res.missingLibrary}, which was not loaded.`
  // FunC/Tolk/Tact method dispatchers throw 11 for an id that is not in the method dictionary.
  if (r.res.exitCode === 11 && methods.value.length && !r.plan.overridden.includes('code') && !methods.value.some(m => m.id === r.plan.method.id)) {
    return `This contract has no get-method with id ${r.plan.method.id}; exit code 11 is what its method dispatcher throws for an unknown id.`
  }
  return undefined
})
const stackRows = computed(() => {
  const out: (ReadableItem & { depth: number })[] = []
  const walk = (items: ReadableItem[], depth: number) => items.forEach((i) => {
    out.push({ ...i, depth })
    if (i.children) walk(i.children, depth + 1)
  })
  if (result.value) walk(readable(result.value.res.stack, network.value === 'testnet'), 0)
  return out
})
const vmLogLines = computed(() => result.value?.res.vmLog.split('\n').length ?? 0)
const methodLabel = (m: { id: number, name: string | null }) => m.name ?? `id ${m.id}`
</script>

<template>
  <div class="space-y-6">
    <!-- 1. state -->
    <form class="space-y-3" @submit.prevent="loadState">
      <AddressInput v-model="address" label="Contract address" required @parsed="a => parsed = a" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton
          v-for="ex in EXAMPLES"
          :key="ex.label"
          :label="ex.label"
          icon="i-lucide-sparkles"
          variant="link"
          size="sm"
          class="px-0"
          :disabled="network !== 'mainnet'"
          @click="useExample(ex)"
        />
      </div>
      <UButton type="submit" :label="state ? 'Reload state' : 'Fetch code and data'" icon="i-lucide-download" :loading="loadingState" :disabled="!parsed" />
      <p class="text-xs text-dimmed">
        One request to toncenter ({{ network }}) for code, data and balance, plus one per library cell. Every run after that is local.
      </p>
    </form>

    <ErrorNotice v-if="stateError" :error="stateError" @retry="loadState" />
    <LoadingState v-else-if="loadingState" label="Fetching account state…" />

    <template v-if="state && !loadingState">
      <div class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <ResultField label="Balance" :value="formatCoin(state.balance)" :mono="false">
          <TokenAmount :nano="state.balance" />
        </ResultField>
        <ResultField label="Status" :value="state.status" :mono="false" :copy="false" :hint="fetchedAt ? `Fetched ${fetchedAt.toLocaleTimeString()}` : undefined" />
        <ResultField label="Code hash" :value="state.code.hash().toString('hex')" :hint="state.libs.length ? `Uses ${state.libs.length} library cell(s), fetched and hash-checked` : undefined" />
        <ResultField label="Data hash" :value="state.data.hash().toString('hex')" />
      </div>

      <!-- 2. call -->
      <form class="space-y-4 border-t border-default pt-5" @submit.prevent="run">
        <UFormField label="Get-method" hint="name (seqno) or numeric id">
          <UInput v-model="method" class="w-full font-mono" placeholder="get_wallet_data" autocomplete="off" spellcheck="false" />
        </UFormField>
        <div v-if="methods.length" class="flex flex-wrap gap-1.5">
          <UButton
            v-for="m in methods"
            :key="m.id"
            :label="methodLabel(m)"
            size="xs"
            class="font-mono"
            :variant="method === (m.name ?? String(m.id)) ? 'solid' : 'soft'"
            color="neutral"
            @click="method = m.name ?? String(m.id)"
          />
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium">
            Arguments <span class="font-normal text-muted">(first = deepest on the stack)</span>
          </p>
          <div v-for="(a, i) in args" :key="i" class="flex flex-col gap-2 sm:flex-row">
            <USelect v-model="a.type" :items="ARG_TYPES" class="w-full sm:w-32" :aria-label="`Argument ${i + 1} type`" />
            <UInput v-if="a.type !== 'null'" v-model="a.value" class="w-full font-mono" :placeholder="a.type === 'int' ? '123 or 0x7b' : a.type === 'address' ? 'EQ… / 0:…' : 'BOC base64 or hex'" :aria-label="`Argument ${i + 1} value`" autocomplete="off" spellcheck="false" />
            <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" :aria-label="`Remove argument ${i + 1}`" class="self-end sm:self-auto" @click="args.splice(i, 1)" />
          </div>
          <UButton label="Add argument" icon="i-lucide-plus" size="sm" variant="soft" color="neutral" @click="addArg" />
        </div>

        <details class="rounded-md border border-default">
          <summary class="cursor-pointer px-3 py-2 text-sm">
            What if… (override balance, time, gas, data or code)
          </summary>
          <div class="space-y-3 border-t border-default p-3">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AmountInput v-model="balanceText" v-model:nano="balanceNano" :label="`Balance (default ${formatCoin(state.balance, { maxDecimals: 2 })})`" placeholder="on-chain" />
              <UFormField label="Time (NOW)" hint="default: now">
                <UInput v-model="time" type="datetime-local" class="w-full" />
              </UFormField>
              <UFormField label="Gas limit" hint="default 10,000,000">
                <UInput v-model="gasLimit" inputmode="numeric" class="w-full font-mono" placeholder="10000000" />
              </UFormField>
            </div>
            <UFormField label="Data cell (c4) BOC" hint="empty = on-chain data">
              <UTextarea v-model="dataOverride" :rows="2" autoresize :maxrows="8" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc…" spellcheck="false" />
            </UFormField>
            <UButton label="Start from current data" size="xs" variant="link" class="px-0" @click="editCurrent('data')" />
            <UFormField label="Code BOC" hint="empty = on-chain code">
              <UTextarea v-model="codeOverride" :rows="2" autoresize :maxrows="8" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc…" spellcheck="false" />
            </UFormField>
            <div class="flex flex-wrap gap-x-4">
              <UButton label="Start from current code" size="xs" variant="link" class="px-0" @click="editCurrent('code')" />
              <UButton label="Reset all overrides" size="xs" variant="link" color="neutral" class="px-0" @click="resetOverrides" />
            </div>
            <p class="text-xs text-dimmed">
              Edit the data with the <ULink to="/tools/cell-tree-viewer" class="text-primary">cell tools</ULink> or build code with the
              <ULink to="/tools/fift-asm-assembler" class="text-primary">TVM assembler</ULink>. Nothing is sent anywhere: runs happen in a WebAssembly TVM in your browser.
            </p>
          </div>
        </details>

        <UButton type="submit" label="Run locally" icon="i-lucide-play" :loading="running" :disabled="!method.trim()" />
      </form>

      <ErrorNotice v-if="runError" :error="runError" title="Could not run" />
      <LoadingState v-else-if="running" label="Running in the local TVM (first run downloads the ~7 MB emulator)…" />

      <!-- 3. result -->
      <div v-if="result && exit && !running" class="space-y-4">
        <UAlert
          :color="exit.ok ? 'success' : 'error'"
          variant="subtle"
          :icon="exit.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
          :title="`Exit code ${result.res.exitCode}: ${exit.text}`"
          :description="exitHint"
        />
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <UBadge :label="`${result.plan.method.name ?? 'method'} · id ${result.plan.method.id}`" variant="subtle" color="neutral" class="font-mono" />
          <UBadge :label="`${result.res.gasUsed.toLocaleString('en-US')} gas`" variant="subtle" />
          <UBadge :label="`${result.ms} ms`" variant="subtle" color="neutral" />
          <UBadge v-for="o in result.plan.overridden" :key="o" :label="`${o} overridden`" color="warning" variant="subtle" />
        </div>

        <div class="space-y-1">
          <h3 class="font-medium text-highlighted">
            Result stack ({{ result.res.stack.length }})
          </h3>
          <p v-if="!stackRows.length" class="text-sm text-muted">
            Empty stack.
          </p>
          <div v-for="r in stackRows" :key="r.index" class="flex min-w-0 items-start gap-2 border-b border-default py-1.5 text-sm" :style="{ paddingLeft: `${r.depth}rem` }">
            <span class="w-8 shrink-0 font-mono text-xs text-dimmed">{{ r.index }}</span>
            <UBadge :label="r.type" size="sm" variant="soft" color="neutral" class="shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="font-mono text-xs break-all">
                {{ r.value }}
              </p>
              <p v-if="r.extra" class="font-mono text-xs break-all text-dimmed">
                {{ r.extra }}
              </p>
            </div>
            <CopyButton v-if="r.value && r.value !== 'null'" :value="r.value" size="xs" />
          </div>
        </div>

        <details v-if="result.res.debugLogs" class="rounded-md border border-default" open>
          <summary class="cursor-pointer px-3 py-2 text-sm">
            Debug output (~dump / debug.print)
          </summary>
          <pre class="max-h-72 overflow-auto border-t border-default p-3 font-mono text-xs leading-5">{{ result.res.debugLogs }}</pre>
        </details>
        <details class="rounded-md border border-default">
          <summary class="cursor-pointer px-3 py-2 text-sm">
            VM log ({{ vmLogLines }} lines: every instruction, stack and gas)
          </summary>
          <div class="space-y-2 border-t border-default p-3">
            <div class="flex gap-1">
              <CopyButton :value="result.res.vmLog" label="Copy" />
              <UButton label="Download" icon="i-lucide-download" size="sm" variant="ghost" color="neutral" @click="downloadText(result.res.vmLog, `vmlog-${result.plan.method.id}.txt`)" />
            </div>
            <pre class="max-h-[60vh] overflow-auto font-mono text-xs leading-5">{{ result.res.vmLog }}</pre>
          </div>
        </details>
        <p class="text-xs text-dimmed">
          Emulated with @ton/sandbox's bundled mainnet config. Results match the network for the state fetched above; for live values use the
          <ULink to="/tools/get-method-runner" class="text-primary">get-method runner</ULink>.
        </p>
      </div>
    </template>
  </div>
</template>
