<script setup lang="ts">
import type { TcDnsRecord } from '~/lib/dns-read/api'
import { fetchItems, loadItemCode } from '~/lib/dns-read/api'
import type { DnsStatus } from '~/lib/dns-read/core'
import { countdown, DNS_COLLECTION, dnsStatus, dnsTonOrgUrl, domainIndex, itemAddress, utcDate } from '~/lib/dns-read/core'
import type { BidRow, TaBid } from './logic'
import { bidRows, parseDomain, recordRows } from './logic'

const EXAMPLES = [
  { label: 'foundation.ton', value: 'foundation.ton' },
  { label: 'sick.ton', value: 'sick.ton' },
  { label: 'A free name', value: 'tonutils-free-demo.ton' }
]

const route = useRoute()
const router = useRouter()
const { network } = useTonNetwork()
const toncenter = useToncenter()
const tonapi = useTonapi()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = computed(() => parseDomain(input.value))

interface Result {
  name: string
  item: string
  index: bigint
  status: DnsStatus
}
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<Result | null>(null)
// undefined = loading, null = unavailable
const records = shallowRef<TcDnsRecord | null | undefined>()
const recordsError = ref<unknown>(null)
const bids = shallowRef<BidRow[] | null | undefined>()
const allBids = ref(false)

const now = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 30_000)
})
onUnmounted(() => clearInterval(timer))

let run = 0
async function lookup() {
  const { name, error: bad } = parsed.value
  if (!name || bad) return
  const id = ++run
  loading.value = true
  error.value = recordsError.value = null
  result.value = null
  records.value = bids.value = undefined
  allBids.value = false
  router.replace({ query: { ...route.query, q: `${name}.ton` } })
  try {
    const net = network.value
    const code = await loadItemCode(net, toncenter.v3)
    const item = itemAddress(name, DNS_COLLECTION[net], code).toRawString()
    const data = (await fetchItems([item], toncenter.v3)).get(item) ?? null
    if (id !== run) return
    now.value = Math.floor(Date.now() / 1000)
    const status = dnsStatus(name, data, now.value)
    result.value = { name, item, index: domainIndex(name), status }
    if (status.kind === 'available') return
    loadRecords(name, id)
    loadBids(name, id)
  }
  catch (e) {
    if (id === run) error.value = e
  }
  finally {
    if (id === run) loading.value = false
  }
}

async function loadRecords(name: string, id: number) {
  records.value = undefined
  recordsError.value = null
  try {
    const r = await toncenter.v3<{ records: TcDnsRecord[] }>('dns/records', { domain: `${name}.ton` })
    if (id === run) records.value = r.records[0] ?? null
  }
  catch (e) {
    if (id === run) {
      records.value = null
      recordsError.value = e
    }
  }
}

async function loadBids(name: string, id: number) {
  try {
    const r = await tonapi.get<{ data: TaBid[] }>(`dns/${name}.ton/bids`)
    if (id === run) bids.value = bidRows(r.data)
  }
  catch {
    if (id === run) bids.value = null
  }
}

function useExample(v: string) {
  input.value = v
  lookup()
}

onMounted(() => {
  if (parsed.value.name && !parsed.value.error) lookup()
})
watch(network, () => {
  if (result.value) lookup()
})

