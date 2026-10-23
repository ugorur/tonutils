<script setup lang="ts">
import { Address } from '@ton/core'
import { tonapiPost } from '~/lib/jettons-dev/chain'
import { TonApiError, buildUrl, rateLimitedJson } from '~/utils/api-client'
import { formatJettonAmount } from '~/utils/ton/jetton'
import type { EstimateView, GaslessConfig, GaslessEstimate } from './logic'
import { estimateMessageHex, explainGaslessError, readEstimate } from './logic'

// The relayer only works on mainnet (testnet tonapi returns the mainnet jetton list), so this tool always reads mainnet.
const ta = useTonapi('mainnet')
const tc = useToncenter('mainnet')
const { isTestnet } = useTonNetwork()
const tonConnect = useTonConnect()

const USDT_RAW = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE'
const EXAMPLE = {
  wallet: 'UQCqy4q_Cw8f2YjSwTRKpnx458-vs8Z_ESp1VGp5eHcYBFGn', // W5 wallet holding USD₮ (tonapi, 2026-10-22)
  to: 'UQBQI1N8Z5_mJ0gqm8LFeGq6S-j5dkrFXgjeMBf-vtOlD21Z',
  amount: '1'
}

interface GasJetton { master: string, symbol: string, name: string, decimals: number, image?: string }

// ---------------------------------------------------------------- supported jettons
const config = shallowRef<GaslessConfig | null>(null)
const jettons = ref<GasJetton[]>([])
const listLoading = ref(true)
const listError = ref<unknown>(null)

async function loadConfig() {
  listLoading.value = true
  listError.value = null
  try {
    config.value = await ta.get<GaslessConfig>('gasless/config')
    const url = new URL(buildUrl(`${tc.baseUrl()}/v3`, 'metadata'))
    for (const j of config.value.gas_jettons) url.searchParams.append('address', j.master_id)
    const meta = await rateLimitedJson<Record<string, { token_info?: { symbol?: string, name?: string, image?: string, extra?: { decimals?: string, _image_small?: string } }[] }>>(url.toString(), { provider: 'toncenter' })
    const byRaw = new Map(Object.entries(meta).map(([k, v]) => [k.toUpperCase(), v.token_info?.[0]]))
    jettons.value = config.value.gas_jettons.map((j) => {
      const t = byRaw.get(j.master_id.toUpperCase())
      return { master: j.master_id.toUpperCase(), symbol: t?.symbol ?? '?', name: t?.name ?? j.master_id, decimals: Number(t?.extra?.decimals ?? 9), image: t?.extra?._image_small ?? t?.image }
    }).sort((a, b) => (a.master === USDT_RAW ? -1 : b.master === USDT_RAW ? 1 : a.symbol.localeCompare(b.symbol)))
    if (!jettons.value.some(j => j.master === master.value)) master.value = jettons.value[0]?.master ?? ''
  }
  catch (e) {
    listError.value = e
  }
  finally {
    listLoading.value = false
  }
}
onMounted(loadConfig)

// ---------------------------------------------------------------- estimate form
const wallet = ref('')
const walletParsed = shallowRef<Address | null>(null)
const to = ref('')
const toParsed = shallowRef<Address | null>(null)
const master = ref(USDT_RAW)
const amountText = ref('')
const amount = ref<bigint | null>(null)
const comment = ref('')
const jetton = computed(() => jettons.value.find(j => j.master === master.value) ?? null)
const jettonItems = computed(() => jettons.value.map(j => ({ label: `${j.symbol} · ${j.name}`, value: j.master })))
const canQuote = computed(() => !!walletParsed.value && !!toParsed.value && !!amount.value && amount.value > 0n && !!jetton.value)

function useConnected() {
  if (tonConnect.wallet.value) wallet.value = tonConnect.wallet.value.friendly
}
function tryExample() {
  wallet.value = EXAMPLE.wallet
  to.value = EXAMPLE.to
  master.value = USDT_RAW
  amountText.value = EXAMPLE.amount
  nextTick(quote)
}

const running = ref(false)
const step = ref('')
const error = ref<unknown>(null)
const hint = ref<string | null>(null)
const result = shallowRef<(EstimateView & { balance: bigint, walletVersion: string, jettonWallet: string }) | null>(null)

