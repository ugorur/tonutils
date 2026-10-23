<script setup lang="ts">
import type { Address } from '@ton/core'
import StackItem from './StackItem.vue'
import { COMMON_METHODS, decodeEntry, exitInfo, isMethodName, METHOD_ARGS, toStackEntry, type ArgInput, type ArgType, type Decoded, type StackEntry } from './logic'

const EXAMPLES = [
  { label: 'Wallet seqno', address: 'EQDOOjaP487stfk9E38me2LsuunR93JtiY3dGfPWOUOH9XLb', method: 'seqno', args: [] as ArgInput[] },
  { label: 'USD₮ supply', address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', method: 'get_jetton_data', args: [] },
  { label: 'USD₮ wallet of an owner', address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', method: 'get_wallet_address', args: [{ type: 'address' as ArgType, value: 'UQAj-peZGPH-cC25EAv4Q-h8cBXszTmkch6ba6wXC8BM40qt' }] }
]
const ARG_TYPES = [
  { label: 'Number', value: 'num' },
  { label: 'Address', value: 'address' },
  { label: 'Cell (BOC)', value: 'cell' },
  { label: 'Slice (BOC)', value: 'slice' }
]

const route = useRoute()
const qs = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')
const address = ref(qs('q'))
const parsed = ref<Address | null>(null)
const method = ref(qs('method'))
const args = ref<(ArgInput & { label?: string })[]>([])
const tc = useToncenter()
const api = useTonapi()
const { network, isTestnet } = useTonNetwork()

// ---------------------------------------------------------------- method list (tonapi inspect)
const methods = ref<string[]>([])
const methodsFor = ref('')
const methodsLoading = ref(false)
// keyed by network too: switching mainnet/testnet must reload the list for the same address
watch([parsed, network], async ([a, net]) => {
  const raw = a ? `${net}:${a.toRawString()}` : ''
  if (raw === methodsFor.value) return
  methodsFor.value = raw
  methods.value = []
  if (!a) return
  methodsLoading.value = true
  try {
    const r = await api.get<{ methods: { method: string }[] }>(`blockchain/accounts/${a.toRawString()}/inspect`)
    if (methodsFor.value === raw) methods.value = r.methods.map(m => m.method).sort()
  }
  catch { /* no code, or tonapi busy: fall back to common names */ }
  finally {
    if (methodsFor.value === raw) methodsLoading.value = false
  }
})
const suggestions = computed(() => (methods.value.length ? methods.value : COMMON_METHODS))

function pickMethod(name: string) {
  method.value = name
  const tpl = METHOD_ARGS[name]
  args.value = tpl ? tpl.map(t => ({ type: t.type, value: '', label: t.label })) : []
}

// ---------------------------------------------------------------- run
interface RunResult { exitCode: number, gasUsed: number, stack: Decoded[], raw: unknown, method: string }
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<RunResult | null>(null)
watch(network, () => (result.value = null)) // a result from the other network would be misleading
const methodError = computed(() => (method.value && !isMethodName(method.value) ? 'Use the method name, e.g. get_jetton_data' : undefined))

async function run() {
  if (!parsed.value || !method.value.trim() || methodError.value) return
  error.value = null
  result.value = null
  loading.value = true
  try {
    const stack = args.value.map(toStackEntry)
    const name = method.value.trim()
    const res = await tc.post<{ exit_code: number, gas_used: number, stack: StackEntry[] }>(
      'runGetMethod',
      { address: parsed.value.toRawString(), method: name, stack }
    )
    const ok = res.exit_code === 0 || res.exit_code === 1
    result.value = { exitCode: res.exit_code, gasUsed: res.gas_used, stack: ok ? res.stack.map(decodeEntry) : [], raw: res, method: name }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function useExample(ex: typeof EXAMPLES[number]) {
  address.value = ex.address
  method.value = ex.method
  args.value = ex.args.map(a => ({ ...a, label: METHOD_ARGS[ex.method]?.[0]?.label }))
  nextTick(run)
}

const info = computed(() => (result.value ? exitInfo(result.value.exitCode) : null))
const friendly = computed(() => parsed.value?.toString({ testOnly: isTestnet.value }) ?? '')

if (address.value && method.value) {
  onMounted(() => {
    if (METHOD_ARGS[method.value]) pickMethod(method.value)
    else nextTick(run)
  })
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="run">
      <AddressInput v-model="address" label="Contract address" placeholder="EQ… / UQ… / 0:…" required @parsed="parsed = $event" />

      <UFormField label="Get-method name" :error="methodError">
        <UInput v-model="method" class="w-full font-mono" placeholder="get_jetton_data" autocomplete="off" spellcheck="false" />
      </UFormField>
      <div class="-mt-2 space-y-1">
        <p class="text-xs text-muted">
          <template v-if="methodsLoading">
            Reading this contract's methods…
          </template>
          <template v-else-if="methods.length">
            Methods found in this contract's code:
          </template>
          <template v-else>
            Common methods:
          </template>
        </p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="m in suggestions"
            :key="m"
            :label="m"
            size="xs"
            :variant="m === method ? 'solid' : 'soft'"
            :color="m === method ? 'primary' : 'neutral'"
            class="font-mono"
            @click="pickMethod(m)"
          />
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-highlighted">Arguments <span class="font-normal text-muted">(in order; most methods take none)</span></span>
          <UButton label="Add" icon="i-lucide-plus" size="xs" variant="soft" @click="args.push({ type: 'num', value: '' })" />
        </div>
        <div v-for="(a, i) in args" :key="i" class="flex flex-col gap-2 sm:flex-row sm:items-start">
          <USelect v-model="a.type" :items="ARG_TYPES" class="sm:w-36" :aria-label="`Argument ${i + 1} type`" />
          <UInput
            v-model="a.value"
            class="w-full font-mono"
            :placeholder="a.label ?? (a.type === 'num' ? '123 or 0x7b' : a.type === 'address' ? 'EQ… / UQ… / 0:…' : 'te6cc… or b5ee9c72…')"
            :aria-label="a.label ?? `Argument ${i + 1}`"
          />
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Remove argument ${i + 1}`" class="self-end sm:self-auto" @click="args.splice(i, 1)" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Run method" icon="i-lucide-play" :loading="loading" :disabled="!parsed || !method.trim() || !!methodError" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="run" />
    <LoadingState v-else-if="loading" label="Running on toncenter…" />

    <template v-if="result && info">
      <UAlert
        :color="info.ok ? 'success' : 'error'"
        variant="subtle"
        :icon="info.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
        :title="`${result.method}: exit code ${result.exitCode}`"
        :description="`${info.text}. Gas used: ${result.gasUsed}.`"
      />

      <div v-if="info.ok" class="space-y-2">
        <h3 class="font-medium text-highlighted">
          Returned values ({{ result.stack.length }})
        </h3>
        <p v-if="!result.stack.length" class="text-sm text-muted">
          The method returned nothing.
        </p>
        <StackItem v-for="(item, i) in result.stack" :key="i" :item="item" :label="`#${i}`" />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <ULink :to="`/tools/contract-inspector?q=${encodeURIComponent(friendly)}`" class="text-primary">Inspect this contract</ULink>
        <ExplorerLinks :value="friendly" />
      </div>

      <details>
        <summary class="cursor-pointer text-sm text-muted">
          Raw toncenter response
        </summary>
        <JsonView :value="result.raw" class="mt-2" />
      </details>
    </template>
  </div>
</template>
