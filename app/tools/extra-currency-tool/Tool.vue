<script setup lang="ts">
import type { Address } from '@ton/core'
import { Address as Addr } from '@ton/core'
import type { SendResult, TonConnectMessage } from '~/composables/useTonConnect'
import { TON_CHAIN_ID, TonConnectNetworkError } from '~/composables/useTonConnect'
import { bocOut } from '~/lib/payload-builders/common'
import SendPanel from '~/lib/payload-builders/SendPanel.vue'
import { formatJettonAmount } from '~/utils/ton/jetton'
import { commentBody, normalizedExtMessageHash } from '~/utils/ton/messages'
import type { EcBalance } from './logic'
import { extraCurrencyCollection, fromTonapi, fromToncenter, normalizeCurrencyId, signedCurrencyId, tonConnectExtraCurrency, walletSupportsExtraCurrency } from './logic'

const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const toncenter = useToncenter()
const tc = useTonConnect()

// Holds FMS (239) and currency 4294967279 ($-17), minted by ConfigParam 7, on mainnet and testnet.
const SYSTEM = 'Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU'

async function fetchBalances(a: Address): Promise<{ balances: EcBalance[], source: string }> {
  try {
    const r = await tonapi.get<{ extra_balance?: { amount: string, preview: { id: number, symbol: string, decimals: number } }[] }>(`accounts/${a.toRawString()}`)
    return { balances: fromTonapi(r.extra_balance), source: 'tonapi' }
  }
  catch {
    const r = await toncenter.v2<{ extra_currencies?: { id: number, amount: string }[] }>('getAddressInformation', { address: a.toRawString() })
    return { balances: fromToncenter(r.extra_currencies), source: 'toncenter (decimals unknown, 9 assumed)' }
  }
}

// ---------------------------------------------------------------- inspector
const lookText = ref('')
const look = shallowRef<Address | null>(null)
const result = shallowRef<{ balances: EcBalance[], source: string } | null>(null)
const lookError = ref<unknown>(null)
const looking = ref(false)
async function inspect() {
  result.value = null
  lookError.value = null
  const a = look.value
  if (!a) return
  looking.value = true
  try {
    const r = await fetchBalances(a)
    if (look.value?.equals(a)) result.value = r
  }
  catch (e) {
    lookError.value = e
  }
  finally {
    looking.value = false
  }
}
watch([() => look.value?.toRawString(), network], () => inspect())
const columns = [
  { accessorKey: 'id', header: 'Currency id' },
  { accessorKey: 'amount', header: 'Balance' }
]

// ---------------------------------------------------------------- send
const mine = shallowRef<EcBalance[]>([])
const mineError = ref<unknown>(null)
watch(() => tc.wallet.value?.address, async (raw) => {
  mine.value = []
  mineError.value = null
  if (!raw) return
  try {
    mine.value = (await fetchBalances(Addr.parse(raw))).balances
  }
  catch (e) {
    mineError.value = e
  }
}, { immediate: true })

const supported = computed(() => walletSupportsExtraCurrency(tc.wallet.value?.device.features as unknown[] | undefined))
const toText = ref('')
const to = shallowRef<Address | null>(null)
const idText = ref('')
const meta = computed(() => {
  try {
    const id = normalizeCurrencyId(idText.value)
    const b = mine.value.find(b => b.id === id) ?? null
    // Symbol/decimals are off-chain metadata: take them from your balances or from the inspected account.
    const ref = b ?? result.value?.balances.find(x => x.id === id) ?? null
    return { id, b, ref }
  }
  catch {
    return null
  }
})
const decimals = computed(() => meta.value?.ref?.decimals ?? 9)
const ecText = ref('')
const ec = ref<bigint | null>(null)
const gramText = ref('0')
const gram = ref<bigint | null>(0n)
const commentText = ref('')

