<script setup lang="ts">
import type { DroppedFile } from '~/components/FileDrop.vue'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import DeployPanel from '~/lib/deployers/DeployPanel.vue'
import { ORDER_CODE_B64 } from '~/lib/deployers/codes'
import { parseCell } from '~/lib/boc-advanced/cells'
import { codeFromFile, fileToBoc } from '~/tools/contract-deployer/logic'
import { fetchStoragePrices, type StoragePrices } from '~/tools/unfreeze-account/logic'
import { isPublished, planLibrary, publishCost, publishMessage, type LibraryEntry } from './logic'

const { isTestnet, network } = useTonNetwork()
const toncenter = useToncenter()

const boc = ref('')
function onFile(f: DroppedFile) {
  boc.value = fileToBoc(f.bytes, f.text)
}

const planned = computed(() => {
  if (!boc.value.trim()) return null
  try {
    return { ok: true as const, plan: planLibrary(parseCell(codeFromFile(boc.value), 'Library cell')) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const plan = computed(() => (planned.value?.ok ? planned.value.plan : null))
const librarian = computed(() => plan.value?.address.toString({ bounceable: true, testOnly: isTestnet.value }) ?? '')
const refBoc = computed(() => plan.value?.ref.toBoc().toString('base64') ?? '')

// ---------------------------------------------------------------- live storage prices (config 18)
const prices = shallowRef<StoragePrices | null>(null)
const pricesError = ref<unknown>(null)
async function loadPrices() {
  pricesError.value = null
  prices.value = null
  try {
    prices.value = await fetchStoragePrices(toncenter.v2)
  }
  catch (e) {
    pricesError.value = e
  }
}
const cost = computed(() => (plan.value && prices.value ? publishCost(prices.value, plan.value) : null))

// ---------------------------------------------------------------- already public?
const published = ref<boolean | null>(null)
const publishedError = ref<unknown>(null)
let req = 0
async function checkPublished() {
  const id = ++req
  published.value = null
  publishedError.value = null
  const h = plan.value?.hash
  if (!h) return
  try {
    const r = await toncenter.v2<{ result: LibraryEntry[] }>('getLibraries', { libraries: h })
    if (id === req) published.value = isPublished(r.result, h)
  }
  catch (e) {
    if (id === req) publishedError.value = e
  }
}

onMounted(loadPrices)
watch(network, loadPrices)
watch([() => plan.value?.hash, network], checkPublished)

const details = computed<KeyValueItem[]>(() => {
  const p = plan.value
  if (!p) return []
  return [
    { label: 'Library hash', value: p.hash, mono: true, copy: true, hint: 'Contracts load the library by this hash.' },
    { label: 'Size', value: `${p.cells} cells, ${p.bits.toLocaleString('en-US')} bits`, mono: false, copy: false },
    { label: 'Library reference cell', value: refBoc.value, mono: true, copy: true, hint: 'Use this BOC as the contract code (or any cell) instead of the full cell. It is 33 bytes; the chain swaps in the library.' }
  ]
})

const messages = computed<TonConnectMessage[]>(() => (plan.value && cost.value ? [publishMessage(plan.value, cost.value.amount, isTestnet.value)] : []))

// multisig v2 Order code: a real public library on mainnet and testnet (the check below finds it).
function tryExample() {
  boc.value = ORDER_CODE_B64
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="What a public library is"
      description="A cell stored once in the masterchain that any contract can use by its hash. Contracts that share code (jetton wallets, NFT items, W5 wallets) then store a 33-byte reference instead of the full code, which makes every deploy and every storage bill smaller. Masterchain storage costs thousands of times more than basechain, so publish only code many contracts will use."
    />

    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Cell to publish
        </h3>
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
      <UFormField help="Usually compiled contract code: base64 or hex BOC, or a Blueprint / func-js / tolk-js build JSON. At most 1000 cells.">
        <UTextarea v-model="boc" class="w-full font-mono" :rows="3" autoresize :maxrows="8" placeholder="te6cc… or b5ee9c72…" aria-label="Library cell BOC" />
      </UFormField>
      <FileDrop accept=".boc,.json,.txt,.cell" text label="Or drop the compiled code file" @file="onFile" />
    </div>

    <UAlert v-if="planned && !planned.ok" color="error" variant="subtle" icon="i-lucide-circle-x" title="Cannot use this cell" :description="planned.error" />

    <template v-if="plan">
      <div class="rounded-lg border border-default px-4 py-1">
        <KeyValue :items="details" />
      </div>

      <LoadingState v-if="published === null && !publishedError" label="Checking whether it is already public…" />
      <UAlert
        v-else-if="published"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="`Already public on ${network}`"
        description="Contracts can use this library right now. Publishing it again only adds a second copy (useful if you do not trust the current holder to keep paying its storage)."
      />
      <UAlert v-else-if="published === false" color="neutral" variant="subtle" icon="i-lucide-circle-dashed" :title="`Not published on ${network} yet`" />
      <ErrorNotice v-else :error="publishedError" title="Could not check the library" @retry="checkPublished" />

      <div class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Cost
        </h3>
        <LoadingState v-if="!prices && !pricesError" label="Reading masterchain storage prices…" />
        <ErrorNotice v-else-if="pricesError" :error="pricesError" title="Could not read the storage prices" @retry="loadPrices" />
        <div v-else-if="cost" class="rounded-lg border border-default px-4 py-1">
          <ResultField label="Locked for 10 years of storage" :value="formatCoin(cost.storage)" :copy="false" :hint="`${formatCoin(cost.perYear, { maxDecimals: 4 })} per year at today's masterchain prices (config param 18). It stays on the librarian account and pays the library's rent.`" />
          <ResultField label="You send" :value="formatCoin(cost.amount)" :copy="false" :hint="`Includes ${formatCoin(cost.amount - cost.storage)} for masterchain gas; the librarian returns what it does not use.`" />
        </div>
      </div>

      <WalletGate purpose="publish the library">
        <template #default>
          <div v-if="messages.length" class="space-y-4">
            <ResultField label="Librarian address (masterchain)" :value="librarian" hint="Computed from the library: the same cell always gets the same librarian." />
            <DeployPanel
              :messages="messages"
              :target="plan.address.toRawString()"
              existing="warn"
              label="Publish library"
              existing-text="A librarian for this exact cell already exists. If it published the library, sending again only tops up its storage balance; if an earlier attempt was underfunded, sending this amount publishes it now."
              confirm="I understand the storage amount is locked on the librarian for good (it pays the library's rent) and that the library cannot be changed or removed."
            >
              <template #note>
                <p class="text-xs text-muted">
                  The message goes to a masterchain (-1:) address. If the amount is too small for the reserve, the librarian bounces it back and nothing is published.
                </p>
              </template>
              <template #done>
                <p class="text-sm text-muted">
                  Check it with the library cell resolver, or use the reference cell above as code in a StateInit.
                </p>
                <UButton label="Open library cell resolver" icon="i-lucide-library" :to="`/tools/library-cell-resolver?q=${plan.hash}`" />
              </template>
            </DeployPanel>
          </div>
        </template>
      </WalletGate>
    </template>
  </div>
</template>
