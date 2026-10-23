<script setup lang="ts">
import { Address } from '@ton/core'
import MetadataFields from '~/lib/token-launch/MetadataFields.vue'
import { FEES, planDeploy } from '~/lib/token-launch/jetton-minter'
import { formatJettonAmount } from '~/utils/ton/jetton'
import { deployMessages, validateForm, type DeployForm } from './logic'

const { network, isTestnet } = useTonNetwork()
const tc = useTonConnect()
const toncenter = useToncenter()

const blank = (): DeployForm => ({ name: '', symbol: '', decimals: '9', description: '', image: '', mode: 'onchain', uri: '', supply: '' })
const form = ref<DeployForm>(blank())
const fields = ref<InstanceType<typeof MetadataFields>>()
const supplyTouched = ref(false)
const renounce = ref(false)
const confirmed = ref(false)

const checked = computed(() => validateForm(form.value))
const ok = computed(() => !Object.keys(checked.value.errors).length)

function tryExample() {
  form.value = { ...blank(), name: 'TonUtils Example Token', symbol: 'TUEX', description: 'A test token created with the TonUtils jetton deployer.', supply: '1000000' }
}

// The connected wallet is the admin and receives the initial supply.
const planned = computed(() => {
  const c = checked.value
  const w = tc.wallet.value
  if (!w || !c.content || c.mintAmount === undefined) return null
  return planDeploy({ owner: Address.parse(w.address), content: c.content, mintAmount: c.mintAmount })
})
const messages = computed(() => (planned.value ? deployMessages(planned.value, renounce.value, isTestnet.value) : []))
const total = computed(() => FEES.v2.deploy + (renounce.value ? FEES.v2.admin : 0n))

type Phase = 'idle' | 'checking' | 'signing' | 'waiting' | 'done'
const phase = ref<Phase>('idle')
const error = ref<unknown>(null)
const existing = ref<string | null>(null)
const result = ref<{ minter: string, hash: string, active: boolean } | null>(null)

async function minterStatus(raw: string): Promise<string> {
  const r = await toncenter.v3<{ accounts: { status: string }[] }>('accountStates', { address: raw, include_boc: false })
  return r.accounts[0]?.status ?? 'nonexist'
}

async function deploy() {
  fields.value?.touchAll()
  supplyTouched.value = true
  const p = planned.value
  if (!p || !confirmed.value) return
  error.value = null
  existing.value = null
  const friendly = p.address.toString({ testOnly: isTestnet.value })
  try {
    phase.value = 'checking'
    // Same admin + same metadata = same address: deploying twice would only waste the fee.
    if (await minterStatus(p.address.toRawString()) === 'active') {
      existing.value = friendly
      phase.value = 'idle'
      return
    }
    phase.value = 'signing'
    const sent = await tc.sendTransaction({ messages: messages.value })
    phase.value = 'waiting'
    const trace = await tc.waitForTransaction(sent.hash)
    const active = await minterStatus(p.address.toRawString()) === 'active'
    result.value = { minter: friendly, hash: trace.external_hash, active }
    phase.value = 'done'
  }
  catch (e) {
    error.value = e
    phase.value = 'idle'
  }
}

function again() {
  result.value = null
  confirmed.value = false
  phase.value = 'idle'
}

watch(network, again)
// Any edit after ticking means the user has not checked the new values.
watch([form, renounce], () => (confirmed.value = false), { deep: true })
</script>