const built = computed(() => {
  if (!idText.value.trim() || !to.value || ec.value === null || gram.value === null) return null
  try {
    const id = normalizeCurrencyId(idText.value)
    const entries = [{ id, amount: ec.value }]
    return { ok: true as const, extraCurrency: tonConnectExtraCurrency(entries), cell: extraCurrencyCollection(entries) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const messages = computed<TonConnectMessage[] | null>(() => {
  if (!built.value?.ok || !to.value) return null
  // Keep the bounce flag the user typed (EQ… for contracts); raw or UQ… addresses go non-bounceable.
  const t = toText.value.trim()
  const bounceable = Addr.isFriendly(t) && Addr.parseFriendly(t).isBounceable
  return [{ address: to.value.toString({ bounceable, testOnly: isTestnet.value }), amount: gram.value!, payload: commentText.value ? commentBody(commentText.value) : undefined }]
})
const blocked = computed(() => {
  if (!tc.wallet.value) return null
  if (!supported.value) return `${tc.wallet.value.walletName} does not advertise extra currency support (TonConnect extraCurrencySupported), so it would drop the currencies. Use a wallet that supports them.`
  if (meta.value?.b && ec.value !== null && ec.value > meta.value.b.amount) return 'More than your balance of this currency: the wallet would skip the message.'
  return null
})

/** useTonConnect().sendTransaction has no extraCurrency field yet, so this calls TonConnect directly with the same checks. */
async function sendWithEc(msgs: TonConnectMessage[]): Promise<SendResult> {
  const ui = await tc.getUi()
  const w = tc.wallet.value
  if (!ui.connected || !w) throw new Error('Connect a wallet first.')
  if (w.network !== network.value) throw new TonConnectNetworkError(w.network ?? `chain ${w.chain}`, network.value)
  if (!built.value?.ok) throw new Error('Nothing to send.')
  const m = msgs[0]!
  const res = await ui.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    network: TON_CHAIN_ID[network.value],
    messages: [{
      address: m.address,
      amount: BigInt(m.amount).toString(),
      payload: m.payload === undefined ? undefined : typeof m.payload === 'string' ? m.payload : m.payload.toBoc().toString('base64'),
      extraCurrency: built.value.extraCurrency
    }]
  })
  return { boc: res.boc, hash: normalizedExtMessageHash(res.boc) }
}

function fmt(b: EcBalance) {
  return formatJettonAmount(b.amount, b.decimals, { symbol: b.symbol })
}
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-4" aria-labelledby="ec-inspect">
      <h3 id="ec-inspect" class="font-display text-sm font-semibold text-highlighted">
        Extra currency balances
      </h3>
      <p class="text-sm text-muted">
        Extra currencies are native coins other than {{ COIN_SYMBOL }} that live in the account balance itself (no jetton contracts). They are minted by the network config (ConfigParam 7) and identified by a 32-bit id.
      </p>
      <AddressInput v-model="lookText" label="Account address" @parsed="look = $event" />
      <div class="-mt-3 flex flex-wrap gap-x-4">
        <UButton label="Try the system account (holds FMS and $-17)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="lookText = SYSTEM" />
        <UButton v-if="tc.wallet.value" label="My wallet" icon="i-lucide-wallet" variant="link" size="sm" class="px-0" @click="lookText = tc.wallet.value.friendly" />
      </div>
      <LoadingState v-if="looking" label="Reading balances…" />
      <ErrorNotice v-else-if="lookError" :error="lookError" @retry="inspect" />
      <template v-else-if="result">
        <p v-if="!result.balances.length" class="text-sm text-muted">
          This account holds no extra currencies.
        </p>
        <UTable v-else :data="result.balances" :columns="columns" :ui="{ td: 'whitespace-normal' }" data-testid="ec-table">
          <template #id-cell="{ row }">
            <span class="font-mono">{{ row.original.id }}</span>
            <div v-if="signedCurrencyId(row.original.id) !== row.original.id" class="text-xs text-muted">
              APIs show {{ signedCurrencyId(row.original.id) }}
            </div>
          </template>
          <template #amount-cell="{ row }">
            <span class="font-mono">{{ fmt(row.original) }}</span>
            <div class="font-mono text-xs text-muted [overflow-wrap:anywhere]">
              {{ row.original.amount }} units, {{ row.original.decimals }} decimals
            </div>
          </template>
        </UTable>
        <p class="text-xs text-dimmed">
          Source: {{ result.source }}. Symbols and decimals are not stored on chain; they come from tonapi's reference list.
        </p>
      </template>
    </section>

    <USeparator />

    <section class="space-y-4" aria-labelledby="ec-send">
      <h3 id="ec-send" class="font-display text-sm font-semibold text-highlighted">
        Send extra currency
      </h3>
      <p class="text-sm text-muted">
        Builds a TonConnect message with the <code class="font-mono">extraCurrency</code> field. Your wallet attaches the currency to the message value; the recipient needs no contract to receive it.
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <AddressInput v-model="toText" label="Recipient" @parsed="to = $event" />
        <UFormField label="Currency id" hint="uint32, or the signed id an API shows">
          <UInput v-model="idText" class="w-full" size="lg" :ui="{ base: 'font-mono' }" inputmode="numeric" placeholder="e.g. 239" />
        </UFormField>
      </div>
      <div v-if="mine.length" class="-mt-2 flex flex-wrap gap-2">
        <span class="text-xs text-muted">Your balances:</span>
        <UButton v-for="b in mine" :key="b.id" :label="fmt(b)" size="xs" color="neutral" variant="outline" @click="idText = String(b.id); ecText = formatUnits(b.amount, b.decimals)" />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <AmountInput v-model="ecText" v-model:nano="ec" label="Amount" :unit="meta?.ref?.symbol ?? 'units'" :decimals="decimals" :hint="meta && !meta.ref ? 'Decimals unknown for this id (not in your or the inspected balances), 9 assumed' : `${decimals} decimals${ec !== null ? ` · ${ec} raw units` : ''}`" />
        <AmountInput v-model="gramText" v-model:nano="gram" :label="`${COIN_SYMBOL} sent along (may be 0)`" />
      </div>
      <UFormField label="Comment (optional)">
        <UInput v-model="commentText" class="w-full" />
      </UFormField>
      <UAlert v-if="built && !built.ok" color="error" variant="subtle" icon="i-lucide-circle-x" :description="built.error" />

      <template v-if="built?.ok">
        <div class="divide-y divide-default rounded-lg border border-default px-4">
          <ResultField label="TonConnect extraCurrency" :value="JSON.stringify(built.extraCurrency)" />
          <ResultField label="ExtraCurrencyCollection (the other field of the message value, BOC)" :value="bocOut(built.cell).base64" hint="HashmapE 32 (VarUInteger 32), as in block.tlb" />
        </div>
        <SendPanel :messages="messages" purpose="send extra currencies" :blocked="blocked" :sender="sendWithEc">
          <template #after-preview>
            <UAlert color="info" variant="subtle" icon="i-lucide-coins" :title="`Also attached: ${formatJettonAmount(ec ?? 0n, decimals, { symbol: meta?.ref?.symbol })} (currency id ${meta?.id})`" :description="`The preview above shows only the ${COIN_SYMBOL} part; your wallet must show the extra currency too before you approve.`" />
          </template>
        </SendPanel>
      </template>
      <ErrorNotice v-if="mineError" :error="mineError" title="Could not read your balances" />
      <p class="text-xs text-dimmed">
        Mode 128 ("send all") carries only {{ COIN_SYMBOL }} since the extra currency v2 update: extra currencies move only when listed explicitly. Contracts cannot reserve them with RAWRESERVE either.
      </p>
    </section>
  </div>
</template>
