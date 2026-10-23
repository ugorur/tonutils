<script setup lang="ts">
import type { SizeUnit, StorageProvider } from './logic'
import { formatBytes, isUsable, MiB, quotes, storageCost, toBytes, UNITS } from './logic'

const { network } = useTonNetwork()
const api = useTonapi(network)

const providers = shallowRef<StorageProvider[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
// Bumped on every load; a slower response for the other network is dropped.
let gen = 0
async function load() {
  const g = ++gen
  loading.value = true
  error.value = null
  try {
    const r = await api.get<{ providers: StorageProvider[] }>('storage/providers')
    if (g === gen) providers.value = r.providers
  }
  catch (e) {
    if (g === gen) error.value = e
  }
  finally {
    if (g === gen) loading.value = false
  }
}
watch(network, () => {
  providers.value = []
  load()
}, { immediate: true })

const usable = computed(() => providers.value.filter(isUsable))
const cheapest = computed(() => usable.value.reduce<StorageProvider | null>((m, p) => (!m || p.rate_per_mb_day < m.rate_per_mb_day ? p : m), null))

// ---------------------------------------------------------------- calculator
const size = ref('100')
const unit = ref<SizeUnit>('MB')
const days = ref('30')
const UNIT_ITEMS = (Object.keys(UNITS) as SizeUnit[]).map(u => ({ label: u.replace('B', 'iB'), value: u }))
const bytes = computed(() => toBytes(size.value, unit.value))
const dayCount = computed(() => {
  const n = Number(days.value)
  return days.value.trim() && Number.isFinite(n) && n > 0 && n <= 36500 ? n : null
})
const list = computed(() => (bytes.value && dayCount.value ? quotes(providers.value, bytes.value, dayCount.value) : []))
const limit = ref(20)
watch([bytes, dayCount], () => (limit.value = 20))

const coin = (nano: bigint) => formatCoin(nano, { maxDecimals: nano < 1000n ? 9 : 6 })
/** Price for 1 GiB for 30 days, a number people can compare. */
const perGbMonth = (p: StorageProvider) => coin(storageCost(1024n * BigInt(MiB), BigInt(p.rate_per_mb_day), 30n * 86400n))
const span = (s: number) => (s >= 3600 ? `${(s / 3600).toLocaleString('en-US', { maximumFractionDigits: 1 })} h` : `${Math.round(s / 60)} min`)

const wide = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }
const columns = [
  { accessorKey: 'address', header: 'Provider' },
  { accessorKey: 'cost', header: 'Your cost' },
  { accessorKey: 'rate', header: 'Per GiB / 30 days', meta: wide },
  { accessorKey: 'limits', header: 'File size', meta: wide },
  { accessorKey: 'span', header: 'Proof every', meta: wide }
]
const rows = computed(() => list.value.slice(0, limit.value).map(q => ({ ...q, address: q.provider.address })))
const csv = computed(() => list.value.map(q => ({
  provider: q.provider.address,
  cost_nano: q.cost.toString(),
  rate_nano_per_mib_day: q.provider.rate_per_mb_day,
  min_file_bytes: q.provider.minimal_file_size,
  max_file_bytes: q.provider.maximal_file_size,
  max_proof_interval_s: q.provider.max_span
})))
function example(s: string, u: SizeUnit, d: string) {
  size.value = s
  unit.value = u
  days.value = d
}
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading && !providers.length" label="Loading storage providers from tonapi…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not load storage providers" @retry="load" />

    <template v-if="providers.length">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Providers taking files
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg" data-testid="usable-count">
            {{ usable.length }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            of {{ providers.length }} listed by tonapi
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Cheapest price
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            {{ cheapest ? perGbMonth(cheapest) : '—' }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            per GiB for 30 days
          </div>
        </div>
        <div class="col-span-2 rounded-lg border border-default p-4 sm:col-span-1">
          <div class="text-xs text-muted">
            How payment works
          </div>
          <p class="mt-1 text-xs text-muted">
            You deposit {{ COIN_SYMBOL }} into a storage contract; the provider earns from it each time it proves it still has your file.
          </p>
        </div>
      </div>

      <section aria-labelledby="calc-h" class="space-y-3">
        <h3 id="calc-h" class="font-display text-base font-semibold text-highlighted">
          What would my file cost?
        </h3>
        <div class="grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
          <UFormField label="File or bag size" :error="size.trim() && !bytes ? 'Enter a size above 0' : undefined">
            <UInput v-model="size" inputmode="decimal" placeholder="100" class="w-full" />
          </UFormField>
          <UFormField label="Unit">
            <USelect v-model="unit" :items="UNIT_ITEMS" class="w-full" />
          </UFormField>
          <UFormField label="Days" :error="days.trim() && !dayCount ? '1 to 36500' : undefined">
            <UInput v-model="days" inputmode="numeric" placeholder="30" class="w-full" />
          </UFormField>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="text-muted">Try:</span>
          <UButton label="Photo, 5 MiB, 1 year" size="xs" variant="soft" @click="example('5', 'MB', '365')" />
          <UButton label="Website, 50 MiB, 30 days" size="xs" variant="soft" @click="example('50', 'MB', '30')" />
          <UButton label="Video, 2 GiB, 90 days" size="xs" variant="soft" @click="example('2', 'GB', '90')" />
        </div>

        <template v-if="bytes && dayCount">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted" data-testid="quote-summary">
              <template v-if="list.length">
                {{ list.length }} {{ list.length === 1 ? 'provider accepts' : 'providers accept' }} {{ formatBytes(bytes) }}.
                Cheapest: <span class="font-medium text-highlighted">{{ coin(list[0]!.cost) }}</span> for {{ dayCount }} {{ dayCount === 1 ? 'day' : 'days' }}.
              </template>
              <template v-else>
                No provider accepts a file of {{ formatBytes(bytes) }} right now.
              </template>
            </p>
            <CsvExportButton :rows="csv" filename="ton-storage-quotes" />
          </div>
          <UTable v-if="list.length" :data="rows" :columns="columns" class="max-h-[36rem]" sticky :ui="{ td: 'py-2 align-top whitespace-normal', th: 'py-2' }">
            <template #address-cell="{ row }">
              <AddressLink :address="row.original.provider.address" />
            </template>
            <template #cost-cell="{ row }">
              <span class="font-mono text-sm tabular-nums">{{ coin(row.original.cost) }}</span>
            </template>
            <template #rate-cell="{ row }">
              <span class="font-mono text-xs tabular-nums">{{ perGbMonth(row.original.provider) }}</span>
            </template>
            <template #limits-cell="{ row }">
              <span class="text-xs text-muted">{{ formatBytes(row.original.provider.minimal_file_size) }} – {{ formatBytes(row.original.provider.maximal_file_size) }}</span>
            </template>
            <template #span-cell="{ row }">
              <span class="text-xs text-muted">{{ span(row.original.provider.max_span) }}</span>
            </template>
          </UTable>
          <UButton v-if="list.length > limit" :label="`Show more (${list.length - limit} left)`" variant="outline" color="neutral" size="sm" @click="limit += 50" />
        </template>
      </section>

      <UAlert color="neutral" variant="subtle" icon="i-lucide-info" title="This is an estimate">
        <template #description>
          <p>
            Cost = size × rate × time, exactly as the storage contract charges (rate is in {{ NANO_NAME }} per MiB per day). Network fees for creating the contract are extra,
            and the provider must still accept your request. To store a file you create a bag with TON Storage (storage-daemon) and send the provider a contract request; see the
            <a href="https://docs.ton.org/foundations/web3/ton-storage" target="_blank" rel="noopener" class="text-primary underline-offset-2 hover:underline">TON Storage docs</a>.
          </p>
          <p class="mt-1">
            Hidden: {{ providers.length - usable.length }} listed contracts that do not take new files, accept less than 1 MiB or charge nothing (many are not storage providers at all).
            "Proof every" is the longest gap between storage proofs the provider is paid for.
          </p>
        </template>
      </UAlert>
    </template>
  </div>
</template>