<template>
  <div class="space-y-6">
    <template v-if="phase !== 'done'">
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="What you get"
        :description="`A standard Jetton 2.1 token (TEP-74/89, the contract minter.ton.org deploys) with you as admin. The initial supply lands in your wallet. Cost: ${formatCoin(total)} attached plus a small network fee; unused GRAM stays on the token contract for its storage.${isTestnet ? '' : ' Tip: try it on testnet first (switch in the header).'}`"
      />

      <div class="space-y-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Token details
          </h3>
          <UButton label="Fill an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
        </div>
        <MetadataFields ref="fields" v-model="form" :errors="checked.errors" />
        <UFormField label="Initial supply" :error="supplyTouched ? checked.errors.supply : undefined" :help="`Whole tokens, minted to your wallet now. ${checked.mintAmount ? `= ${checked.mintAmount.toLocaleString('en-US')} base units (decimals ${checked.decimals}).` : ''}`">
          <UInput v-model="form.supply" class="w-full max-w-sm" inputmode="decimal" placeholder="1000000" @blur="supplyTouched = true">
            <template #trailing>
              <span class="text-xs text-muted">{{ form.symbol || 'tokens' }}</span>
            </template>
          </UInput>
        </UFormField>

        <div class="rounded-lg border border-default p-4">
          <UCheckbox v-model="renounce" label="Renounce admin right after minting (fixed supply)">
            <template #description>
              Nobody, including you, can ever mint more or change the name, logo or metadata. Buyers often look for this. If unsure, leave it off: you can renounce later in the
              <NuxtLink to="/tools/jetton-admin-panel" class="text-primary underline-offset-2 hover:underline">jetton admin panel</NuxtLink>.
            </template>
          </UCheckbox>
        </div>
      </div>

      <WalletGate purpose="deploy your token">
        <template #default>
          <div class="space-y-4">
            <template v-if="ok && planned">
              <ResultField label="Your token's address (jetton master)" :value="planned.address.toString({ testOnly: isTestnet })" hint="Computed from your wallet and the metadata. This is the address you share and list." />
              <TxPreview :messages="messages" />
              <p class="text-xs text-muted">
                Message 1 deploys the token contract and mints {{ formatJettonAmount(checked.mintAmount!, checked.decimals, { symbol: form.symbol || undefined }) }} to you.
                <template v-if="renounce">
                  Message 2 is drop_admin (op 0x7431f221 of the Jetton 2.1 contract) and removes the admin. Both go out in one transaction, in this order.
                </template>
              </p>
              <UCheckbox v-model="confirmed" :label="`I checked the name, symbol, decimals and supply. A deployed token cannot be edited${renounce ? '' : ' (except by the admin)'} or deleted.`" />
            </template>
            <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-pencil" title="Fill in the token details above" description="The exact transaction appears here once the form is valid." />

            <UAlert
              v-if="existing"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="You already deployed this exact token"
              :description="`${existing} is live with the same admin and metadata. Manage it in the admin panel, or change the details to create a new token.`"
              :actions="[{ label: 'Open admin panel', to: `/tools/jetton-admin-panel?q=${existing}`, color: 'warning', variant: 'outline' }]"
            />
            <ErrorNotice :error="error" title="Deploy failed" @retry="deploy" />

            <div class="flex flex-wrap items-center gap-3">
              <UButton
                :label="phase === 'checking' ? 'Checking…' : phase === 'signing' ? 'Confirm in your wallet…' : phase === 'waiting' ? 'Waiting for the network…' : `Deploy token (${formatCoin(total)})`"
                icon="i-lucide-rocket"
                :loading="phase !== 'idle'"
                :disabled="!ok || !confirmed"
                @click="deploy"
              />
              <span v-if="phase === 'waiting'" class="text-xs text-muted">Usually 5 to 15 seconds.</span>
            </div>
          </div>
        </template>
      </WalletGate>
    </template>

    <div v-else-if="result" class="space-y-4">
      <UAlert
        :color="result.active ? 'success' : 'warning'"
        variant="subtle"
        :icon="result.active ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
        :title="result.active ? 'Your token is live' : 'Transaction sent, but the token contract is not active yet'"
        :description="result.active ? 'It can take a minute for wallets and explorers to show the name and logo.' : 'Check the transaction in an explorer. If the deploy failed, the attached GRAM bounced back to your wallet.'"
      />
      <ResultField label="Jetton master address" :value="result.minter">
        <AddressLink :address="result.minter" full />
      </ResultField>
      <div class="flex flex-wrap items-center gap-3">
        <UButton label="Manage in admin panel" icon="i-lucide-crown" :to="`/tools/jetton-admin-panel?q=${result.minter}`" />
        <UButton label="Create another token" icon="i-lucide-plus" variant="outline" color="neutral" @click="again" />
      </div>
      <div class="text-xs text-muted">
        Transaction: <ExplorerLinks kind="tx" :value="result.hash" />
      </div>
    </div>
  </div>
</template>
