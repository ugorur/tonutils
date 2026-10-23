<script setup lang="ts">
import type { TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import type { DomainLookup, OwnedDomain } from '~/lib/dns-write/dns'
import { domainStatus, EDIT_AMOUNT, fetchOwnedDomains, lookupInput, normalizeDomain } from '~/lib/dns-write/dns'
import DomainCard from '~/lib/dns-write/DomainCard.vue'
import type { RecordForm } from './logic'
import { CATEGORY_LABEL, editMessages, formFromRecords, planChanges } from './logic'

// foundation.ton has a wallet, a TON Site (ADNL) and a TON Storage record.
const EXAMPLE = 'foundation.ton'

const route = useRoute()
const tc = useToncenter()
const tonapi = useTonapi()
const ton = useTonConnect()
const { network, isTestnet } = useTonNetwork()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<DomainLookup | null>(null)
const now = ref(Math.floor(Date.now() / 1000))
let session = 0

const inputError = computed(() => {
  const v = input.value.trim()
  if (!v || /^(?:[EUk0]Q|-?\d:)/.test(v)) return undefined
  const n = normalizeDomain(v)
  return n.ok ? undefined : n.error
})

const empty: RecordForm = { wallet: '', siteType: 'adnl', site: '', storage: '', resolver: '' }
const initial = ref<RecordForm>({ ...empty })
const form = reactive<RecordForm>({ ...empty })

async function lookup() {
  if (!input.value.trim() || inputError.value) return
  const my = ++session
  loading.value = true
  error.value = null
  sent.value = null
  sendError.value = null
  try {
    const r = await lookupInput(tc.v3, network.value, input.value)
    if (my !== session) return
    now.value = Math.floor(Date.now() / 1000)
    result.value = r
    initial.value = formFromRecords(r.item?.records ?? new Map(), isTestnet.value)
    Object.assign(form, initial.value)
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function pick(name: string) {
  input.value = name
  nextTick(lookup)
}

onMounted(() => {
  if (input.value) nextTick(lookup)
})

// ---------------------------------------------------------------- your domains (tonapi), once per wallet
const mine = shallowRef<OwnedDomain[] | null>(null)
const mineError = ref<unknown>(null)
watch(() => ton.wallet.value && !ton.networkMismatch.value ? ton.wallet.value.address : null, async (addr) => {
  mine.value = null
  mineError.value = null
  if (!addr) return
  try {
    mine.value = await fetchOwnedDomains(tonapi.get, network.value, addr)
  }
  catch (e) {
    mineError.value = e
  }
}, { immediate: true })

watch(network, () => {
  session++
  result.value = null
  error.value = null
})

// ---------------------------------------------------------------- edit
const status = computed(() => (result.value ? domainStatus(result.value.item, now.value) : null))
const owner = computed(() => {
  const s = status.value
  if (!s) return null
  return s.kind === 'won' ? s.winner : s.kind === 'owned' || s.kind === 'expired' ? s.owner : null
})
const editable = computed(() => !!owner.value)
const isOwner = computed(() => !!(owner.value && ton.wallet.value && owner.value.toRawString() === ton.wallet.value.address.toLowerCase()))

const plan = computed(() => (result.value?.item ? planChanges(result.value.item.records, initial.value, { ...form }) : { changes: [], errors: [] }))
const messages = computed<TonConnectMessage[]>(() => (result.value && isOwner.value && !plan.value.errors.length
  ? editMessages(result.value.address, plan.value.changes, isTestnet.value)
  : []))

function useMyWallet() {
  if (ton.wallet.value) form.wallet = ton.wallet.value.friendly
}
const SITE_TYPES = [{ label: 'TON Site (ADNL)', value: 'adnl' }, { label: 'Site in TON Storage', value: 'storage' }]

const sending = ref(false)
const sendError = ref<unknown>(null)
const sent = shallowRef<{ hash: string, trace: TonTrace | null } | null>(null)
async function send() {
  if (!messages.value.length) return
  sending.value = true
  sendError.value = null
  try {
    const r = await ton.sendTransaction({ messages: messages.value })
    sent.value = { hash: r.hash, trace: null }
    const trace = await ton.waitForTransaction(r.hash)
    sent.value = { hash: r.hash, trace }
    const done = sent.value
    await lookup()
    sent.value = done
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label=".ton domain or its contract address" :error="inputError">
        <UInput v-model="input" placeholder="alice.ton" size="lg" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" :ui="{ base: 'font-mono text-sm' }" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" label="Load records" icon="i-lucide-search" :loading="loading" :disabled="!input.trim() || !!inputError" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="pick(EXAMPLE)" />
      </div>
      <div v-if="mine?.length" class="flex flex-wrap items-center gap-1.5 pt-1">
        <span class="text-xs text-muted">Your domains:</span>
        <UButton v-for="d in mine" :key="d.address" :label="d.name" size="xs" color="neutral" variant="soft" @click="pick(d.name)" />
      </div>
      <p v-else-if="mine && !mine.length" class="text-xs text-muted">
        The connected wallet owns no .ton domains on {{ network }}.
      </p>
      <ErrorNotice :error="mineError" title="Could not list your domains" />
    </form>

    <LoadingState v-if="loading && !result" label="Reading the domain from the blockchain…" />
    <ErrorNotice :error="error" title="Could not read the domain" @retry="lookup" />

    <template v-if="result && status">
      <DomainCard :lookup="result" :status="status" :now="now" />

      <UAlert v-if="!editable" color="info" variant="subtle" icon="i-lucide-info" :title="status.kind === 'free' ? 'Not registered' : 'Auction running'" description="Records can be set only by the owner of a registered domain. Win the auction first." />

      <section v-else class="space-y-5 border-t border-default pt-5" aria-labelledby="rec-h">
        <div>
          <h3 id="rec-h" class="font-display text-sm font-semibold text-highlighted">
            Records
          </h3>
          <p class="mt-1 text-sm text-muted">
            Change a field to set it, empty it to remove the record. Untouched fields stay as they are.
          </p>
        </div>

        <div class="grid gap-5">
          <div class="space-y-1.5">
            <AddressInput v-model="form.wallet" :label="CATEGORY_LABEL.wallet" placeholder="UQ… (where payments to the domain go)" />
            <div class="flex flex-wrap gap-2">
              <UButton v-if="ton.wallet.value" label="Use my wallet" size="xs" color="neutral" variant="soft" icon="i-lucide-wallet" @click="useMyWallet" />
              <UButton v-if="form.wallet" label="Clear" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="form.wallet = ''" />
              <UButton v-if="form.wallet !== initial.wallet" label="Undo" size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" @click="form.wallet = initial.wallet" />
            </div>
          </div>

          <div class="space-y-1.5">
            <UFormField :label="CATEGORY_LABEL.site" :hint="form.siteType === 'adnl' ? 'ADNL: 64 hex or 55-char .adnl form' : 'Bag ID: 64 hex'">
              <div class="flex flex-col gap-2 sm:flex-row">
                <USelect v-model="form.siteType" :items="SITE_TYPES" class="sm:w-52" />
                <UInput v-model="form.site" class="w-full" autocomplete="off" spellcheck="false" :ui="{ base: 'font-mono text-xs' }" :placeholder="form.siteType === 'adnl' ? 'ADNL address of your site' : 'TON Storage bag ID of your site'" />
              </div>
            </UFormField>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="form.site" label="Clear" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="form.site = ''" />
              <UButton v-if="form.site !== initial.site || form.siteType !== initial.siteType" label="Undo" size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" @click="form.site = initial.site; form.siteType = initial.siteType" />
            </div>
          </div>

          <div class="space-y-1.5">
            <UFormField :label="CATEGORY_LABEL.storage" hint="Bag ID: 64 hex">
              <UInput v-model="form.storage" class="w-full" autocomplete="off" spellcheck="false" placeholder="TON Storage bag ID" :ui="{ base: 'font-mono text-xs' }" />
            </UFormField>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="form.storage" label="Clear" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="form.storage = ''" />
              <UButton v-if="form.storage !== initial.storage" label="Undo" size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" @click="form.storage = initial.storage" />
            </div>
          </div>

          <div class="space-y-1.5">
            <AddressInput v-model="form.resolver" :label="CATEGORY_LABEL.dns_next_resolver" placeholder="EQ… contract that resolves *.yourname.ton (advanced)" />
            <div class="flex flex-wrap gap-2">
              <UButton v-if="form.resolver" label="Clear" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="form.resolver = ''" />
              <UButton v-if="form.resolver !== initial.resolver" label="Undo" size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" @click="form.resolver = initial.resolver" />
            </div>
          </div>
        </div>

        <UAlert v-for="e in plan.errors" :key="e" color="error" variant="subtle" icon="i-lucide-circle-x" :title="e" />

        <WalletGate purpose="edit this domain's records">
          <div class="space-y-4">
            <UAlert v-if="!isOwner" color="warning" variant="subtle" icon="i-lucide-user-x" title="Your wallet does not own this domain" description="Only the owner shown above can change its records. The domain contract would reject the change and bounce the value back." />

            <p v-else-if="!plan.changes.length && !plan.errors.length" class="text-sm text-muted">
              No changes yet.
            </p>

            <template v-if="messages.length">
              <ul class="space-y-1 text-sm" data-testid="rec-changes">
                <li v-for="c in plan.changes" :key="c.category" class="flex items-center gap-2">
                  <UIcon :name="c.value ? 'i-lucide-pencil' : 'i-lucide-trash-2'" class="size-4 shrink-0" :class="c.value ? 'text-primary' : 'text-error'" />
                  {{ c.summary }}
                </li>
              </ul>
              <TxPreview :messages="messages" />
              <p class="text-xs text-muted">
                Each change is one message with {{ formatCoin(EDIT_AMOUNT) }} for gas; what is not used stays on the domain contract. Any change also renews the domain for a year.
              </p>
              <UButton label="Save records in wallet" icon="i-lucide-save" :loading="sending" @click="send" />
            </template>
            <ErrorNotice :error="sendError" title="Not sent" />
            <div v-if="sent" class="space-y-2 rounded-lg border border-success/40 p-4 text-sm">
              <p v-if="!sent.trace" class="text-muted">
                Sent. Waiting for the network to process it…
              </p>
              <template v-else>
                <p class="font-medium text-success">
                  Done. The records above are reloaded from the chain.
                </p>
                <ExplorerLinks kind="tx" :value="sent.trace.external_hash" />
              </template>
            </div>
          </div>
        </WalletGate>
      </section>
    </template>
  </div>
</template>
