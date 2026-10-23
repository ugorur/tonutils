<script setup lang="ts">
import { Address, beginCell } from '@ton/core'
import type { TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import { runGet, stackCell } from '~/lib/jettons-dev/chain'
import { HMSTR_CLAIM } from '~/lib/jettons-dev/fixtures'
import { TonApiError } from '~/utils/api-client'
import { formatJettonAmount } from '~/utils/ton/jetton'
import type { ClaimCheck, TonapiTransferPayload } from './logic'
import { CLAIM_ATTACH_NANO, checkClaim, claimMessage, customPayloadOf, MINTLESS_JETTONS } from './logic'

const ta = useTonapi()
const tc = useToncenter()
const ton = useTonConnect()
const { isTestnet } = useTonNetwork()

// ---------------------------------------------------------------- inputs
const preset = ref<string>(MINTLESS_JETTONS[0].master)
const customMaster = ref('')
const customParsed = shallowRef<Address | null>(null)
const owner = ref('')
const ownerParsed = shallowRef<Address | null>(null)
const manual = ref(false)
const manualPayload = ref('')
const manualInit = ref('')

const presetItems = [...MINTLESS_JETTONS.map(j => ({ label: `${j.symbol} · ${j.name}`, value: j.master })), { label: 'Other jetton…', value: 'other' }]
const masterAddr = computed<Address | null>(() => {
  if (preset.value !== 'other') return Address.parse(preset.value)
  return customParsed.value
})

// Prefill the owner from the connected wallet.
watch(() => ton.wallet.value?.friendly, (f) => {
  if (f && !owner.value) owner.value = f
}, { immediate: true })

// ---------------------------------------------------------------- check
interface Result {
  check: ClaimCheck
  deployed: boolean
  claimed: boolean | null
  symbol: string
  decimals: number
}
const loading = ref(false)
const step = ref('')
const error = ref<unknown>(null)
const notEligible = ref(false)
const issuerDown = ref<string | null>(null)
const result = shallowRef<Result | null>(null)

async function check(refresh = false) {
  const master = masterAddr.value
  const who = ownerParsed.value
  if (!master || !who) return
  loading.value = true
  error.value = null
  notEligible.value = false
  issuerDown.value = null
  result.value = null
  if (!refresh) sent.value = null
  try {
    let data: TonapiTransferPayload
    if (manual.value) {
      data = { custom_payload: manualPayload.value.trim(), state_init: manualInit.value.trim() }
    }
    else {
      step.value = 'Asking the issuer\'s claim server (through tonapi)…'
      try {
        data = await ta.get<TonapiTransferPayload>(`jettons/${master.toRawString()}/transfer/${who.toRawString()}/payload`)
      }
      catch (e) {
        if (e instanceof TonApiError && e.status === 404) {
          notEligible.value = true
          return
        }
        if (e instanceof TonApiError && e.status >= 500) {
          const msg = (e.body as { error?: string } | undefined)?.error ?? e.message
          issuerDown.value = /returned (\d{3})/.exec(msg)?.[1] ? `The issuer's claim server answered HTTP ${/returned (\d{3})/.exec(msg)![1]}.` : msg
          return
        }
        throw e
      }
    }
    if (!data.custom_payload || !data.state_init) {
      notEligible.value = true
      return
    }

    step.value = 'Reading the jetton\'s Merkle root…'
    let minterRoot: string | null = null
    try {
      const st = await runGet(tc.baseUrl(), master, 'get_mintless_airdrop_hashmap_root')
      minterRoot = BigInt(String(st[0]!.value)).toString(16).padStart(64, '0')
    }
    catch { /* not a mintless minter, or the method is named differently: the wallet check below still applies */ }
    // The minter's own answer for this owner's jetton wallet, so a forged state_init cannot redirect the claim.
    let minterWallet: Address | null = null
    try {
      const st = await runGet(tc.baseUrl(), master, 'get_wallet_address', [{ type: 'slice', value: beginCell().storeAddress(who).endCell().toBoc().toString('base64') }])
      minterWallet = stackCell(st[0]).beginParse().loadAddress()
    }
    catch (e) {
      if (e instanceof TonApiError) throw e // rate limit / network: retry instead of reporting bad claim data
      // exit code: not a jetton minter. minterWallet stays null and checkClaim blocks the claim.
    }

    const c = checkClaim({ customPayload: data.custom_payload, stateInit: data.state_init, owner: who, master, minterRoot, minterWallet })

    step.value = 'Checking your jetton wallet…'
    const acc = await ta.get<{ status?: string }>(`accounts/${c.wallet.address.toRawString()}`).catch((e) => {
      if (e instanceof TonApiError && e.status === 404) return { status: 'nonexist' }
      throw e
    })
    const deployed = acc.status === 'active'
    let claimed: boolean | null = deployed ? null : false
    if (deployed) {
      try {
        claimed = BigInt(String((await runGet(tc.baseUrl(), c.wallet.address, 'is_claimed'))[0]!.value)) !== 0n
      }
      catch { /* unknown */ }
    }

    step.value = 'Reading the jetton…'
    const preset = MINTLESS_JETTONS.find(j => Address.parse(j.master).equals(master))
    let symbol: string = preset?.symbol ?? 'tokens'
    let decimals: number = preset?.decimals ?? 9
    if (!preset) {
      const j = await ta.get<{ metadata?: { symbol?: string, decimals?: string } }>(`jettons/${master.toRawString()}`).catch(() => null)
      symbol = j?.metadata?.symbol ?? symbol
      decimals = Number(j?.metadata?.decimals ?? 9)
    }
    result.value = { check: c, deployed, claimed, symbol, decimals }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
    step.value = ''
  }
}

function loadPastClaim() {
  preset.value = MINTLESS_JETTONS[0].master
  manual.value = true
  owner.value = Address.parse(HMSTR_CLAIM.owner).toString({ bounceable: false })
  manualPayload.value = customPayloadOf(HMSTR_CLAIM.body).toBoc().toString('base64')
  manualInit.value = HMSTR_CLAIM.stateInit
  nextTick(() => check())
}

// ---------------------------------------------------------------- claim
const status = computed(() => {
  const r = result.value
  if (!r) return null
  if (r.check.problems.length) return { color: 'error' as const, title: 'The claim data does not check out', can: false }
  if (r.claimed) return { color: 'neutral' as const, title: 'Already claimed', can: false }
  if (r.check.window === 'expired') return { color: 'warning' as const, title: 'The claim window has ended', can: false }
  if (r.check.window === 'not-started') return { color: 'info' as const, title: 'Claiming has not started yet', can: false }
  return { color: 'success' as const, title: 'You can claim this airdrop', can: true }
})

const messages = computed<TonConnectMessage[]>(() => {
  const r = result.value
  if (!r || !ownerParsed.value || !status.value?.can) return []
  return [claimMessage(r.check, ownerParsed.value, { deployed: r.deployed, testOnly: isTestnet.value })]
})
const walletMatches = computed(() => !!ton.wallet.value && !!ownerParsed.value && Address.parse(ton.wallet.value.address).equals(ownerParsed.value))

const sending = ref(false)
const sendError = ref<unknown>(null)
const sent = shallowRef<{ hash: string, trace: TonTrace | null } | null>(null)
async function claim() {
  if (!messages.value.length || !walletMatches.value) return
  sending.value = true
  sendError.value = null
  sent.value = null
  try {
    const r = await ton.sendTransaction({ messages: messages.value })
    sent.value = { hash: r.hash, trace: null }
    sent.value = { hash: r.hash, trace: await ton.waitForTransaction(r.hash) }
    await check(true)
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = false
  }
}

const fmtDate = (unix: number) => new Date(unix * 1000).toLocaleString()
</script>

<template>
  <div class="space-y-8">
    <form class="space-y-4" @submit.prevent="check()">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Airdrop">
          <USelect v-model="preset" :items="presetItems" class="w-full" />
        </UFormField>
        <AddressInput v-if="preset === 'other'" v-model="customMaster" label="Jetton master address" @parsed="customParsed = $event" />
      </div>
      <AddressInput v-model="owner" label="Your wallet address" placeholder="UQ… (filled in when your wallet is connected)" @parsed="ownerParsed = $event" />

      <UCheckbox v-model="manual" label="I already have the claim data (custom_payload and state_init from the project)" />
      <div v-if="manual" class="grid gap-4 sm:grid-cols-2">
        <UFormField label="custom_payload (BOC)">
          <UTextarea v-model="manualPayload" :rows="3" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
        </UFormField>
        <UFormField label="state_init (BOC)">
          <UTextarea v-model="manualInit" :rows="3" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
        </UFormField>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Check eligibility" icon="i-lucide-search-check" size="lg" :loading="loading" :disabled="!masterAddr || !ownerParsed || (manual && (!manualPayload.trim() || !manualInit.trim()))" />
        <UButton label="Load a real past HMSTR claim" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" :disabled="isTestnet" @click="loadPastClaim" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="step" />
    <ErrorNotice :error="error" @retry="check()" />
    <UAlert
      v-if="notEligible"
      color="neutral"
      variant="subtle"
      icon="i-lucide-search-x"
      title="No airdrop for this address"
      description="The claim server has no entry for it, or this jetton is not a mintless airdrop. Check that you entered the wallet that was eligible."
    />
    <UAlert
      v-if="issuerDown"
      color="warning"
      variant="subtle"
      icon="i-lucide-server-off"
      title="The project's claim server is not answering"
      :description="`${issuerDown} Eligibility comes from the project's own server; try again later, or paste the claim data if the project gives it to you.`"
    />

    <section v-if="result && status" class="space-y-4" aria-live="polite">
      <UAlert :color="status.color" variant="subtle" :icon="status.can ? 'i-lucide-gift' : 'i-lucide-info'" :title="status.title">
        <template v-if="result.check.problems.length" #description>
          <ul class="mt-1 list-disc pl-4">
            <li v-for="p in result.check.problems" :key="p">
              {{ p }}
            </li>
          </ul>
        </template>
      </UAlert>
      <KeyValue
        :items="[
          { label: 'Airdrop amount', value: `${formatJettonAmount(result.check.item.amount, result.decimals)} ${result.symbol}`, mono: false },
          { label: 'Claim window', value: `${fmtDate(result.check.item.startFrom)} → ${fmtDate(result.check.item.expireAt)}`, mono: false, copy: false },
          { label: 'Your jetton wallet', value: result.check.wallet.address.toString({ testOnly: isTestnet }), hint: result.deployed ? 'Deployed' : 'Not deployed yet: the claim deploys it' },
          { label: 'Merkle root', value: result.check.wallet.merkleRoot, hint: 'The proof was verified locally against this root.' }
        ]"
      />
      <ExplorerLinks :value="result.check.wallet.address.toString()" />

      <WalletGate v-if="status.can" purpose="claim your airdrop">
        <div class="space-y-4">
          <UAlert
            v-if="!walletMatches"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="This is not the eligible wallet"
            description="Only the address the airdrop was made for can claim it. Connect that wallet, or check its own address above."
          />
          <template v-else>
            <TxPreview :messages="messages" />
            <p class="text-sm text-muted">
              The claim is a transfer of 0 {{ result.symbol }} to yourself that carries your proof; your jetton wallet mints the airdrop to itself.
              It attaches <TokenAmount :nano="CLAIM_ATTACH_NANO" /> for fees; the unused part comes back to you.
            </p>
            <UButton label="Claim airdrop" icon="i-lucide-gift" size="lg" :loading="sending" @click="claim" />
          </template>
          <ErrorNotice :error="sendError" :title="sent ? 'Sent, but not confirmed yet' : 'Not sent'" />
        </div>
      </WalletGate>
    </section>

    <div v-if="sent" class="space-y-2 rounded-lg border border-success/40 p-4 text-sm" aria-live="polite">
      <p v-if="!sent.trace" class="text-muted">
        Sent. Waiting for the network to process it…
      </p>
      <template v-else>
        <p class="font-medium text-success">
          Processed. The status above is refreshed.
        </p>
        <ExplorerLinks kind="tx" :value="sent.trace.external_hash" />
      </template>
    </div>

    <p class="text-xs text-dimmed">
      Mintless airdrops (TEP-177) keep the airdrop list off chain. The project's claim server gives each eligible address a Merkle proof;
      this page checks it against the jetton's on-chain root before you sign anything. You never need to share a recovery phrase to claim.
    </p>
  </div>
</template>
