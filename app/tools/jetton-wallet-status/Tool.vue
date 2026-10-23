<script setup lang="ts">
import JettonPicker from '~/lib/jettons-read/JettonPicker.vue'
import type { JettonBasics, TonapiJetton } from '~/lib/jettons-read/core'
import { formatTime, friendly, isRenounced, jettonBasics, toRaw } from '~/lib/jettons-read/core'
import { explorerUrl } from '~/utils/ton/explorers'
import { USDT_MASTER } from '~/utils/ton/jetton'
import type { LockEvent, ToncenterMessage } from './logic'
import { lockEvents, readStatus, statusInfo } from './logic'

// Real mainnet USD₮ holders: one locked by Tether (sending), one locked and later unlocked (see logic.test.ts).
const EXAMPLES = [
  { label: 'Locked wallet', value: 'UQAAssx6HeSvT1FZSf1xBuzPatIggcUUqKP8LmRkk1bT-JLR' },
  { label: 'Unlocked again', value: 'UQBp2rjx06bCGUbgYc6gb5xnhF5JS88lm4_flU66JaZck4pl' }
]

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const toncenter = useToncenter()

const ownerInput = ref(typeof route.query.owner === 'string' ? route.query.owner : '')
const masterInput = ref(typeof route.query.jetton === 'string' ? route.query.jetton : isTestnet.value ? '' : USDT_MASTER)
const parse = (s: string) => {
  try {
    return s.trim() ? toRaw(s) : null
  }
  catch {
    return null
  }
}
const ownerRaw = computed(() => parse(ownerInput.value))
const masterRaw = computed(() => parse(masterInput.value))

interface TcJettonWallets {
  jetton_wallets: { address: string, balance: string, owner: string, jetton: string }[]
  address_book?: Record<string, { interfaces?: string[] }>
}
interface Result {
  owner: string
  master: string
  wallet: string
  exists: boolean
  balance: bigint
  governed: boolean
  status: number | null
  events: LockEvent[]
  token: JettonBasics | null
  /** The master has no admin, so nobody can send set_status any more. */
  renounced: boolean
}

const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const result = ref<Result | null>(null)
let runId = 0

