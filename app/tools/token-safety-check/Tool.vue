<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonapiJetton } from '~/lib/jettons-read/core'
import RiskList from '~/lib/security/RiskList.vue'
import { type Check, sortChecks } from '~/lib/security/core'
import { type DexPairs, EXAMPLES, type Holders, type Risk, riskOf, supplyLabel, type TcMasters, tokenChecks } from './logic'

const tonapi = useTonapi()
const ton = useToncenter()
const { network, isTestnet } = useTonNetwork()

const text = ref('')
const addr = shallowRef<Address | null>(null)

interface Result { jetton: TonapiJetton, address: string, checks: Check[], risk: Risk }
const result = shallowRef<Result | null>(null)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
let session = 0

const orNull = <T,>(p: Promise<T>) => p.catch(() => null)
const notFound = (e: { status?: number }) => {
  if (e.status === 404) return null
  throw e
}

async function check() {
  if (!addr.value) return
  const my = ++session
  loading.value = true
  error.value = null
  result.value = null
  try {
    let raw = addr.value.toRawString().toLowerCase()
    stage.value = 'Reading the token (tonapi)…'
    let jetton = await tonapi.get<TonapiJetton>(`jettons/${raw}`).catch(notFound)
    if (!jetton) {
      // Maybe a jetton wallet (someone's balance contract): find its token.
      const wd = await tonapi.get<{ decoded?: { jetton?: string } }>(`blockchain/accounts/${raw}/methods/get_wallet_data`).catch(() => null)
      if (wd?.decoded?.jetton) {
        raw = wd.decoded.jetton.toLowerCase()
        jetton = await tonapi.get<TonapiJetton>(`jettons/${raw}`).catch(notFound)
      }
    }
    if (!jetton) throw new Error('This address is not a token (jetton master) or a jetton wallet. Paste the token\'s master address, e.g. from its Tonviewer page.')
    stage.value = 'Reading holders, contract and DEX pools…'
    const friendly = Address.parse(raw).toString({ bounceable: true, testOnly: isTestnet.value, urlSafe: true })
    const [holders, master, dex] = await Promise.all([
      orNull(tonapi.get<Holders>(`jettons/${raw}/holders`, { limit: 20 })),
      orNull(ton.v3<TcMasters>('jetton/masters', { address: raw })),
      // DexScreener indexes mainnet only.
      isTestnet.value ? Promise.resolve(null) : orNull(fetch(`https://api.dexscreener.com/latest/dex/tokens/${friendly}`).then(r => (r.ok ? r.json() as Promise<DexPairs> : null)))
    ])
    if (my !== session) return
    const checks = sortChecks(tokenChecks({ jetton, holders, master, dex }))
    result.value = { jetton, address: friendly, checks, risk: riskOf(checks) }
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example(v: string) {
  text.value = v
  nextTick(check)
}
watch(network, () => {
  result.value = null
})

const RISK = {
  high: { color: 'error', icon: 'i-lucide-octagon-x', title: 'High risk', text: 'Serious red flags below. Buying or interacting with this token is likely to lose you money.' },
  medium: { color: 'warning', icon: 'i-lucide-triangle-alert', title: 'Medium risk', text: 'Several warning signs. Read them before buying.' },
  low: { color: 'success', icon: 'i-lucide-circle-check', title: 'Low risk signals', text: 'No major red flags in public data. Price risk is still yours: this is not investment advice.' }
} as const
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="check">
      <AddressInput v-model="text" label="Token address" placeholder="Jetton master address (EQ…), or a jetton wallet" @parsed="addr = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton type="submit" label="Check token" icon="i-lucide-search-check" :loading="loading" :disabled="!addr" />
        <span class="text-xs text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.value" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not check this token" @retry="check" />

    <template v-if="result && !loading">
      <UAlert :color="RISK[result.risk].color" variant="subtle" :icon="RISK[result.risk].icon" :title="RISK[result.risk].title" :description="RISK[result.risk].text" data-testid="verdict" />

      <div class="rounded-lg border border-default p-4">
        <div class="font-display text-base font-semibold text-highlighted">
          {{ result.jetton.metadata.name || 'Unnamed token' }}
          <span class="font-sans text-sm font-normal text-muted">{{ result.jetton.metadata.symbol }}</span>
        </div>
        <div class="mt-1 text-xs text-muted">
          Supply {{ supplyLabel(result.jetton) }} · {{ result.jetton.holders_count.toLocaleString('en-US') }} holders
        </div>
        <div class="mt-2 flex items-start gap-1">
          <span class="font-mono text-sm break-all text-highlighted">{{ result.address }}</span>
          <CopyButton :value="result.address" size="xs" />
        </div>
        <ExplorerLinks :value="result.address" kind="jetton" class="mt-1" />
      </div>

      <RiskList title="Checks" :checks="result.checks" />
    </template>

    <p class="text-xs text-muted">
      Sources: tonapi (verification, admin, holders), toncenter (wallet code, metadata location), DexScreener (pools on STON.fi, DeDust and others). Heuristics, not an audit.
    </p>
  </div>
</template>
