<script setup lang="ts">
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { DeriveResult, PathSpec } from './logic'
import WalletList from '~/lib/wallet-derivation/WalletList.vue'
import { deriveWallets } from '~/lib/wallet-derivation/wallets'
import { deriveBip39, formatPath, ledgerPath, parsePath, TRUST_WALLET_PATH } from './logic'

// Public test vector from Trust Wallet Core's TON tests. Never send real funds to it.
const EXAMPLE = 'stuff diamond cycle federal scan spread pigeon people engage teach snack grain'

const { network } = useTonNetwork()
const phrase = ref('')
const passphrase = ref('')
const usePassphrase = ref(false)
const hidden = ref(false)
const net = ref<TonNetwork>(network.value)
const useTrust = ref(true)
const ledgerAccounts = ref(2)
const customPath = ref('')
const busy = ref(false)
const result = ref<DeriveResult | null>(null)
const revealed = ref<Set<string>>(new Set())

watch(network, (n) => {
  net.value = n
})

const custom = computed(() => {
  if (!customPath.value.trim()) return null
  try {
    return { ok: true as const, path: parsePath(customPath.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const paths = computed<PathSpec[]>(() => [
  ...(useTrust.value ? [{ label: 'Trust Wallet and wallets built on Trust Wallet Core', path: TRUST_WALLET_PATH }] : []),
  ...Array.from({ length: ledgerAccounts.value }, (_, i) => ({ label: `Ledger account #${i + 1}`, path: ledgerPath(i, net.value) })),
  ...(custom.value?.ok ? [{ label: 'Custom path', path: custom.value.path }] : [])
])

async function derive() {
  busy.value = true
  revealed.value = new Set()
  try {
    result.value = await deriveBip39(phrase.value, usePassphrase.value ? passphrase.value : '', paths.value)
  }
  finally {
    busy.value = false
  }
}

function clear() {
  phrase.value = ''
  passphrase.value = ''
  result.value = null
}
onBeforeUnmount(clear)
watch([phrase, passphrase, usePassphrase, paths], () => {
  result.value = null
})

const rows = computed(() => result.value?.ok
  ? result.value.keys.map(k => ({ ...k, id: formatPath(k.path), wallets: deriveWallets(k.publicKey, { network: net.value, versions: ['v4r2', 'v5r1', 'v3r2'] }) }))
  : [])

const PROBLEMS = {
  'empty': { title: 'Enter your BIP39 phrase first' },
  'unknown-words': { title: 'Some words are not in the BIP39 list', description: 'Check spelling with the mnemonic checker, which suggests fixes.', link: '/tools/mnemonic-checker' },
  'length': { title: 'BIP39 phrases have 12, 15, 18, 21 or 24 words' },
  'checksum': { title: 'The checksum does not match', description: 'The last word of a BIP39 phrase is a checksum. A word is wrong, missing or out of order.', link: '/tools/mnemonic-checker' },
  'ton': { title: 'This is a TON mnemonic, not BIP39', description: 'TON wallet apps (Tonkeeper, MyTonWallet, Tonhub) use their own scheme. Open it with the TON seed phrase tool.', link: '/tools/mnemonic-to-addresses' }
} as Record<string, { title: string, description?: string, link?: string }>
const problem = computed(() => result.value && !result.value.ok
  ? { ...PROBLEMS[result.value.problem]!, title: result.value.unknown ? `Not in the word list: ${result.value.unknown.join(', ')}` : PROBLEMS[result.value.problem]!.title }
  : null)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="Your phrase stays in this tab"
      description="Keys are derived in your browser; nothing is sent or stored. Anyone who sees these words controls every coin on every chain they protect, not just TON. Only type a real phrase on a device you trust; you can go offline first."
    />

    <form class="space-y-3" @submit.prevent="derive">
      <UFormField label="BIP39 seed phrase" hint="12 to 24 words">
        <UTextarea
          v-model="phrase"
          :rows="2"
          autoresize
          class="w-full font-mono"
          :class="hidden && '[&_textarea]:blur-sm'"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="word1 word2 word3 …"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <USwitch v-model="usePassphrase" label="BIP39 passphrase (25th word)" size="sm" />
        <USwitch v-model="hidden" label="Hide words" size="sm" />
        <UButton v-if="!phrase" label="Try a public test phrase" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="phrase = EXAMPLE" />
      </div>
      <UFormField v-if="usePassphrase" label="Passphrase" help="Ledger and Trezor call it passphrase; most phone wallets never set one.">
        <UInput v-model="passphrase" type="password" autocomplete="off" class="w-full sm:w-80" />
      </UFormField>

      <fieldset class="space-y-3 rounded-lg border border-default p-4">
        <legend class="px-1 text-sm font-medium text-highlighted">
          Derivation paths
        </legend>
        <UCheckbox v-model="useTrust" label="Trust Wallet: m/44'/607'/0'" />
        <div class="flex flex-wrap items-center gap-2">
          <UInputNumber v-model="ledgerAccounts" :min="0" :max="20" size="sm" class="w-28" />
          <span class="text-sm">Ledger accounts: <span class="font-mono">m/44'/607'/{{ net === 'testnet' ? 1 : 0 }}'/0'/n'/0'</span></span>
        </div>
        <UFormField label="Custom path (hardened levels only)" :error="custom && !custom.ok ? custom.error : undefined">
          <UInput v-model="customPath" placeholder="m/44'/607'/1'" class="w-full font-mono sm:w-80" autocomplete="off" spellcheck="false" />
        </UFormField>
      </fieldset>

      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" label="Derive TON addresses" icon="i-lucide-route" :loading="busy" :disabled="!paths.length" />
        <UTabs v-model="net" :content="false" size="sm" :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]" />
        <UButton v-if="phrase || result" label="Clear" icon="i-lucide-eraser" color="neutral" variant="ghost" @click="clear" />
      </div>
    </form>

    <UAlert v-if="problem" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="problem.title" :description="problem.description">
      <template v-if="problem.link" #actions>
        <UButton :to="problem.link" label="Open tool" size="xs" color="error" variant="outline" trailing-icon="i-lucide-arrow-right" />
      </template>
    </UAlert>

    <section v-for="r in rows" :key="r.id" class="space-y-3 rounded-xl border border-default p-4" :aria-label="r.label">
      <div>
        <h2 class="font-display text-base font-semibold text-highlighted">
          {{ r.label }}
        </h2>
        <p class="font-mono text-xs text-muted">
          {{ r.id }}
        </p>
      </div>
      <div class="divide-y divide-default">
        <ResultField label="Public key (hex)" :value="r.publicKey" />
        <ResultField
          label="Private key (hex)"
          :value="revealed.has(r.id) ? r.privateKey : ''"
          :copy="revealed.has(r.id)"
          hint="Only for moving funds with a script or a wallet that imports private keys."
        >
          <span v-if="!revealed.has(r.id)" class="font-sans">
            <UButton label="Reveal private key" size="xs" color="warning" variant="soft" icon="i-lucide-eye" @click="revealed = new Set([...revealed, r.id])" />
          </span>
        </ResultField>
      </div>
      <WalletList :wallets="r.wallets" :network="net" :visible="2" />
    </section>

    <p v-if="rows.length" class="text-sm text-muted">
      Trust Wallet and Ledger use wallet v4R2 for TON. W5 and v3R2 are shown in case funds were sent to another contract version of the same key.
    </p>
  </div>
</template>
