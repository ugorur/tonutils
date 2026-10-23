<script setup lang="ts">
import type { TonNetwork } from '~/composables/useTonNetwork'
import WalletList from '~/lib/wallet-derivation/WalletList.vue'
import { DEFAULT_SUBWALLET_ID } from '~/utils/ton/wallets'
import { addressesFromPublicKey } from './logic'

// Active mainnet v4R2 wallet: public key read with get_public_key via toncenter.
const EXAMPLE = 'dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8'

const { network } = useTonNetwork()
const input = ref('')
const net = ref<TonNetwork>(network.value)
const workchain = ref(0)
const advanced = ref(false)
const subwalletId = ref<number | null>(null)
const v5Subwallet = ref<number | null>(null)

watch(network, (n) => {
  net.value = n
})

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return {
      ok: true as const,
      wallets: addressesFromPublicKey(input.value, {
        network: net.value,
        workchain: workchain.value,
        subwalletId: advanced.value ? subwalletId.value ?? undefined : undefined,
        v5Subwallet: advanced.value ? v5Subwallet.value ?? undefined : undefined
      })
    }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="Public key" hint="64 hex characters, or base64" help="A public key is safe to share. Never paste a seed phrase or private key here.">
        <UInput v-model="input" placeholder="dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8" class="w-full font-mono" autocomplete="off" spellcheck="false" />
      </UFormField>
      <UButton
        v-if="!input"
        label="Try an example"
        icon="i-lucide-sparkles"
        variant="link"
        size="sm"
        class="px-0"
        @click="input = EXAMPLE; net = 'mainnet'"
      />
    </div>

    <div class="flex flex-wrap items-end gap-4">
      <UTabs v-model="net" :content="false" size="sm" :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]" />
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

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="result?.ok">
      <p class="text-sm text-muted">
        One key controls a different address for each wallet contract version. Wallet apps today create W5;
        older ones used v4R2 or v3R2. Check balances to see which one holds funds.
      </p>
      <WalletList :wallets="result.wallets" :network="net" />
    </template>
  </div>
</template>
