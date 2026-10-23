<script setup lang="ts">
import { Address } from '@ton/core'
import RiskList from '~/lib/security/RiskList.vue'
import { type Check, counterparties, fetchEvents, type Label, loadLabels, senderProfile, sortChecks, worst } from '~/lib/security/core'
import type { Purpose, TonapiAccount } from '~/lib/wallet-actions/core'
import { compareWithHistory, EXAMPLES, parseRecipient, preflight, recommendedForm } from './logic'

const tonapi = useTonapi()
const tc = useTonConnect()
const { network, isTestnet } = useTonNetwork()

const dest = ref('')
const mine = ref('')
const myAddr = shallowRef<Address | null>(null)
const purpose = ref<Purpose>('coin')
const purposes = [
  { label: COIN_SYMBOL, value: 'coin' },
  { label: 'Tokens', value: 'jetton' },
  { label: 'NFT', value: 'nft' }
]
watch(() => tc.wallet.value, (w) => {
  if (w && !tc.networkMismatch.value && !mine.value) mine.value = w.friendly
}, { immediate: true })

const parsed = computed(() => parseRecipient(dest.value))

interface Result { checks: Check[], form: { address: string, bounceable: boolean }, raw: string, domain: string | null }
const result = shallowRef<Result | null>(null)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
let session = 0

async function check() {
  const p = parsed.value
  if (p.kind !== 'address' && p.kind !== 'domain') return
  const my = ++session
  loading.value = true
  error.value = null
  result.value = null
  try {
    let address: Address
    let typedBounceable: boolean | null = null
    let typedTestOnly: boolean | null = null
    if (p.kind === 'domain') {
      stage.value = `Resolving ${p.domain}…`
      const r = await tonapi.get<{ wallet?: { address?: string } }>(`dns/${encodeURIComponent(p.domain)}/resolve`).catch((e: { status?: number }) => {
        if (e.status === 404) return null
        throw e
      })
      if (!r?.wallet?.address) throw new Error(`${p.domain} does not point to a wallet (not registered, expired, or no wallet record).`)
      address = Address.parse(r.wallet.address)
    }
    else {
      address = p.address
      typedBounceable = p.bounceable
      typedTestOnly = p.testOnly
    }
    const raw = address.toRawString().toLowerCase()
    stage.value = 'Reading the account (tonapi)…'
    // ton-assets names are mainnet addresses: they mean nothing on testnet.
    const labelsP = isTestnet.value ? Promise.resolve(new Map<string, Label>()) : loadLabels()
    const account = await tonapi.get<TonapiAccount>(`accounts/${raw}`)
    stage.value = 'Checking what this address sends…'
    const destEvents = await fetchEvents(tonapi.get, raw, 25)
    let history = null
    if (myAddr.value && !myAddr.value.equals(address)) {
      stage.value = 'Comparing with your history…'
      const meRaw = myAddr.value.toRawString().toLowerCase()
      const mineEvents = await fetchEvents(tonapi.get, meRaw, 100)
      history = compareWithHistory(address, counterparties(mineEvents.events, meRaw), isTestnet.value)
    }
    const label = (await labelsP).get(raw)
    if (my !== session) return
    const input = {
      address, typedBounceable, typedTestOnly, account, label, history,
      domain: p.kind === 'domain' ? p.domain : null,
      testnet: isTestnet.value,
      purpose: purpose.value,
      profile: senderProfile(destEvents.events, raw)
    }
    result.value = { checks: sortChecks(preflight(input)), form: recommendedForm(input), raw, domain: input.domain }
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example(v: string) {
  dest.value = v
  nextTick(check)
}
watch([network, purpose], () => {
  result.value = null
})

const level = computed(() => (result.value ? worst(result.value.checks) : null))
const VERDICT = {
  danger: { color: 'error', icon: 'i-lucide-octagon-x', title: 'Do not send', text: 'At least one serious problem below. Sending could lose your funds.' },
  warn: { color: 'warning', icon: 'i-lucide-triangle-alert', title: 'Check before sending', text: 'Nothing proves this is a scam, but read the warnings below first.' },
  info: { color: 'success', icon: 'i-lucide-circle-check', title: 'No red flags found', text: 'Still compare the whole address with what the recipient gave you: no tool can know who you meant to pay.' },
  ok: { color: 'success', icon: 'i-lucide-circle-check', title: 'No red flags found', text: 'Still compare the whole address with what the recipient gave you: no tool can know who you meant to pay.' }
} as const
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="check">
      <UFormField label="Destination" :error="parsed.kind === 'invalid' ? parsed.error : undefined" help="Address (UQ…, EQ…, 0:…) or a name like foundation.ton or alice.t.me">
        <UInput
          v-model="dest"
          placeholder="Paste the address you are about to send to"
          class="w-full"
          size="lg"
          :ui="{ base: 'font-mono text-sm' }"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <UFormField label="What are you sending?">
        <UTabs v-model="purpose" :items="purposes" :content="false" size="sm" class="w-full max-w-xs" />
      </UFormField>
      <AddressInput v-model="mine" label="Your wallet (optional)" placeholder="Compare with your own history to catch look-alikes" @parsed="myAddr = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton type="submit" label="Check address" icon="i-lucide-shield-question" :loading="loading" :disabled="parsed.kind !== 'address' && parsed.kind !== 'domain'" />
        <span class="text-xs text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.value" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not check this address" @retry="check" />

    <template v-if="result && level && !loading">
      <UAlert :color="VERDICT[level].color" variant="subtle" :icon="VERDICT[level].icon" :title="VERDICT[level].title" :description="VERDICT[level].text" data-testid="verdict" />

      <div v-if="level !== 'danger'" class="rounded-lg border border-default px-4" data-testid="send-form">
        <ResultField
          :label="result.form.bounceable ? `Send to (bounceable form, ${isTestnet ? 'kQ' : 'EQ'}…)` : `Send to (non-bounceable form, ${isTestnet ? '0Q' : 'UQ'}…)`"
          :value="result.form.address"
          :hint="result.domain ? `${result.domain} resolves to this address` : 'Same account as what you typed, in the safest form for this send'"
        />
        <ExplorerLinks :value="result.form.address" class="pb-3" />
      </div>

      <RiskList title="Checks" :checks="result.checks" />
    </template>

    <p class="text-xs text-muted">
      Uses tonapi (scam flags, names, memo requirement, recent activity) and Tonkeeper's public ton-assets list. Nothing is sent or signed.
    </p>
  </div>
</template>
