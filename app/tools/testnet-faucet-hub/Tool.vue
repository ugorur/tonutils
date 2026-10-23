<script setup lang="ts">
import type { MasterchainInfo, TestnetStatus } from './logic'
import { API_BASES, DOCS, EXPLORERS, FAUCETS, parseStatus, testnetForms, TONCLIENT_SNIPPET } from './logic'

const EXAMPLE = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'

const { network } = useTonNetwork()
const toTestnet = () => { network.value = 'testnet' }
// Always testnet here, whatever the header switch says.
const tc = useToncenter('testnet')
const api = useTonapi('testnet')

// ------------------------------------------------------------ status
const status = ref<TestnetStatus | null>(null)
const tonapiOk = ref<boolean | null>(null)
const statusError = ref<unknown>(null)
const statusLoading = ref(false)

async function loadStatus() {
  statusLoading.value = true
  statusError.value = null
  try {
    const [info, ta] = await Promise.all([
      tc.v3<MasterchainInfo>('masterchainInfo'),
      api.get<{ rest_online: boolean }>('status').then(r => r.rest_online, () => false)
    ])
    status.value = parseStatus(info)
    tonapiOk.value = ta
  }
  catch (e) {
    statusError.value = e
  }
  finally {
    statusLoading.value = false
  }
}
onMounted(loadStatus)

// ------------------------------------------------------------ address
const input = ref('')
const forms = computed(() => {
  if (!input.value.trim()) return null
  try {
    return testnetForms(input.value)
  }
  catch {
    return null
  }
})

interface Balance { balance: bigint, state: string }
const balance = ref<Balance | null>(null)
const balanceError = ref<unknown>(null)
const balanceLoading = ref(false)
watch(() => forms.value?.raw, () => {
  balance.value = null
  balanceError.value = null
})

async function checkBalance() {
  if (!forms.value) return
  balanceLoading.value = true
  balanceError.value = null
  try {
    const r = await tc.v2<{ balance: string, state: string }>('getAddressInformation', { address: forms.value.raw })
    balance.value = { balance: BigInt(r.balance), state: r.state }
  }
  catch (e) {
    balanceError.value = e
  }
  finally {
    balanceLoading.value = false
  }
}

const STATE_TEXT: Record<string, string> = {
  uninitialized: 'not deployed yet (normal for a fresh wallet: it deploys with its first outgoing transfer)',
  active: 'active',
  frozen: 'frozen'
}
</script>