const rows = computed(() => recordRows(records.value))
const st = computed(() => result.value?.status)
const dnsUrl = computed(() => (result.value ? dnsTonOrgUrl(result.value.name, network.value) : ''))
const BADGE = {
  available: { label: 'Available', color: 'success', icon: 'i-lucide-circle-check' },
  auction: { label: 'In auction', color: 'warning', icon: 'i-lucide-gavel' },
  owned: { label: 'Taken', color: 'neutral', icon: 'i-lucide-lock' },
  expired: { label: 'Expired', color: 'error', icon: 'i-lucide-timer-off' }
} as const
const when = (t: number) => new Date(t * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label=".ton domain" :error="parsed.error || undefined" help="With or without “.ton”. Only second-level names (alice.ton) are sold; 4 to 126 characters, a–z, 0–9 and “-”.">
        <UInput v-model="input" placeholder="e.g. foundation.ton" class="w-full font-mono" autocomplete="off" spellcheck="false" autocapitalize="off" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Look up" icon="i-lucide-search" :loading="loading" :disabled="!parsed.name || !!parsed.error" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="lookup" />
    <LoadingState v-else-if="loading" label="Reading the domain contract from the chain…" />

    <template v-if="result && st && !loading">
      <section class="space-y-4 rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-display text-lg font-semibold break-all text-highlighted">
            {{ result.name }}.ton
          </h3>
          <UBadge :color="BADGE[st.kind].color" :icon="BADGE[st.kind].icon" :label="BADGE[st.kind].label" variant="subtle" size="lg" />
        </div>

        <template v-if="st.kind === 'available'">
          <p class="text-sm text-default">
            Nobody has registered this name yet. Anyone can open an auction for it with a first bid of at least
            <TokenAmount :nano="st.minPrice" class="font-semibold" />. The price depends only on the length ({{ result.name.length }} characters).
            <template v-if="network === 'mainnet'">
              A new name's auction ends one hour after the latest bid, so an unopposed first bid wins within the hour.
            </template>
          </p>
        </template>

        <template v-else-if="st.kind === 'auction'">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg bg-elevated/50 p-3">
              <div class="text-xs text-muted">
                Current bid
              </div>
              <div class="font-medium text-highlighted">
                <TokenAmount :nano="st.bid" />
              </div>
              <div class="text-xs text-muted">
                Next bid: at least <TokenAmount :nano="st.nextBid" /> (+5%)
              </div>
            </div>
            <div class="rounded-lg bg-elevated/50 p-3">
              <div class="text-xs text-muted">
                Ends in
              </div>
              <div class="font-medium text-highlighted">
                {{ countdown(st.endTime, now) }}
              </div>
              <div class="text-xs text-muted">
                {{ utcDate(st.endTime) }}
              </div>
            </div>
            <div class="min-w-0 rounded-lg bg-elevated/50 p-3">
              <div class="text-xs text-muted">
                Leading bidder
              </div>
              <AddressLink :address="st.bidder" :bounceable="false" no-links />
            </div>
          </div>
          <p class="text-xs text-muted">
            A bid in the last hour pushes the end back to one hour after that bid. The winner gets the name for a year.
          </p>
        </template>

        <template v-else>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="min-w-0 rounded-lg bg-elevated/50 p-3">
              <div class="text-xs text-muted">
                Owner
              </div>
              <AddressLink :address="st.owner" :bounceable="false" />
            </div>
            <div class="rounded-lg bg-elevated/50 p-3">
              <div class="text-xs text-muted">
                {{ st.kind === 'expired' ? 'Expired on' : 'Expires on' }}
              </div>
              <div class="font-medium" :class="st.kind === 'expired' ? 'text-error' : 'text-highlighted'">
                {{ when(st.expiresAt) }}
              </div>
              <div class="text-xs text-muted">
                {{ st.kind === 'expired' ? `${countdown(now, st.expiresAt)} ago` : `in ${countdown(st.expiresAt, now)}` }} · {{ utcDate(st.expiresAt) }}
              </div>
            </div>
          </div>
          <p v-if="st.kind === 'owned' && st.won" class="text-xs text-muted">
            The auction is over; the winner has not touched the name since, but it is already theirs.
          </p>
          <UAlert
            v-if="st.kind === 'expired'"
            color="error"
            variant="subtle"
            icon="i-lucide-timer-off"
            title="Not renewed for over a year"
          >
            <template #description>
              Anyone can now start a one-week auction for this name with at least <TokenAmount :nano="st.minPrice" />. Until someone does, the owner can still renew it.
            </template>
          </UAlert>
          <p v-else class="text-xs text-muted">
            The owner keeps the name by doing anything with it once a year (Renew on dns.ton.org, editing a record, or a plain transfer from the owner to the domain contract).
          </p>
        </template>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="st.kind !== 'owned'"
            :to="`/tools/dns-bid?q=${result.name}.ton`"
            :label="st.kind === 'available' ? 'Start auction here' : st.kind === 'auction' ? 'Bid here' : 'Release & bid here'"
            icon="i-lucide-gavel"
          />
          <UButton
            v-else
            to="/tools/dns-renew"
            label="Renew (owner)"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
          />
          <UButton
            :to="dnsUrl"
            target="_blank"
            label="Open on dns.ton.org"
            icon="i-lucide-external-link"
            color="neutral"
            variant="outline"
          />
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Domain contract
        </h3>
        <div class="divide-y divide-default">
          <ResultField label="Item address" :value="result.item" :copy="false" :hint="st.kind === 'available' ? 'Where the domain will live once someone bids (computed offline, not deployed yet).' : 'The NFT that holds the domain.'">
            <AddressLink :address="result.item" />
          </ResultField>
          <ResultField label="NFT index" :value="`0x${result.index.toString(16).padStart(64, '0')}`" hint="Hash of the name; the collection derives the item address from it." />
        </div>
      </section>

      <section v-if="st.kind !== 'available'" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          DNS records
        </h3>
        <LoadingState v-if="records === undefined" label="Reading records…" />
        <ErrorNotice v-else-if="recordsError" :error="recordsError" title="Could not read the records" @retry="loadRecords(result.name, run)" />
        <p v-else-if="!rows.length" class="text-sm text-muted">
          This domain has no records set. Payments to it fail until the owner points it at a wallet.
        </p>
        <div v-else class="divide-y divide-default">
          <ResultField v-for="r in rows" :key="r.key" :label="r.label" :value="r.value" :hint="r.hint" :copy="r.key === 'storage'">
            <AddressLink v-if="r.key === 'wallet' || r.key === 'resolver'" :address="r.value" :bounceable="r.key === 'resolver'" full />
            <div v-else-if="r.adnl" class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm break-all text-highlighted">{{ r.adnl }}</span><CopyButton :value="r.adnl" size="xs" />
              </div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs break-all text-muted">{{ r.value }}</span><CopyButton :value="r.value" size="xs" />
              </div>
            </div>
          </ResultField>
        </div>
      </section>

      <section v-if="st.kind !== 'available'" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Bid history
        </h3>
        <LoadingState v-if="bids === undefined" label="Loading bids from tonapi…" />
        <p v-else-if="bids === null" class="text-sm text-muted">
          Bid history is not available right now (tonapi is busy). Everything above comes straight from the chain.
        </p>
        <p v-else-if="!bids.length" class="text-sm text-muted">
          No bids recorded.
        </p>
        <ul v-else class="divide-y divide-default rounded-lg border border-default">
          <li v-for="b in bids.slice(0, allBids ? 500 : 10)" :key="b.txHash" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
            <div class="min-w-0">
              <div class="font-medium" :class="b.ok ? 'text-highlighted' : 'text-muted line-through'">
                <TokenAmount :nano="b.amount" />
              </div>
              <div class="text-xs text-muted">
                {{ when(b.time) }}<template v-if="!b.ok">
                  · rejected
                </template>
              </div>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span v-if="b.bidderName" class="text-xs font-medium text-default">{{ b.bidderName }}</span>
              <AddressLink :address="b.bidder" :bounceable="false" no-links />
              <!-- ExplorerLinks' root is inline-flex, so `hidden` on it would lose; hide a wrapper instead. -->
              <span class="hidden sm:inline-flex"><ExplorerLinks kind="tx" :value="b.txHash" /></span>
            </div>
          </li>
        </ul>
        <UButton v-if="bids && bids.length > 10 && !allBids" :label="`Show all ${bids.length} bids`" size="xs" color="neutral" variant="outline" @click="allBids = true" />
      </section>
    </template>
  </div>
</template>
