<script setup lang="ts">
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { PhraseResult } from './logic'
import { suggestWords } from '~/lib/wallet-derivation/phrase'
import WalletList from '~/lib/wallet-derivation/WalletList.vue'
import { deriveWallets } from '~/lib/wallet-derivation/wallets'
import { DEFAULT_SUBWALLET_ID } from '~/utils/ton/wallets'
import { keysFromPhrase } from './logic'

// Public test vector from @ton/crypto's own test suite. Never send real funds to it.
const EXAMPLE = 'dose ice enrich trigger test dove century still betray gas diet dune use other base gym mad law immense village world example praise game'

const { network } = useTonNetwork()
const phrase = ref('')
const password = ref('')
const usePassword = ref(false)
const hidden = ref(false)
const busy = ref(false)
const result = ref<PhraseResult | null>(null)
const showPrivate = ref(false)
const net = ref<TonNetwork>(network.value)
const workchain = ref(0)
const advanced = ref(false)
const subwalletId = ref<number | null>(null)
const v5Subwallet = ref<number | null>(null)

async function derive() {
  busy.value = true
  showPrivate.value = false
  try {
    result.value = await keysFromPhrase(phrase.value, usePassword.value ? password.value : '')
  }
  finally {
    busy.value = false
  }
}

function clear() {
  phrase.value = ''
  password.value = ''
  result.value = null
  showPrivate.value = false
}
onBeforeUnmount(clear)
watch(network, (n) => {
  net.value = n
})
watch([phrase, password, usePassword], () => {
  result.value = null
})

const wallets = computed(() => {
  if (!result.value?.ok) return []
  return deriveWallets(result.value.keys.publicKey, {
    network: net.value,
    workchain: workchain.value,
    subwalletId: advanced.value ? subwalletId.value ?? undefined : undefined,
    v5Subwallet: advanced.value ? v5Subwallet.value ?? undefined : undefined
  })
})

const problem = computed(() => {
  const r = result.value
  if (!r || r.ok) return null
  const p = r.problem
  switch (p.kind) {
    case 'empty': return { title: 'Enter your seed phrase first' }
    case 'unknown-words': return {
      title: `Not in the word list: ${p.words.join(', ')}`,
      description: p.words.map((w) => {
        const s = suggestWords(w)
        return s.length ? `${w} → ${s.join(' / ')}?` : `${w}: no close match`
      }).join('   ')
    }
    case 'needs-password': return { title: 'This phrase was created with a password', description: 'Turn on "Phrase has a password" and enter it. Without it the keys are different.' }
    case 'no-password': return { title: 'This phrase has no password', description: 'It is a plain TON mnemonic. Turn off "Phrase has a password" to open it.' }
    case 'wrong-password': return { title: 'That password does not fit this phrase', description: 'TON checks the password: a wrong one is rejected instead of opening an empty wallet.' }
    case 'bip39': return { title: 'This is a BIP39 phrase, not a TON one', description: 'Trust Wallet, Ledger and other multichain wallets use BIP39. Open it with the BIP39 tool, which follows their derivation paths.', link: '/tools/bip39-ton-derivation' }
    default: return { title: 'Not a valid TON mnemonic', description: 'All words are in the list, but the checksum does not match. Check the order and spelling with the mnemonic checker.', link: '/tools/mnemonic-checker' }
  }
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="Your phrase stays in this tab"
      description="Everything is computed in your browser; the phrase is never sent or stored. Still, anyone who sees these words owns the wallet: only type a real phrase on a device you trust. You can go offline before typing; the page keeps working."
    />

    <form class="space-y-3" @submit.prevent="derive">
      <UFormField label="24-word TON seed phrase" hint="spaces, commas or a numbered list">
        <UTextarea
          v-model="phrase"
          :rows="3"
          autoresize
          class="w-full font-mono"
          :class="hidden && '[&_textarea]:blur-sm'"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="word1 word2 word3 …"
          data-testid="phrase"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <USwitch v-model="usePassword" label="Phrase has a password" size="sm" />
        <USwitch v-model="hidden" label="Hide words" size="sm" />
        <UButton v-if="!phrase" label="Try a public test phrase" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="phrase = EXAMPLE" />
      </div>
      <UFormField v-if="usePassword" label="Mnemonic password">
        <UInput v-model="password" type="password" autocomplete="off" class="w-full sm:w-80" />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton type="submit" label="Show keys and addresses" icon="i-lucide-key-round" :loading="busy" />
        <UButton v-if="phrase || result" label="Clear" icon="i-lucide-eraser" color="neutral" variant="ghost" @click="clear" />
      </div>
    </form>

    <UAlert v-if="problem" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="problem.title" :description="problem.description">
      <template v-if="problem.link" #actions>
        <UButton :to="problem.link" label="Open tool" size="xs" color="error" variant="outline" trailing-icon="i-lucide-arrow-right" />
      </template>
    </UAlert>

    <template v-if="result?.ok">
      <section aria-labelledby="keys-h">
        <h2 id="keys-h" class="font-display text-base font-semibold text-highlighted">
          Key pair
        </h2>
        <div class="mt-1 divide-y divide-default">
          <ResultField label="Public key (hex)" :value="result.keys.publicKey" />
          <ResultField
            label="Private key (32-byte seed, hex)"
            :value="showPrivate ? result.keys.privateKey : ''"
            :copy="showPrivate"
            hint="Same power as the seed phrase. Reveal only if a script needs it."
          >
            <span v-if="!showPrivate" class="font-sans">
              <UButton label="Reveal private key" size="xs" color="warning" variant="soft" icon="i-lucide-eye" @click="showPrivate = true" />
            </span>
          </ResultField>
        </div>
      </section>

      <section aria-labelledby="wallets-h" class="space-y-3">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <h2 id="wallets-h" class="font-display text-base font-semibold text-highlighted">
            Wallet addresses
          </h2>
          <UTabs v-model="net" :content="false" size="sm" :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]" />
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <USelect v-model="workchain" size="sm" class="w-44" :items="[{ label: 'Basechain (0)', value: 0 }, { label: 'Masterchain (−1)', value: -1 }]" />
          <USwitch v-model="advanced" label="Custom subwallet ids" size="sm" />
        </div>
        <div v-if="advanced" class="grid gap-4 sm:grid-cols-2">
          <UFormField label="v3/v4 subwallet_id" :hint="`default ${DEFAULT_SUBWALLET_ID + workchain}`">
            <UInputNumber v-model="subwalletId" :min="0" :max="4294967295" placeholder="default" class="w-full" />
          </UFormField>
          <UFormField label="W5 subwallet number" hint="0–32767, default 0">
            <UInputNumber v-model="v5Subwallet" :min="0" :max="32767" placeholder="0" class="w-full" />
          </UFormField>
        </div>
        <p class="text-sm text-muted">
          One phrase controls a different address per wallet version. If your {{ COIN_SYMBOL }} (formerly {{ COIN_FORMER }}) seems
          missing after a restore, the app probably opened another version: check balances below.
        </p>
        <WalletList :wallets="wallets" :network="net" />
      </section>
    </template>
  </div>
</template>