async function quote() {
  if (!canQuote.value) return
  running.value = true
  error.value = null
  hint.value = null
  result.value = null
  const owner = walletParsed.value!.toRawString()
  try {
    step.value = 'Checking the wallet…'
    const acc = await ta.get<{ status?: string, interfaces?: string[] }>(`accounts/${owner}`)
    const version = acc.interfaces?.find(i => i.startsWith('wallet_')) ?? 'unknown'
    if (acc.status !== 'active') throw new Error('This wallet is not active yet. It needs at least one outgoing transaction before it can use gasless transfers.')
    if (version !== 'wallet_v5r1' && version !== 'wallet_v5_beta') {
      hint.value = `This wallet is ${version.replace('wallet_', '')}. Gasless transfers need a W5 (v5r1) wallet; most wallet apps can create one for the same recovery phrase.`
      return
    }
    step.value = 'Reading the public key…'
    const { public_key: publicKey } = await ta.get<{ public_key: string }>(`accounts/${owner}/publickey`)
    step.value = `Finding your ${jetton.value!.symbol} wallet…`
    let jw: { balance: string, wallet_address: { address: string } }
    try {
      jw = await ta.get(`accounts/${owner}/jettons/${master.value.toLowerCase()}`)
    }
    catch (e) {
      if (e instanceof TonApiError && e.status === 404) {
        hint.value = `This wallet holds no ${jetton.value!.symbol}.`
        return
      }
      throw e
    }
    step.value = 'Asking the relayer for a quote…'
    const relay = Address.parse(config.value!.relay_address)
    const boc = estimateMessageHex({ jettonWallet: Address.parse(jw.wallet_address.address), destination: toParsed.value!, relay, amount: amount.value!, comment: comment.value.trim() || undefined })
    let est: GaslessEstimate
    try {
      est = await tonapiPost<GaslessEstimate>(ta.baseUrl(), `gasless/estimate/${master.value.toLowerCase()}`, { wallet_address: owner, wallet_public_key: publicKey, messages: [{ boc }] })
    }
    catch (e) {
      const why = e instanceof TonApiError ? explainGaslessError(e.body) : null
      if (why) {
        hint.value = why
        return
      }
      throw e
    }
    result.value = { ...readEstimate(est, amount.value!, config.value!.relay_address), balance: BigInt(jw.balance), walletVersion: version, jettonWallet: jw.wallet_address.address }
  }
  catch (e) {
    error.value = e
  }
  finally {
    running.value = false
    step.value = ''
  }
}

function userFriendly(a: unknown): string {
  try {
    return Address.parse(String(a)).toString({ bounceable: false })
  }
  catch {
    return String(a ?? '')
  }
}

const validTime = computed(() => (result.value ? new Date(result.value.validUntil * 1000).toLocaleTimeString() : ''))
</script>

