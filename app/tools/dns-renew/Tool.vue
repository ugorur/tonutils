<script setup lang="ts">
import type { TonTrace } from '~/composables/useTonConnect'
import type { OwnedDomain } from '~/lib/dns-write/dns'
import { domainStatus, fetchOwnedDomains, fmtDate, lookupInput, ONE_YEAR, relativeTime, RENEW_AMOUNT, walletMaxMessages } from '~/lib/dns-write/dns'
import { chunk, expiryLevel, renewMessages, SOON_DAYS } from './logic'

interface Row extends OwnedDomain {
  /** Renewed in this session (the list shows the new expiry). */
  renewed?: boolean
}

const tc = useToncenter()
const tonapi = useTonapi()
const ton = useTonConnect()
const { network, isTestnet } = useTonNetwork()
const now = Math.floor(Date.now() / 1000)

const rows = ref<Row[]>([])
const selected = ref<Set<string>>(new Set())
const loading = ref(false)
const error = ref<unknown>(null)
const loadedFor = ref<string | null>(null)

async function load(owner: string) {
  loading.value = true
  error.value = null
  try {
    const list = await fetchOwnedDomains(tonapi.get, network.value, owner)
    rows.value = list
    selected.value = new Set(list.filter(d => expiryLevel(d.expiringAt, now) !== 'ok').map(d => d.address))
    loadedFor.value = owner
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}


function toggle(address: string, on: boolean) {
  const s = new Set(selected.value)
  if (on) s.add(address)
  else s.delete(address)
  selected.value = s
}
const selectAll = (on: boolean) => {
  selected.value = new Set(on ? rows.value.filter(r => !r.renewed).map(r => r.address) : [])
}

// ---------------------------------------------------------------- add a domain by hand
const extra = ref('')
const adding = ref(false)
const addError = ref<unknown>(null)
async function add(wallet: { address: string }) {
  if (!extra.value.trim()) return
  adding.value = true
  addError.value = null
  try {
    const r = await lookupInput(tc.v3, network.value, extra.value)
    const st = domainStatus(r.item, Math.floor(Date.now() / 1000))
    const owner = st.kind === 'won' ? st.winner : st.kind === 'owned' || st.kind === 'expired' ? st.owner : null
    if (!owner) throw new Error(st.kind === 'auction' ? 'This domain is still in auction.' : 'This domain is not registered.')
    if (owner.toRawString() !== wallet.address.toLowerCase()) throw new Error('Your connected wallet does not own this domain, so it cannot renew it.')
    const address = r.address.toRawString()
    const row: Row = { name: `${r.name}.ton`, address, expiringAt: st.kind === 'won' || st.kind === 'owned' || st.kind === 'expired' ? st.expiresAt : 0 }
    rows.value = [...rows.value.filter(x => x.address !== address), row].sort((a, b) => a.expiringAt - b.expiringAt)
    toggle(address, true)
    extra.value = ''
  }
  catch (e) {
    addError.value = e
  }
  finally {
    adding.value = false
  }
}

// ---------------------------------------------------------------- batches + send
const maxMessages = computed(() => walletMaxMessages(ton.wallet.value?.device.features as unknown[] | undefined))
const chosen = computed(() => rows.value.filter(r => selected.value.has(r.address) && !r.renewed))
const batches = computed(() => chunk(chosen.value, maxMessages.value))
// Renewed rows drop out of `chosen`, so the first batch is always the next one to send.
const current = computed(() => batches.value[0] ?? [])
const messages = computed(() => renewMessages(current.value.map(r => r.address), isTestnet.value))

const sending = ref(false)
const sendError = ref<unknown>(null)
const sent = shallowRef<{ hash: string, trace: TonTrace | null, names: string[] } | null>(null)
async function send() {
  if (!messages.value.length) return
  const names = current.value.map(r => r.name)
  const addrs = new Set(current.value.map(r => r.address))
  sending.value = true
  sendError.value = null
  try {
    const r = await ton.sendTransaction({ messages: messages.value })
    sent.value = { hash: r.hash, trace: null, names }
    const trace = await ton.waitForTransaction(r.hash)
    sent.value = { hash: r.hash, trace, names }
    const renewedAt = Math.floor(Date.now() / 1000)
    // ponytail: assumes every message succeeded (all are the wallet's own domains); re-read the items if bounces matter.
    rows.value = rows.value.map(x => (addrs.has(x.address) ? { ...x, renewed: true, expiringAt: renewedAt + ONE_YEAR } : x))
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = false
  }
}

watch(() => (ton.wallet.value && !ton.networkMismatch.value ? ton.wallet.value.address : null), (a) => {
  rows.value = []
  selected.value = new Set()
  sent.value = null
  loadedFor.value = null
  if (a) load(a)
}, { immediate: true })

const LEVEL = {
  expired: { label: 'Expired', color: 'error' as const },
  soon: { label: 'Expiring soon', color: 'warning' as const },
  ok: { label: 'OK', color: 'neutral' as const }
}
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      A .ton domain stays yours for one year after the owner's last action on it. Renewing costs {{ formatCoin(RENEW_AMOUNT) }} in gas per domain, plus the network fee.
      If a domain goes a full year without renewal, anyone can release it and start a new auction, and you lose it.
    </p>

    <WalletGate purpose="renew your domains">
      <template #default="{ wallet }">
        <div class="space-y-5">
          <LoadingState v-if="loading" label="Loading your .ton domains…" />
          <ErrorNotice :error="error" title="Could not list your domains" @retry="load(wallet.address)" />

          <template v-if="loadedFor">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-display text-sm font-semibold text-highlighted">
                Your .ton domains ({{ rows.length }})
              </h3>
              <div v-if="rows.length" class="flex gap-2">
                <UButton label="Select all" size="xs" color="neutral" variant="soft" @click="selectAll(true)" />
                <UButton label="None" size="xs" color="neutral" variant="ghost" @click="selectAll(false)" />
              </div>
            </div>

            <p v-if="!rows.length" class="rounded-lg border border-dashed border-accented p-4 text-sm text-muted">
              No .ton domains found for this wallet on {{ network }}. If you own one that is not listed, add it below.
            </p>

            <ul v-else class="divide-y divide-default rounded-lg border border-default" data-testid="renew-list">
              <li v-for="r in rows" :key="r.address" class="flex items-center gap-3 px-3 py-2.5">
                <UCheckbox :model-value="selected.has(r.address) && !r.renewed" :disabled="r.renewed" :aria-label="`Renew ${r.name}`" @update:model-value="toggle(r.address, !!$event)" />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-highlighted">
                    {{ r.name }}
                  </div>
                  <div class="text-xs text-muted">
                    {{ r.renewed ? 'Renewed until' : expiryLevel(r.expiringAt, now) === 'expired' ? 'Expired' : 'Expires' }} {{ fmtDate(r.expiringAt) }} · {{ relativeTime(r.expiringAt, now) }}
                  </div>
                </div>
                <UBadge v-if="r.renewed" color="success" variant="subtle" icon="i-lucide-check" label="Renewed" />
                <UBadge v-else :color="LEVEL[expiryLevel(r.expiringAt, now)].color" variant="subtle" :label="LEVEL[expiryLevel(r.expiringAt, now)].label" />
              </li>
            </ul>
            <p class="text-xs text-muted">
              Expiry dates in this list come from the tonapi index (accurate to minutes). Domains expiring within {{ SOON_DAYS }} days are preselected.
            </p>

            <form class="flex flex-col gap-2 sm:flex-row sm:items-start" @submit.prevent="add(wallet)">
              <UFormField label="Add a domain that is not listed" class="flex-1">
                <UInput v-model="extra" placeholder="alice.ton or its contract address" class="w-full" autocomplete="off" spellcheck="false" :ui="{ base: 'font-mono text-sm' }" />
              </UFormField>
              <UButton type="submit" label="Add" icon="i-lucide-plus" color="neutral" variant="outline" class="sm:mt-6" :loading="adding" :disabled="!extra.trim()" />
            </form>
            <ErrorNotice :error="addError" title="Could not add the domain" />

            <section v-if="chosen.length" class="space-y-4 border-t border-default pt-5" aria-labelledby="renew-h">
              <div>
                <h3 id="renew-h" class="font-display text-sm font-semibold text-highlighted">
                  Renew {{ chosen.length }} domain{{ chosen.length === 1 ? '' : 's' }}
                </h3>
                <p v-if="batches.length > 1" class="mt-1 text-sm text-muted">
                  Your wallet accepts up to {{ maxMessages }} messages per transaction, so this takes {{ batches.length }} transactions. Next: {{ current.map(r => r.name).join(', ') }}.
                </p>
              </div>
              <TxPreview :messages="messages" />
              <p class="text-xs text-muted">
                Each message asks the domain contract to delete record key 0, which nothing uses. Any action by the owner resets the one-year timer; this is the same message dns.ton.org sends.
              </p>
              <UButton :label="batches.length > 1 ? `Renew ${current.length} in wallet (transaction 1 of ${batches.length})` : 'Renew in wallet'" icon="i-lucide-calendar-sync" :loading="sending" @click="send" />
            </section>

            <ErrorNotice :error="sendError" title="Not sent" />
            <div v-if="sent" class="space-y-2 rounded-lg border border-success/40 p-4 text-sm" data-testid="renew-sent">
              <p v-if="!sent.trace" class="text-muted">
                Sent. Waiting for the network to process {{ sent.names.join(', ') }}…
              </p>
              <template v-else>
                <p class="font-medium text-success">
                  Renewed {{ sent.names.join(', ') }} for another year.
                </p>
                <ExplorerLinks kind="tx" :value="sent.trace.external_hash" />
              </template>
            </div>
          </template>
        </div>
      </template>
    </WalletGate>
  </div>
</template>
