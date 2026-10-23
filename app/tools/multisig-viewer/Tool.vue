<script setup lang="ts">
import type { Address } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { JettonMeta, OrderAction, OrderStatus, TcJettonWallets, TcMultisig, TcOrder } from './logic'
import { approvals, decodeOrder, friendly, jettonMetaByWallet, jettonWalletsIn, orderStatus, roleOf } from './logic'

const EXAMPLES = [
  { label: 'Multisig (3 of 6)', value: 'EQDyoucGvxKV-mOI4wqZxDHOKUrvACcnlG0BOoXfwVVDF57R' },
  { label: 'A signer wallet', value: 'UQCE5mXcLJOnupbmZ6KVr2vI1m7rZJqjFVFEWuObwIrWJUfl' }
]
const ORDER_LIMIT = 1000
const PAGE_SIZE = 200

const input = ref('')
const parsed = ref<Address | null>(null)
const loading = ref('')
const error = ref<unknown>(null)

interface Order { o: TcOrder, status: OrderStatus, actions: OrderAction[] | null, decodeError: string | null }
const ms = ref<{ info: TcMultisig, address: string, balance: string, orders: Order[], jettons: Map<string, JettonMeta> } | null>(null)
const memberOf = ref<{ wallet: string, list: (TcMultisig & { role: string | null })[] } | null>(null)
const filter = ref<'all' | OrderStatus>('all')
const PAGE = 20
const visible = ref(PAGE)
watch(filter, () => (visible.value = PAGE))

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()

async function run() {
  if (!parsed.value) return
  const a = parsed.value
  const raw = a.toRawString()
  error.value = null
  ms.value = null
  memberOf.value = null
  filter.value = 'all'
  visible.value = PAGE
  try {
    loading.value = 'Looking up the multisig…'
    const w = await tc.v3<{ multisigs: TcMultisig[] }>('multisig/wallets', { address: raw, include_orders: false })
    const info = w.multisigs[0]
    if (!info) {
      loading.value = 'Not a multisig. Looking for multisigs this wallet belongs to…'
      const r = await tc.v3<{ multisigs: TcMultisig[] }>('multisig/wallets', { wallet_address: raw, include_orders: false, limit: 100 })
      memberOf.value = { wallet: a.toString({ bounceable: false, testOnly: isTestnet.value }), list: r.multisigs.map(m => ({ ...m, role: roleOf(m, raw) })) }
      return
    }
    loading.value = 'Reading orders…'
    const acc = await tc.v3<{ balance: string }>('account', { address: raw })
    // toncenter's sort=desc is not a reliable time order across pages: fetch up to ORDER_LIMIT, then sort by lt here.
    const list: TcOrder[] = []
    while (list.length < ORDER_LIMIT) {
      const r = await tc.v3<{ orders: TcOrder[] }>('multisig/orders', { multisig_address: raw, limit: PAGE_SIZE, offset: list.length, sort: 'desc' })
      list.push(...r.orders)
      if (r.orders.length < PAGE_SIZE) break
    }
    list.sort((x, y) => (BigInt(y.last_transaction_lt) > BigInt(x.last_transaction_lt) ? 1 : -1))
    const orders: Order[] = list.map((o) => {
      try {
        return { o, status: orderStatus(o), actions: o.order_boc ? decodeOrder(o.order_boc, { testOnly: isTestnet.value }) : null, decodeError: null }
      }
      catch (e) {
        return { o, status: orderStatus(o), actions: null, decodeError: (e as Error).message }
      }
    })
    const wallets = [...new Set(orders.flatMap(x => (x.actions ? jettonWalletsIn(x.actions) : [])))]
    let jettons = new Map<string, JettonMeta>()
    if (wallets.length) {
      loading.value = 'Resolving jettons…'
      try {
        jettons = jettonMetaByWallet(await tc.v3<TcJettonWallets>('jetton/wallets', { address: wallets.join(','), limit: wallets.length }))
      }
      catch {
        // amounts fall back to raw units
      }
    }
    ms.value = { info, address: a.toString({ testOnly: isTestnet.value }), balance: acc.balance, orders, jettons }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = ''
  }
}

function open(v: string) {
  input.value = v
  nextTick(run)
}
watch(network, () => {
  if (ms.value || memberOf.value) run()
})