<template>
  <div class="space-y-8">
    <UAlert
      v-if="isTestnet"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Mainnet only"
      description="tonapi's gasless relayer runs on mainnet, so this tool reads mainnet data even while TonUtils is set to testnet."
    />

    <section class="space-y-3">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Jettons that can pay their own fees
      </h3>
      <p class="text-sm text-muted">
        With a gasless transfer you pay the network fee in the token you send instead of {{ COIN_SYMBOL }} (formerly Toncoin): a relayer covers the {{ COIN_SYMBOL }} and takes a small fee in the jetton.
      </p>
      <LoadingState v-if="listLoading" label="Loading tonapi's gasless config…" />
      <ErrorNotice :error="listError" @retry="loadConfig" />
      <div v-if="jettons.length" class="flex flex-wrap gap-2">
        <button
          v-for="j in jettons"
          :key="j.master"
          type="button"
          class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
          :class="j.master === master ? 'border-primary bg-primary/10 text-highlighted' : 'border-default hover:bg-elevated'"
          :aria-pressed="j.master === master"
          @click="master = j.master"
        >
          <img v-if="j.image" :src="j.image" alt="" class="size-5 rounded-full" referrerpolicy="no-referrer" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'">
          <span class="font-medium">{{ j.symbol }}</span>
          <span class="hidden text-muted sm:inline">{{ j.name }}</span>
        </button>
      </div>
      <p v-if="config" class="text-xs text-dimmed">
        Relayer: <span class="font-mono break-all">{{ config.relay_address }}</span>
      </p>
    </section>

    <section class="space-y-4">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Get a quote
      </h3>
      <form class="space-y-4" @submit.prevent="quote">
        <div>
          <AddressInput v-model="wallet" label="Your wallet (sender, must be W5)" @parsed="walletParsed = $event" />
          <div class="mt-1 flex flex-wrap gap-x-4">
            <UButton v-if="tonConnect.wallet.value" label="Use my connected wallet" icon="i-lucide-wallet" variant="link" size="sm" class="px-0" @click="useConnected" />
            <UButton label="Try an example (1 USD₮)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" :disabled="listLoading" @click="tryExample" />
          </div>
        </div>
        <UFormField label="Pay with">
          <USelect v-model="master" :items="jettonItems" class="w-full sm:w-96" :loading="listLoading" />
        </UFormField>
        <AddressInput v-model="to" label="Recipient" @parsed="toParsed = $event" />
        <div class="grid gap-4 sm:grid-cols-2">
          <AmountInput v-model="amountText" v-model:nano="amount" :unit="jetton?.symbol ?? ''" :decimals="jetton?.decimals ?? 9" />
          <UFormField label="Comment (optional)">
            <UInput v-model="comment" placeholder="Invoice 42" class="w-full" />
          </UFormField>
        </div>
        <UButton type="submit" label="Get quote" icon="i-lucide-calculator" size="lg" :loading="running" :disabled="!canQuote" />
      </form>

      <LoadingState v-if="running" :label="step" />
      <ErrorNotice :error="error" @retry="quote" />
      <UAlert v-if="hint" color="warning" variant="subtle" icon="i-lucide-info" title="No gasless quote" :description="hint" />
    </section>

    <section v-if="result && jetton" class="space-y-4" aria-live="polite">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Relayer fee
          </div>
          <div class="mt-1 text-lg text-highlighted">
            <TokenAmount :nano="result.commission" :decimals="jetton.decimals" :symbol="jetton.symbol" />
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Total taken from your balance
          </div>
          <div class="mt-1 text-lg text-highlighted">
            <TokenAmount :nano="result.totalJettons" :decimals="jetton.decimals" :symbol="jetton.symbol" />
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            {{ COIN_SYMBOL }} you need
          </div>
          <div class="mt-1 text-lg text-highlighted">
            0 {{ COIN_SYMBOL }}
          </div>
        </div>
      </div>
      <UAlert
        v-if="result.balance < result.totalJettons"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Balance too low"
        :description="`This wallet has ${formatJettonAmount(result.balance, jetton.decimals)} ${jetton.symbol}, less than the amount plus the fee.`"
      />
      <p class="text-sm text-muted">
        Quote valid until {{ validTime }}. Balance: <TokenAmount :nano="result.balance" :decimals="jetton.decimals" :symbol="jetton.symbol" />.
        The wallet would sign these messages and the relayer would send them, paying the {{ COIN_SYMBOL }} attached:
      </p>
      <ol class="space-y-3">
        <li v-for="(m, i) in result.messages" :key="i" class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="m.role === 'fee' ? 'warning' : 'primary'" variant="subtle" :label="m.role === 'fee' ? 'Relayer fee' : m.role === 'transfer' ? 'Your transfer' : 'Message'" />
            <span class="text-sm text-muted">to your {{ jetton.symbol }} wallet, <TokenAmount :nano="m.amount" /> attached by the relayer</span>
          </div>
          <dl v-if="m.body" class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt class="text-muted">
              Operation
            </dt>
            <dd>{{ m.body.title }}</dd>
            <dt class="text-muted">
              Amount
            </dt>
            <dd><TokenAmount :nano="String(m.body.fields.amount ?? 0)" :decimals="jetton.decimals" :symbol="jetton.symbol" /></dd>
            <dt class="text-muted">
              Recipient
            </dt>
            <dd class="min-w-0">
              <!-- decodeBody returns EQ… forms; show the non-bounceable mainnet form, no testnet explorer links (mainnet-only tool). -->
              <AddressLink :address="userFriendly(m.body.fields.destination)" :no-links="isTestnet" />
            </dd>
          </dl>
        </li>
      </ol>
      <p class="text-xs text-dimmed">
        This is a quote only: nothing was signed or sent. To send it, use the <NuxtLink to="/tools/gasless-send" class="text-primary underline">gasless send</NuxtLink> tool or a wallet that supports gasless fees (for example Tonkeeper's "pay fee in USD₮").
      </p>
    </section>
  </div>
</template>
