<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TcAddressBook, TcDnsRecord, TcNftItem } from '~/lib/dns-read/api'
import { fetchOwnedItems } from '~/lib/dns-read/api'
import { DNS_COLLECTION, TG_USERNAMES } from '~/lib/dns-read/core'
import type { ReverseResult } from './logic'
import { buildReverse, fragmentUrl } from './logic'

const EXAMPLES = [
  { label: 'tolya.ton’s wallet', value: 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4' },
  { label: 'Old TON Foundation wallet', value: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI' },
  { label: 'Username owner', value: 'UQCc-VPNP5gkPvprrKMPo9baDiiMtFBo5Gb01BOye8MpriXQ' }
]
// One page per collection keeps a busy store wallet to a few requests.
const MAX_OWNED = 1000

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const toncenter = useToncenter()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const address = shallowRef<Address | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<ReverseResult | null>(null)
const self = ref('')
let runId = 0

async function lookup() {
  if (!address.value) return
  const id = ++runId
  const raw = address.value.toRawString()
  loading.value = true
  error.value = null
  result.value = null
  router.replace({ query: { ...route.query, address: input.value.trim() } })
  try {
    const net = network.value
    const recs = await toncenter.v3<{ records: TcDnsRecord[], address_book: TcAddressBook }>('dns/records', { wallet: raw, limit: 1000 })
    const ton = await fetchOwnedItems(raw, DNS_COLLECTION[net], toncenter.v3, MAX_OWNED)
    const users: { items: TcNftItem[], book: TcAddressBook } = net === 'mainnet' ? await fetchOwnedItems(raw, TG_USERNAMES, toncenter.v3, MAX_OWNED) : { items: [], book: {} }
    if (id !== runId) return
    self.value = raw
    result.value = buildReverse(raw, recs.records, ton.items, users.items, { ...users.book, ...ton.book, ...recs.address_book })
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

function useExample(v: string) {
  input.value = v
  nextTick(lookup)
}
onMounted(() => {
  if (input.value) nextTick(lookup)
})
watch(network, () => {
  if (result.value) lookup()
})

const empty = computed(() => !!result.value && !result.value.primary && !result.value.pointing.length && !result.value.ownedTon.length && !result.value.ownedUsernames.length)
const lookupLink = (d: string) => (d.endsWith('.ton') ? `/tools/dns-lookup?q=${d}` : null)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <AddressInput v-model="input" label="TON address" placeholder="UQ… / EQ… / 0:…" @parsed="address = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Find names" icon="i-lucide-arrow-left-right" :loading="loading" :disabled="!address" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="lookup" />
    <LoadingState v-else-if="loading" label="Searching DNS records and domain NFTs on toncenter…" />

    <template v-if="result && !loading">
      <UAlert
        v-if="empty"
        color="neutral"
        variant="subtle"
        icon="i-lucide-search-x"
        title="No names found"
        :description="`No .ton domain${isTestnet ? '' : ' or Telegram username'} points to or belongs to this address on ${network}.`"
      />

      <template v-else>
        <section class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Primary name
          </div>
          <div class="font-display text-lg font-semibold break-all text-highlighted">
            {{ result.primary ?? 'None' }}
          </div>
          <p class="mt-1 text-xs text-muted">
            The name explorers and wallets show for <AddressLink :address="self" :bounceable="false" no-links />.
            <template v-if="!result.primary">
              It needs a domain that this address owns and points to itself.
            </template>
          </p>
        </section>

        <section class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Names that point here ({{ result.pointing.length }})
          </h3>
          <p v-if="!result.pointing.length" class="text-sm text-muted">
            No domain has its wallet record set to this address.
          </p>
          <ul v-else class="divide-y divide-default rounded-lg border border-default">
            <li v-for="p in result.pointing" :key="p.item" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5">
              <div class="min-w-0">
                <div class="font-mono text-sm break-all text-highlighted">
                  {{ p.domain }}
                </div>
                <div class="flex flex-wrap items-center gap-1 text-xs text-muted">
                  <template v-if="p.ownedBySelf">
                    Owned by this address
                  </template>
                  <template v-else-if="p.owner">
                    Controlled by <AddressLink :address="p.owner" :bounceable="false" no-links />
                  </template>
                  <template v-else>
                    No owner (auction running)
                  </template>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="!p.ownedBySelf" color="warning" variant="subtle" label="Someone else can change it" />
                <UButton v-if="lookupLink(p.domain)" :to="lookupLink(p.domain)!" icon="i-lucide-search" size="xs" color="neutral" variant="ghost" :aria-label="`Details for ${p.domain}`" />
                <UButton v-else :to="fragmentUrl(p.domain)" target="_blank" icon="i-lucide-external-link" size="xs" color="neutral" variant="ghost" :aria-label="`${p.domain} on Fragment`" />
              </div>
            </li>
          </ul>
        </section>

        <section class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Owned .ton domains ({{ result.ownedTon.length }}<template v-if="result.ownedTon.length >= MAX_OWNED">+</template>)
          </h3>
          <p v-if="!result.ownedTon.length" class="text-sm text-muted">
            None. Domains listed for sale on a marketplace are held by the sale contract until sold.
          </p>
          <ul v-else class="flex flex-wrap gap-2">
            <li v-for="o in result.ownedTon" :key="o.item">
              <UButton :to="`/tools/dns-lookup?q=${o.domain}`" :label="o.domain" size="sm" color="neutral" variant="outline" :trailing-icon="o.pointsHere ? 'i-lucide-arrow-left-right' : undefined" class="font-mono" />
            </li>
          </ul>
          <p v-if="result.ownedTon.length" class="text-xs text-muted">
            <UIcon name="i-lucide-arrow-left-right" class="-mb-0.5 size-3.5" /> marks domains that also point back to this address. Check renewal dates with the
            <ULink to="/tools/dns-expiry-checker" class="text-primary">expiry checker</ULink>.
          </p>
        </section>

        <section v-if="!isTestnet" class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Owned Telegram usernames ({{ result.ownedUsernames.length }}<template v-if="result.ownedUsernames.length >= MAX_OWNED">+</template>)
          </h3>
          <p v-if="!result.ownedUsernames.length" class="text-sm text-muted">
            None.
          </p>
          <ul v-else class="flex flex-wrap gap-2">
            <li v-for="o in result.ownedUsernames" :key="o.item">
              <UButton :to="fragmentUrl(o.domain)" target="_blank" :label="`@${o.domain.replace(/\.t\.me$/, '')}`" size="sm" color="neutral" variant="outline" :trailing-icon="o.pointsHere ? 'i-lucide-arrow-left-right' : undefined" />
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>
