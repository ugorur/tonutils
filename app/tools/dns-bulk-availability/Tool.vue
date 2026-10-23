<script setup lang="ts">
import { fetchItems, loadItemCode } from '~/lib/dns-read/api'
import type { DnsStatus } from '~/lib/dns-read/core'
import { countdown, DNS_COLLECTION, dnsStatus, itemAddress, utcDate } from '~/lib/dns-read/core'
import type { BulkRow } from './logic'
import { csvRows, MAX_NAMES, parseNames, priceTable, STATUS_LABEL, summarize } from './logic'

// Real mainnet names: owned ones, a short name (auction in Oct 2026), free names, a typo and a duplicate.
const EXAMPLE = ['foundation.ton', 'wallet.ton', 'sick.ton', 'tonutils-free-demo', 'gram-toolbox-2026', 'abc', 'Foundation'].join('\n')

const { network, isTestnet } = useTonNetwork()
const toncenter = useToncenter()

const text = ref('')
const entries = computed(() => parseNames(text.value))
const validCount = computed(() => entries.value.filter(e => !e.error).length)
const tooMany = computed(() => entries.value.length > MAX_NAMES)

const loading = ref(false)
const progress = ref({ done: 0, total: 0 })
const error = ref<unknown>(null)
const rows = shallowRef<BulkRow[]>([])
const checkedAt = ref(0)
const filter = ref<DnsStatus['kind'] | 'invalid' | 'all'>('all')
let runId = 0

