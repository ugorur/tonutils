<script setup lang="ts">
import type { Address } from '@ton/core'
import { fetchItems, fetchOwnedItems } from '~/lib/dns-read/api'
import { countdown, DNS_COLLECTION, dnsTonOrgUrl, utcDate } from '~/lib/dns-read/core'
import type { ExpiryRow, Urgency } from './logic'
import { buildIcs, buildRows, csvRows } from './logic'

// tolya.ton's wallet: a dozen real domains with spread-out expiry dates.
const EXAMPLE = 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4'

const route = useRoute()
const router = useRouter()
const { network } = useTonNetwork()
const toncenter = useToncenter()
const { wallet } = useTonConnect()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const address = shallowRef<Address | null>(null)

const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const rows = shallowRef<ExpiryRow[] | null>(null)
const ownerName = ref<string | null>(null)
const checkedAt = ref(0)
const leadDays = ref(30)
let runId = 0

async function check() {
  if (!address.value) return
  const id = ++runId
  const owner = address.value.toRawString()
  loading.value = true
  error.value = null
  rows.value = null
  ownerName.value = null
  router.replace({ query: { ...route.query, address: input.value.trim() } })
  try {
    const net = network.value
    progress.value = 'Finding the wallet’s .ton domains…'
    const { items, book } = await fetchOwnedItems(owner, DNS_COLLECTION[net], toncenter.v3)
    if (id !== runId) return
    ownerName.value = book[owner.toUpperCase()]?.domain ?? null
    progress.value = `Reading ${items.length} domain contracts…`
    const data = await fetchItems(items.map(i => i.address.toLowerCase()), toncenter.v3)
    if (id !== runId) return
    checkedAt.value = Math.floor(Date.now() / 1000)
    rows.value = buildRows(items, data, checkedAt.value)
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

function useAddress(v: string) {
  input.value = v
  nextTick(check)
}

onMounted(() => {
  if (input.value) nextTick(check)
})
watch(network, () => {
  if (rows.value) check()
})

const counts = computed(() => {
  const c = { expired: 0, soon: 0, warn: 0, ok: 0 }
  for (const r of rows.value ?? []) c[r.urgency]++
  return c
})
const LEADS = [{ label: '7 days before', value: 7 }, { label: '30 days before', value: 30 }, { label: '60 days before', value: 60 }]
function downloadIcs() {
  if (!rows.value) return
  downloadText(buildIcs(rows.value, { leadDays: leadDays.value, now: Math.floor(Date.now() / 1000), network: network.value }), 'ton-domain-renewals.ics', 'text/calendar;charset=utf-8')
}
const csv = computed(() => csvRows(rows.value ?? []))

const BADGE: Record<Urgency, { label: string, color: 'error' | 'warning' | 'neutral' | 'success' }> = {
  expired: { label: 'Expired', color: 'error' },
  soon: { label: 'Under 30 days', color: 'error' },
  warn: { label: 'Under 90 days', color: 'warning' },
  ok: { label: 'OK', color: 'success' }
}
const day = (t: number) => new Date(t * 1000).toLocaleDateString([], { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="check">
      <AddressInput v-model="input" label="Owner wallet address" placeholder="UQ… / EQ… / 0:…" @parsed="address = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Check domains" icon="i-lucide-calendar-clock" :loading="loading" :disabled="!address" />
        <UButton v-if="wallet" label="Use my connected wallet" variant="link" size="sm" class="px-0" icon="i-lucide-wallet" @click="useAddress(wallet.friendly)" />
        <UButton label="Try an example" variant="link" size="sm" class="px-0" @click="useAddress(EXAMPLE)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="check" />
    <LoadingState v-else-if="loading" :label="progress" />

    <template v-if="rows && !loading">
      <UAlert
        v-if="!rows.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-search-x"
        title="No .ton domains"
        :description="`This wallet owns no .ton domains on ${network}. Domains listed for sale on a marketplace are held by the sale contract until sold.`"
      />

      <section v-else class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Domains
            </div>
            <div class="font-medium text-highlighted">
              {{ rows.length }}
            </div>
            <div v-if="ownerName" class="truncate text-xs text-muted">
              Wallet shown as {{ ownerName }}
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Next expiry
            </div>
            <div class="font-medium text-highlighted">
              {{ rows[0]!.name }}.ton
            </div>
            <div class="text-xs text-muted">
              {{ rows[0]!.expiresAt <= checkedAt ? 'already expired' : `in ${countdown(rows[0]!.expiresAt, checkedAt)}` }}
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Need attention
            </div>
            <div class="font-medium" :class="counts.expired + counts.soon ? 'text-error' : 'text-highlighted'">
              {{ counts.expired + counts.soon }} within 30 days
            </div>
            <div class="text-xs text-muted">
              {{ counts.expired }} expired · {{ counts.warn }} within 90 days
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="Calendar reminder" class="min-w-44">
            <USelect v-model="leadDays" :items="LEADS" class="w-full" />
          </UFormField>
          <UButton icon="i-lucide-calendar-plus" label="Download .ics" @click="downloadIcs" />
          <CsvExportButton :rows="csv" filename="ton-domain-expiry" />
        </div>

        <ul class="divide-y divide-default rounded-lg border border-default">
          <li v-for="r in rows" :key="r.item" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
            <div class="min-w-0">
              <div class="font-mono text-sm break-all text-highlighted">
                {{ r.name }}.ton
              </div>
              <div class="text-xs text-muted">
                {{ r.expiresAt <= checkedAt ? 'Expired' : 'Expires' }} {{ day(r.expiresAt) }}
                <template v-if="r.expiresAt > checkedAt">
                  (in {{ countdown(r.expiresAt, checkedAt) }})
                </template>
                · last renewed {{ day(r.lastRenewed) }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UBadge :color="BADGE[r.urgency].color" variant="subtle" :label="BADGE[r.urgency].label" />
              <UButton :to="dnsTonOrgUrl(r.name, network)" target="_blank" label="Renew" icon="i-lucide-external-link" size="xs" color="neutral" variant="outline" />
              <UButton :to="`/tools/dns-lookup?q=${r.name}.ton`" icon="i-lucide-search" size="xs" color="neutral" variant="ghost" :aria-label="`Details for ${r.name}.ton`" />
            </div>
          </li>
        </ul>

        <p class="text-xs text-muted">
          Expiry = the last time the owner touched the domain + 1 year, read from each domain contract ({{ utcDate(checkedAt) }}).
          To renew, the owner does anything with the domain: our <ULink to="/tools/dns-renew" class="text-primary">renew tool</ULink> (all domains in one transaction), “Renew” on dns.ton.org or in the wallet, editing a record, or sending a small transfer from the owner wallet to the domain contract.
          Once it has expired, anyone can start an auction for it and the owner loses it to the winner; until someone does, the owner can still renew.
        </p>
      </section>
    </template>
  </div>
</template>
