<script setup lang="ts">
import DeployPanel from '~/lib/deployers/DeployPanel.vue'
import { splitLines } from '~/lib/deployers/codes'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { planMultisig, validateMultisig, type MultisigForm } from './logic'

const { isTestnet } = useTonNetwork()
const tc = useTonConnect()

const form = ref<MultisigForm>({ signers: '', proposers: '', threshold: '' })
const amount = ref('1')
const amountNano = ref<bigint | null>(null)
const touched = ref(false)
const MIN_BALANCE = 50_000_000n

const checked = computed(() => validateMultisig(form.value))
const signerCount = computed(() => splitLines(form.value.signers).length)
const amountError = computed(() => amountNano.value !== null && amountNano.value < MIN_BALANCE ? `At least ${formatCoin(MIN_BALANCE)}: the multisig pays for its own orders from this balance.` : undefined)
const plan = computed(() => (checked.value.config ? planMultisig(checked.value.config) : null))
const friendly = computed(() => plan.value?.address.toString({ bounceable: true, testOnly: isTestnet.value }) ?? '')
const messages = computed<TonConnectMessage[]>(() => {
  if (!plan.value || !amountNano.value || amountError.value) return []
  return [{ address: friendly.value, amount: amountNano.value, stateInit: plan.value.stateInit }]
})

// Real mainnet multisig 0:F2A2E706…4317 (6 signers, 3 must approve). Deploying it again is refused: it already exists.
function tryExample() {
  form.value = {
    signers: [
      'UQCE5mXcLJOnupbmZ6KVr2vI1m7rZJqjFVFEWuObwIrWJUfl',
      'UQCPUNEUIZAYXM7qgGgoYh2hwRc0Ksm95uHuNQQd3bJ4DAUO',
      'UQAG5XTaEGJnI0FVNKUISMkZoleUcp75JM_klMsGmQFLj89I',
      'UQDbCEiGHmDmitCYTUYkqZ7nlRebidT81a-uIXnwfIHaO8zE',
      'UQBAPxRCBRx72Z1wYA6hHlsJz9hHSoJ3Ac96OipTxf5xPC4n',
      'UQDsnepYkKZc_bUYRQGJQK2nEAdP48P98yPqDPiJEfmq97VH'
    ].join('\n'),
    proposers: '',
    threshold: '3'
  }
  touched.value = true
}

function addMe() {
  const me = tc.wallet.value?.friendly
  if (!me) return
  form.value.signers = [...splitLines(form.value.signers), me].join('\n')
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="How a multisig works"
      :description="`Funds sit in a shared contract. Any signer or proposer can create an order (a payment or a settings change); it executes once enough signers approve. This deploys the official multisig v2 contract, the same one multisig.ton.org uses, and you manage it there afterwards.${isTestnet ? '' : ' Tip: try it on testnet first (switch in the header).'}`"
    />

    <div class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Members
        </h3>
        <UButton label="Fill an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>

      <UFormField label="Signers" :error="touched ? checked.errors.signers : undefined" help="One address per line. Signers create and approve orders. The order of the list is each signer's index.">
        <UTextarea v-model="form.signers" class="w-full font-mono" :rows="4" autoresize placeholder="UQ… (one per line)" @blur="touched = true" />
      </UFormField>
      <UButton v-if="tc.wallet.value" label="Add my wallet" icon="i-lucide-user-plus" size="xs" variant="outline" color="neutral" @click="addMe" />

      <UFormField label="Proposers (optional)" :error="touched ? checked.errors.proposers : undefined" help="Addresses that can create orders but cannot approve them, e.g. a payroll bot.">
        <UTextarea v-model="form.proposers" class="w-full font-mono" :rows="2" autoresize placeholder="Leave empty if not needed" @blur="touched = true" />
      </UFormField>

      <UFormField label="Approvals needed" :error="touched ? checked.errors.threshold : undefined" :help="signerCount ? `Out of ${signerCount} signer${signerCount === 1 ? '' : 's'}. An order executes as soon as this many approve.` : 'How many signers must approve each order.'">
        <UInput v-model="form.threshold" class="w-32" inputmode="numeric" placeholder="2" @blur="touched = true" />
      </UFormField>

      <div class="max-w-sm">
        <AmountInput v-model="amount" v-model:nano="amountNano" label="Starting balance" />
        <p v-if="amountError" class="mt-1 text-xs text-error">
          {{ amountError }}
        </p>
        <p v-else class="mt-1 text-xs text-muted">
          Sent to the new multisig and stays there. multisig.ton.org uses 1 {{ COIN_SYMBOL }}.
        </p>
      </div>
    </div>

    <WalletGate purpose="deploy the multisig">
      <template #default>
        <div v-if="plan && messages.length" class="space-y-4">
          <ResultField label="Multisig address" :value="friendly" hint="Computed from the members and threshold: the same settings always give the same address." />
          <DeployPanel
            :messages="messages"
            :target="plan.address.toRawString()"
            label="Deploy multisig"
            existing-text="A multisig with exactly these members and threshold already exists at this address. Open it in the multisig viewer, or change the members to create a new one."
            confirm="I checked every signer address and the threshold. Members can only be changed later by an approved order."
          >
            <template #done>
              <ResultField label="Your multisig" :value="friendly">
                <AddressLink :address="friendly" full />
              </ResultField>
              <div class="flex flex-wrap gap-3">
                <UButton label="Open in multisig viewer" icon="i-lucide-users-round" to="/tools/multisig-viewer" />
                <UButton label="Manage on multisig.ton.org" icon="i-lucide-external-link" variant="outline" color="neutral" :to="`https://multisig.ton.org/${isTestnet ? '?testnet=true' : ''}#${friendly}`" target="_blank" />
              </div>
            </template>
          </DeployPanel>
        </div>
        <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-pencil" title="Fill in the members above" description="The multisig address and the exact transaction appear here once the form is valid." />
      </template>
    </WalletGate>
  </div>
</template>