async function check() {
  const list = entries.value.slice(0, MAX_NAMES)
  if (!list.length) return
  const id = ++runId
  loading.value = true
  error.value = null
  rows.value = []
  filter.value = 'all'
  try {
    const net = network.value
    const code = await loadItemCode(net, toncenter.v3)
    const valid = list.filter(e => !e.error)
    const itemOf = new Map(valid.map(e => [e.name, itemAddress(e.name, DNS_COLLECTION[net], code).toRawString()]))
    progress.value = { done: 0, total: itemOf.size }
    const data = await fetchItems([...itemOf.values()], toncenter.v3, (done) => {
      if (id === runId) progress.value = { done, total: itemOf.size }
    })
    if (id !== runId) return
    const now = Math.floor(Date.now() / 1000)
    checkedAt.value = now
    rows.value = list.map((e) => {
      if (e.error) return { name: e.name, error: e.error }
      const item = itemOf.get(e.name)!
      return { name: e.name, item, status: dnsStatus(e.name, data.get(item) ?? null, now) }
    })
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

function useExample() {
  text.value = EXAMPLE
  check()
}

watch(network, () => {
  if (rows.value.length) check()
})

const summary = computed(() => summarize(rows.value))
const shown = computed(() => rows.value.filter(r => filter.value === 'all' || (filter.value === 'invalid' ? !r.status : r.status?.kind === filter.value)))
const csv = computed(() => csvRows(rows.value, isTestnet.value))
const prices = computed(() => priceTable())

const CHIPS = [
  { key: 'available', color: 'success' },
  { key: 'auction', color: 'warning' },
  { key: 'owned', color: 'neutral' },
  { key: 'expired', color: 'error' },
  { key: 'invalid', color: 'neutral' }
] as const
const chipLabel = (k: typeof CHIPS[number]['key']) => (k === 'invalid' ? 'Invalid' : STATUS_LABEL[k])
const badgeColor = (r: BulkRow) => CHIPS.find(c => c.key === (r.status?.kind ?? 'invalid'))!.color
const day = (t: number) => new Date(t * 1000).toLocaleDateString([], { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="check">
      <UFormField label="Names to check" :help="`One per line (commas also work), with or without “.ton”. Up to ${MAX_NAMES} names.`" :error="tooMany ? `Only the first ${MAX_NAMES} names will be checked.` : undefined">
        <UTextarea v-model="text" :rows="7" autoresize :maxrows="16" placeholder="alice&#10;bob.ton&#10;my-shop" class="w-full font-mono" spellcheck="false" autocapitalize="off" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Check availability" icon="i-lucide-list-checks" :loading="loading" :disabled="!entries.length" />
        <UButton label="Try an example" variant="link" size="sm" class="px-0" @click="useExample" />
        <span v-if="entries.length" class="text-xs text-muted">{{ validCount }} valid of {{ entries.length }}</span>
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="check" />
    <LoadingState v-else-if="loading" :label="progress.total ? `Reading ${progress.total} domain contracts from toncenter (${progress.done}/${progress.total})…` : 'Reading the .ton collection…'" />

    <section v-if="rows.length && !loading" class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <UButton :variant="filter === 'all' ? 'solid' : 'outline'" color="neutral" size="xs" :label="`All ${rows.length}`" @click="filter = 'all'" />
        <template v-for="c in CHIPS" :key="c.key">
          <UButton
            v-if="summary[c.key]"
            :variant="filter === c.key ? 'solid' : 'outline'"
            :color="c.color"
            size="xs"
            :label="`${chipLabel(c.key)} ${summary[c.key]}`"
            @click="filter = c.key"
          />
        </template>
        <CsvExportButton class="ml-auto" :rows="csv" filename="ton-domain-availability" size="xs" />
      </div>

      <ul class="divide-y divide-default rounded-lg border border-default">
        <li v-for="(r, i) in shown" :key="`${i}-${r.name}`" class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5">
          <div class="min-w-0 space-y-0.5">
            <div class="font-mono text-sm break-all text-highlighted">
              {{ r.name }}.ton
            </div>
            <div class="text-xs text-muted">
              <template v-if="!r.status">
                {{ r.error }}
              </template>
              <template v-else-if="r.status.kind === 'available'">
                Opening bid from <TokenAmount :nano="r.status.minPrice" />
              </template>
              <template v-else-if="r.status.kind === 'auction'">
                Bid <TokenAmount :nano="r.status.bid" /> · ends in {{ countdown(r.status.endTime, checkedAt) }} ({{ utcDate(r.status.endTime) }})
              </template>
              <template v-else-if="r.status.kind === 'owned'">
                Expires {{ day(r.status.expiresAt) }}
              </template>
              <template v-else>
                Expired {{ day(r.status.expiresAt) }} · release from <TokenAmount :nano="r.status.minPrice" />
              </template>
            </div>
            <div v-if="r.status && (r.status.kind === 'owned' || r.status.kind === 'expired')" class="text-xs">
              <AddressLink :address="r.status.owner" :bounceable="false" no-links />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge :color="badgeColor(r)" variant="subtle" :label="r.status ? STATUS_LABEL[r.status.kind] : r.error === 'Duplicate' ? 'Duplicate' : 'Invalid'" />
            <UButton
              v-if="r.status"
              :to="`/tools/dns-lookup?q=${r.name}.ton`"
              icon="i-lucide-search"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="`Details for ${r.name}.ton`"
            />
            <UButton
              v-if="r.status && r.status.kind !== 'owned'"
              :to="`/tools/dns-bid?q=${r.name}.ton`"
              icon="i-lucide-gavel"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="`Bid on ${r.name}.ton`"
            />
          </div>
        </li>
      </ul>
      <p class="text-xs text-muted">
        Read directly from each domain contract. “Expired” names were not renewed for a year: anyone can start a new auction for them, and the owner can still renew until someone does.
      </p>
    </section>

    <details class="rounded-lg border border-default p-3 text-sm">
      <summary class="cursor-pointer font-medium text-highlighted">
        Minimum opening bid by name length
      </summary>
      <div class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <div v-for="p in prices" :key="p.length" class="rounded-md bg-elevated/50 p-2 text-center">
          <div class="text-xs text-muted">
            {{ p.length }} chars
          </div>
          <div class="font-medium text-highlighted">
            {{ formatCoin(p.price) }}
          </div>
        </div>
      </div>
      <p class="mt-2 text-xs text-muted">
        Set by the .ton collection contract. Each bid must be 5% above the last. A new name's auction ends one hour after its latest bid; an expired name that someone releases goes to a one-week auction, and a bid in its final hour moves the end to one hour after that bid.
      </p>
    </details>
  </div>
</template>