<template>
  <div class="space-y-8">
    <!-- Status + switch -->
    <section class="space-y-3" aria-labelledby="status-h">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="status-h" class="font-display text-sm font-semibold text-highlighted">
          Testnet right now
        </h3>
        <UButton label="Refresh" icon="i-lucide-refresh-cw" size="xs" variant="ghost" color="neutral" :loading="statusLoading" @click="loadStatus" />
      </div>
      <LoadingState v-if="statusLoading && !status" label="Asking testnet toncenter and tonapi…" />
      <ErrorNotice v-else-if="statusError" :error="statusError" title="Could not read testnet status" @retry="loadStatus" />
      <dl v-if="status" class="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="testnet-status">
        <div class="rounded-lg border border-default p-3">
          <dt class="text-xs text-muted">
            Last masterchain block
          </dt>
          <dd class="mt-1 font-mono text-sm text-highlighted">
            #{{ status.seqno.toLocaleString('en-US') }}
          </dd>
        </div>
        <div class="rounded-lg border border-default p-3">
          <dt class="text-xs text-muted">
            Block age
          </dt>
          <dd class="mt-1 flex items-center gap-1.5 text-sm" :class="status.fresh ? 'text-success' : 'text-warning'">
            <span class="size-2 rounded-full" :class="status.fresh ? 'bg-success' : 'bg-warning'" />{{ status.ageSec }} s {{ status.fresh ? '· producing blocks' : '· looks stalled' }}
          </dd>
        </div>
        <div class="col-span-2 rounded-lg border border-default p-3 sm:col-span-1">
          <dt class="text-xs text-muted">
            APIs
          </dt>
          <dd class="mt-1 text-sm text-highlighted">
            toncenter ✓ · tonapi {{ tonapiOk ? '✓' : '✗' }}
          </dd>
        </div>
      </dl>
      <UAlert
        v-if="network !== 'testnet'"
        color="primary"
        variant="subtle"
        icon="i-lucide-flask-conical"
        title="TonUtils is on mainnet"
        description="Switch every tool on this site (and wallet connections) to testnet. You can switch back from the header."
        :actions="[{ label: 'Switch to testnet', color: 'primary', onClick: toTestnet }]"
      />
      <UAlert v-else color="success" variant="subtle" icon="i-lucide-flask-conical" title="TonUtils is on testnet" description="Tools read testnet and ask your wallet for testnet transactions. Use the header switch to go back to mainnet." />
    </section>

    <!-- Address -->
    <section class="space-y-3" aria-labelledby="addr-h">
      <h3 id="addr-h" class="font-display text-sm font-semibold text-highlighted">
        1. Your address in testnet form
      </h3>
      <p class="text-sm text-muted">
        The same key controls the same address on both networks; only the flag in the user-friendly form differs. Faucets and testnet wallets expect the testnet form (<span class="font-mono">0Q…</span> for wallets).
      </p>
      <AddressInput v-model="input" label="Wallet address (mainnet or testnet form)" placeholder="UQ…, EQ…, 0Q… or 0:<hex>" />
      <UButton v-if="!input" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = EXAMPLE" />

      <template v-if="forms">
        <KeyValue
          data-testid="testnet-forms"
          :items="[
            { label: 'Testnet, non-bounceable: paste this into a faucet', value: forms.nonBounceable, hint: 'Wallet apps in testnet mode show this form.' },
            { label: 'Testnet, bounceable (contracts)', value: forms.bounceable },
            { label: 'Raw', value: forms.raw, hint: 'Same on both networks.' },
            { label: 'Mainnet, non-bounceable', value: forms.mainnetNonBounceable, hint: 'Never send real coins to a testnet-form address: wallets refuse it on mainnet.' }
          ]"
        />
        <div class="flex flex-wrap items-center gap-3">
          <UButton label="Check testnet balance" icon="i-lucide-coins" size="sm" variant="outline" :loading="balanceLoading" data-testid="check-balance" @click="checkBalance" />
          <ExplorerLinks :value="forms.nonBounceable" network="testnet" />
        </div>
        <ErrorNotice v-if="balanceError" :error="balanceError" @retry="checkBalance" />
        <div v-if="balance" class="rounded-lg border border-default p-4 text-sm" data-testid="testnet-balance">
          <p class="text-xs text-muted">
            Testnet balance
          </p>
          <p class="mt-0.5 font-display text-lg font-semibold text-highlighted">
            <TokenAmount :nano="balance.balance" /> <span class="text-sm font-normal text-muted">(test {{ COIN_SYMBOL }}, no value)</span>
          </p>
          <p class="mt-1 text-muted">
            Account {{ STATE_TEXT[balance.state] ?? balance.state }}.
          </p>
        </div>
      </template>
    </section>

    <!-- Faucets -->
    <section class="space-y-3" aria-labelledby="faucet-h">
      <h3 id="faucet-h" class="font-display text-sm font-semibold text-highlighted">
        2. Get free test {{ COIN_SYMBOL }}
      </h3>
      <ul class="grid gap-3 sm:grid-cols-2" data-testid="faucets">
        <li v-for="f in FAUCETS" :key="f.url">
          <a :href="f.url" target="_blank" rel="noopener" class="flex h-full flex-col gap-1 rounded-lg border border-default p-4 transition hover:border-primary">
            <span class="flex items-center gap-1.5 font-medium text-highlighted">{{ f.name }}<UIcon name="i-lucide-arrow-up-right" class="size-3.5 text-muted" /></span>
            <span class="text-sm text-muted">{{ f.detail }}</span>
          </a>
        </li>
      </ul>
      <p class="text-xs text-dimmed">
        Test {{ COIN_SYMBOL }} has no value and cannot be sold. Anyone selling testnet coins or asking for your seed phrase to "send test coins" is a scammer.
      </p>
    </section>

    <!-- Explorers + docs -->
    <section class="space-y-3" aria-labelledby="explore-h">
      <h3 id="explore-h" class="font-display text-sm font-semibold text-highlighted">
        3. Explorers and docs
      </h3>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="l in [...EXPLORERS, ...DOCS]" :key="l.url">
          <a :href="l.url" target="_blank" rel="noopener" class="flex h-full flex-col gap-1 rounded-lg border border-default p-4 transition hover:border-primary">
            <span class="flex items-center gap-1.5 font-medium text-highlighted">{{ l.name }}<UIcon name="i-lucide-arrow-up-right" class="size-3.5 text-muted" /></span>
            <span class="text-sm text-muted">{{ l.detail }}</span>
          </a>
        </li>
      </ul>
    </section>

    <!-- APIs -->
    <section class="space-y-3" aria-labelledby="api-h">
      <h3 id="api-h" class="font-display text-sm font-semibold text-highlighted">
        4. Testnet API endpoints
      </h3>
      <div class="divide-y divide-default">
        <ResultField v-for="a in API_BASES" :key="a.url" :label="a.name" :value="a.url" :hint="a.note" />
      </div>
      <div class="overflow-hidden rounded-md border border-default bg-muted">
        <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
          <span class="text-xs text-muted">TonClient on testnet</span>
          <CopyButton :value="TONCLIENT_SNIPPET" size="xs" />
        </div>
        <pre class="overflow-auto p-3 font-mono text-xs leading-relaxed text-default">{{ TONCLIENT_SNIPPET }}</pre>
      </div>
    </section>
  </div>
</template>