async function check() {
  const input = ownerRaw.value
  let master = masterRaw.value
  if (!input || !master) return
  const id = ++runId
  loading.value = true
  error.value = null
  result.value = null
  try {
    progress.value = 'Finding the jetton wallet…'
    const governedIn = (r: TcJettonWallets, a: string) => Object.entries(r.address_book ?? {}).some(([k, v]) => k.toLowerCase() === a.toLowerCase() && v.interfaces?.includes('jetton_wallet_governed'))
    let owner = input
    let r = await toncenter.v3<TcJettonWallets>('jetton/wallets', { owner_address: input, jetton_address: master, limit: 1 })
    if (!r.jetton_wallets.length) {
      // Maybe the user pasted the jetton wallet itself.
      const self = await toncenter.v3<TcJettonWallets>('jetton/wallets', { address: input, limit: 1 })
      if (self.jetton_wallets.length) {
        r = self
        owner = self.jetton_wallets[0]!.owner.toLowerCase()
        master = self.jetton_wallets[0]!.jetton.toLowerCase()
      }
    }
    if (id !== runId) return
    const tokenPromise = tonapi.get<TonapiJetton>(`jettons/${master}`).then(j => ({ basics: jettonBasics(j), renounced: isRenounced(j.admin?.address) }), () => null)
    const w = r.jetton_wallets[0]

    if (!w) {
      // No jetton wallet yet: show where it would be. Nothing exists, so nothing can be locked.
      progress.value = 'Computing the jetton wallet address…'
      const g = await tonapi.get<{ success: boolean, decoded?: { jetton_wallet_address?: string } }>(`blockchain/accounts/${master}/methods/get_wallet_address`, { args: owner })
      if (!g.success || !g.decoded?.jetton_wallet_address) throw new Error('The token address does not answer get_wallet_address. Pick the token contract (for example USD₮).')
      const token = await tokenPromise
      if (id !== runId) return
      result.value = { owner, master, wallet: g.decoded.jetton_wallet_address.toLowerCase(), exists: false, balance: 0n, governed: false, status: null, events: [], token: token?.basics ?? null, renounced: !!token?.renounced }
      return
    }

    const wallet = w.address.toLowerCase()
    progress.value = 'Reading the lock status…'
    const [statusRes, msgs, token] = await Promise.all([
      tonapi.get<Parameters<typeof readStatus>[0]>(`blockchain/accounts/${wallet}/methods/get_status`).catch((e) => {
        if ((e as { status?: number }).status && (e as { status: number }).status < 500 && !(e as { isRateLimit?: boolean }).isRateLimit) return null
        throw e
      }),
      toncenter.v3<{ messages: ToncenterMessage[] }>('messages', { opcode: '0xeed236d3', destination: wallet, limit: 50, sort: 'desc' }).then(m => m.messages, () => []),
      tokenPromise
    ])
    if (id !== runId) return
    const status = statusRes ? readStatus(statusRes) : null
    result.value = {
      owner,
      master,
      wallet,
      exists: true,
      balance: BigInt(w.balance),
      governed: governedIn(r, w.address) || status !== null,
      status,
      events: lockEvents(msgs, master),
      token: token?.basics ?? null,
      renounced: !!token?.renounced
    }
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

const info = computed(() => (result.value?.status != null ? statusInfo(result.value.status) : null))
const symbol = computed(() => result.value?.token?.symbol ?? 'tokens')
const fmt = (raw: string, bounceable: boolean) => friendly(raw, { bounceable, testnet: isTestnet.value })
const txUrl = (hash: string) => explorerUrl('tonviewer', 'tx', hash, network.value) ?? undefined

function tryExample(v: string) {
  ownerInput.value = v
  masterInput.value = USDT_MASTER
  check()
}

onMounted(() => {
  if (ownerRaw.value && masterRaw.value) check()
})
watch(network, () => {
  if (result.value) check()
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="check">
      <AddressInput v-model="ownerInput" label="Your wallet address" placeholder="UQ… / EQ… (or the jetton wallet address)" />
      <JettonPicker v-model="masterInput" label="Token (default USD₮)" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" icon="i-lucide-lock-keyhole" label="Check status" :loading="loading" :disabled="!ownerRaw || !masterRaw" />
        <template v-if="!isTestnet">
          <span class="text-sm text-muted">Try:</span>
          <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
        </template>
      </div>
    </form>

    <LoadingState v-if="loading" :label="progress" />
    <ErrorNotice :error="error" title="Could not check the wallet" @retry="check" />

    <template v-if="result && !loading">
      <section v-if="!result.exists" class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="size-5 text-info" />
          <h2 class="font-semibold text-highlighted">
            No {{ symbol }} wallet yet
          </h2>
        </div>
        <p class="mt-1 text-sm text-muted">
          This address has never received {{ symbol }}, so there is no jetton wallet to lock. It will be created at this address with the first transfer:
        </p>
        <div class="mt-2">
          <AddressLink :address="result.wallet" full />
        </div>
      </section>

      <template v-else>
        <section class="rounded-lg border p-4 sm:p-5" :class="info ? (info.color === 'success' ? 'border-success/40 bg-success/5' : info.color === 'error' ? 'border-error/40 bg-error/5' : 'border-warning/40 bg-warning/5') : 'border-default'">
          <template v-if="info">
            <div class="flex flex-wrap items-center gap-2">
              <UIcon :name="info.canSend && info.canReceive ? 'i-lucide-lock-open' : 'i-lucide-lock'" class="size-6" :class="info.color === 'success' ? 'text-success' : info.color === 'error' ? 'text-error' : 'text-warning'" />
              <h2 class="font-display text-lg font-semibold text-highlighted">
                {{ info.title }}
              </h2>
              <UBadge color="neutral" variant="outline" :label="`status ${info.status}`" />
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ info.text }}
            </p>
            <p v-if="result.renounced" class="mt-1 text-sm text-muted">
              The token's admin is renounced, so nobody can send a new lock or unlock{{ info.canSend && info.canReceive ? ': this wallet can no longer be locked.' : '. This status is now permanent.' }}
            </p>
            <div class="mt-3 flex flex-wrap gap-4 text-sm">
              <span class="flex items-center gap-1.5"><UIcon :name="info.canSend ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :class="info.canSend ? 'text-success' : 'text-error'" class="size-4" />Can send</span>
              <span class="flex items-center gap-1.5"><UIcon :name="info.canReceive ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :class="info.canReceive ? 'text-success' : 'text-error'" class="size-4" />Can receive</span>
            </div>
          </template>
          <template v-else>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shield-check" class="size-6 text-success" />
              <h2 class="font-display text-lg font-semibold text-highlighted">
                This token has no lock feature
              </h2>
            </div>
            <p class="mt-1 text-sm text-muted">
              Its jetton wallet is a standard one without get_status, so the issuer cannot freeze it. If a transfer fails, the cause is elsewhere (for example not enough {{ COIN_SYMBOL }} for fees).
            </p>
          </template>
        </section>

        <section>
          <h3 class="text-sm font-semibold text-highlighted">
            Wallet
          </h3>
          <div class="divide-y divide-default">
            <ResultField label="Owner" :value="fmt(result.owner, false)" :copy="false">
              <AddressLink :address="result.owner" :bounceable="false" />
            </ResultField>
            <ResultField :label="`${symbol} jetton wallet`" :value="fmt(result.wallet, true)" :copy="false" :hint="result.governed ? 'Its code has an issuer lock switch (get_status)' : undefined">
              <AddressLink :address="result.wallet" />
            </ResultField>
            <ResultField label="Balance" :value="result.token ? formatAmount(result.balance, result.token.decimals) : result.balance.toString()" :copy="false">
              <TokenAmount :nano="result.balance" :decimals="result.token?.decimals ?? 9" :symbol="symbol" />
            </ResultField>
          </div>
        </section>

        <section v-if="result.governed">
          <h3 class="text-sm font-semibold text-highlighted">
            Lock history
          </h3>
          <ul v-if="result.events.length" class="mt-2 space-y-2">
            <li v-for="e in result.events" :key="`${e.time}-${e.status}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span class="font-mono text-xs text-muted">{{ formatTime(e.time) }}</span>
              <UBadge :color="statusInfo(e.status).color" variant="subtle" :label="e.status === 0 ? 'Unlocked' : statusInfo(e.status).title" />
              <a v-if="e.txHash" :href="txUrl(e.txHash)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-muted hover:text-primary">transaction<UIcon name="i-lucide-arrow-up-right" class="size-3" /></a>
            </li>
          </ul>
          <p v-else class="mt-1 text-sm text-muted">
            The issuer has never changed this wallet's status.
          </p>
        </section>

        <UAlert
          v-if="info && !(info.canSend && info.canReceive)"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="What you can do"
          description="Only the token issuer can unlock the wallet. For USD₮ that is Tether: contact Tether support or the exchange that sent you the funds. Nobody else can unlock it: anyone offering to unlock it for a fee, or asking for your recovery phrase, is a scammer."
        />
      </template>
      <p class="text-xs text-dimmed">
        Reads the wallet's get_status method (status bits from the stablecoin contract: 1 = sending locked, 2 = receiving locked) and the issuer's set_status messages from toncenter.
      </p>
    </template>
  </div>
</template>