const infoRows = computed<KeyValueItem[]>(() => {
  const m = ms.value?.info
  if (!m) return []
  return [
    { label: 'Approvals needed', value: `${m.threshold} of ${m.signers.length} signers`, mono: false, copy: false },
    { label: 'Next order seqno', value: m.next_order_seqno === '-1' ? 'Any (arbitrary order seqno allowed)' : m.next_order_seqno, mono: false, copy: false }
  ]
})
const counts = computed(() => {
  const c = { all: 0, pending: 0, executed: 0, expired: 0 }
  for (const x of ms.value?.orders ?? []) {
    c.all++
    c[x.status]++
  }
  return c
})
const shown = computed(() => (ms.value?.orders ?? []).filter(x => filter.value === 'all' || x.status === filter.value))

const STATUS: Record<OrderStatus, { label: string, color: 'warning' | 'success' | 'neutral' }> = {
  pending: { label: 'Waiting for approvals', color: 'warning' },
  executed: { label: 'Executed', color: 'success' },
  expired: { label: 'Expired', color: 'neutral' }
}

function jettonOf(a: OrderAction) {
  if (a.kind !== 'send' || a.body?.name !== 'jetton_transfer') return null
  const meta = ms.value?.jettons.get(a.destination)
  const to = a.body.fields.destination as string | null
  // Jetton recipients are usually wallets: show them non-bounceable like explorers do.
  return { amount: a.body.fields.amount as bigint, to: to ? friendly(to, { bounceable: false, testOnly: isTestnet.value }) : null, meta }
}
const date = (t: number) => new Date(t * 1000).toLocaleString()
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <AddressInput v-model="input" label="Multisig or signer wallet address" @parsed="a => (parsed = a)" />
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UButton type="submit" label="Look up" icon="i-lucide-search" :loading="!!loading" :disabled="!parsed" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="open(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="loading" />
    <ErrorNotice :error="error" @retry="run" />

    <!-- a regular wallet: multisigs it belongs to -->
    <template v-if="memberOf && !loading">
      <UAlert
        v-if="!memberOf.list.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-dashed"
        title="Not a multisig v2, and not a signer of one"
        description="The indexer knows no multisig v2 contract at this address or with this wallet as a signer or proposer. Older multisig v1 wallets (wallet-v4 style, multisig-code) are not covered."
      />
      <div v-else class="space-y-3">
        <p class="text-sm text-muted">
          This wallet is not a multisig itself. It belongs to {{ memberOf.list.length }} multisig{{ memberOf.list.length === 1 ? '' : 's' }}:
        </p>
        <div v-for="m in memberOf.list" :key="m.address" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default p-3">
          <div class="min-w-0 space-y-1">
            <AddressLink :address="m.address" />
            <div class="flex flex-wrap gap-2 text-sm text-muted">
              <UBadge :label="m.role === 'proposer' ? 'Proposer' : 'Signer'" variant="subtle" size="sm" />
              <span>{{ m.threshold }} of {{ m.signers.length }} signers</span>
            </div>
          </div>
          <UButton label="Open" trailing-icon="i-lucide-arrow-right" variant="soft" size="sm" @click="open(friendly(m.address, { testOnly: isTestnet }))" />
        </div>
      </div>
    </template>

    <!-- a multisig -->
    <template v-if="ms && !loading">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <AddressLink :address="ms.address" full />
        <TokenAmount :nano="ms.balance" class="text-highlighted" />
      </div>
      <KeyValue :items="infoRows" />

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Signers ({{ ms.info.signers.length }})
          </h3>
          <ol class="mt-2 space-y-1.5">
            <li v-for="(s, i) in ms.info.signers" :key="s" class="flex items-center gap-2 text-sm">
              <span class="w-5 shrink-0 text-right font-mono text-xs text-dimmed">{{ i }}</span>
              <AddressLink :address="s" :bounceable="false" />
            </li>
          </ol>
        </div>
        <div>
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Proposers ({{ ms.info.proposers.length }})
          </h3>
          <p v-if="!ms.info.proposers.length" class="mt-2 text-sm text-muted">
            None. Only signers can create orders.
          </p>
          <ol v-else class="mt-2 space-y-1.5">
            <li v-for="s in ms.info.proposers" :key="s" class="text-sm">
              <AddressLink :address="s" :bounceable="false" />
            </li>
          </ol>
          <p class="mt-2 text-xs text-muted">
            Proposers can create orders but cannot approve them.
          </p>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Orders
          </h3>
          <UTabs
            v-model="filter"
            :content="false"
            size="xs"
            :items="[
              { label: `All ${counts.all}`, value: 'all' },
              { label: `Pending ${counts.pending}`, value: 'pending' },
              { label: `Executed ${counts.executed}`, value: 'executed' },
              { label: `Expired ${counts.expired}`, value: 'expired' }
            ]"
          />
        </div>
        <p v-if="!shown.length" class="text-sm text-muted">
          No {{ filter === 'all' ? '' : filter }} orders.
        </p>
        <div v-for="x in shown.slice(0, visible)" :key="x.o.address" class="space-y-2 rounded-md border p-3 sm:p-4" :class="x.status === 'pending' ? 'border-warning' : 'border-default'">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-display text-sm font-semibold text-highlighted">Order #{{ x.o.order_seqno }}</span>
              <UBadge :color="STATUS[x.status].color" variant="subtle" size="sm" :label="STATUS[x.status].label" />
            </div>
            <span class="text-sm text-muted">{{ x.o.approvals_num }} / {{ x.o.threshold }} approvals</span>
          </div>

          <ul v-if="x.actions" class="space-y-1.5">
            <li v-for="(a, i) in x.actions" :key="i" class="text-sm">
              <template v-if="a.kind === 'send' && jettonOf(a)">
                Send
                <TokenAmount
                  :nano="jettonOf(a)!.amount"
                  :decimals="jettonOf(a)!.meta?.decimals ?? 9"
                  :symbol="jettonOf(a)!.meta?.symbol ?? 'jetton units'"
                  class="font-medium text-highlighted"
                />
                to
                <AddressLink v-if="jettonOf(a)!.to" :address="jettonOf(a)!.to!" class="inline-flex" />
                <span v-if="!jettonOf(a)!.meta" class="block text-xs text-dimmed">Jetton not resolved: amount shown in raw units (9 decimals assumed).</span>
              </template>
              <template v-else-if="a.kind === 'send'">
                Send <TokenAmount :nano="a.value" class="font-medium text-highlighted" /> to
                <AddressLink :address="a.destination" :bounceable="a.bounce" class="inline-flex" />
                <span v-if="a.body && a.body.name === 'text_comment' && a.body.fields.text" class="block text-xs text-muted">Comment: “{{ a.body.fields.text }}”</span>
                <span v-else-if="a.body && a.body.name !== 'text_comment'" class="block text-xs text-muted">Message: {{ a.body.title }}</span>
              </template>
              <template v-else-if="a.kind === 'update'">
                <span class="font-medium text-highlighted">Change settings:</span> {{ a.threshold }} of {{ a.signers.length }} signers, {{ a.proposers.length }} proposer{{ a.proposers.length === 1 ? '' : 's' }}
              </template>
              <template v-else>
                Unknown action {{ a.op }}
              </template>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            Actions not available{{ x.decodeError ? `: ${x.decodeError}` : '' }}.
          </p>

          <div class="flex flex-wrap gap-1">
            <UTooltip v-for="(s, i) in approvals(x.o.approvals_mask, x.o.signers)" :key="s.address" :text="`Signer ${i}: ${s.approved ? 'approved' : 'not approved'}`">
              <UBadge
                :color="s.approved ? 'success' : 'neutral'"
                :variant="s.approved ? 'subtle' : 'outline'"
                size="sm"
                :icon="s.approved ? 'i-lucide-check' : 'i-lucide-minus'"
                :label="`${i}`"
              />
            </UTooltip>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{{ x.status === 'expired' ? 'Expired' : x.status === 'executed' ? 'Valid until' : 'Expires' }} {{ date(x.o.expiration_date) }}</span>
            <ExplorerLinks :value="friendly(x.o.address, { testOnly: isTestnet })" />
          </div>
        </div>
        <UButton v-if="shown.length > visible" :label="`Show more (${shown.length - visible} left)`" icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="sm" @click="visible += PAGE" />
        <p v-if="counts.all >= ORDER_LIMIT" class="text-xs text-muted">
          Showing {{ ORDER_LIMIT }} orders, the most the viewer loads. Older orders may be missing.
        </p>
      </div>

      <p class="text-xs text-muted">
        Read-only. Data from the toncenter indexer; actions are decoded here from each order's own cell. To approve a pending order, use the signer wallet on multisig.ton.org.
      </p>
    </template>
  </div>
</template>
