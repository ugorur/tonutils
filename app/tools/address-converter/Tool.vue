<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { convertAddress } from './logic'

const EXAMPLE = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'

const input = ref('')
const { network } = useTonNetwork()
const tab = ref<string>(network.value)

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: convertAddress(input.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const detected = computed(() => {
  if (!result.value?.ok) return ''
  const i = result.value.data.input
  if (i.format === 'raw') return 'Raw address (raw form carries no bounce or network flags)'
  return [
    i.bounceable ? 'Bounceable' : 'Non-bounceable',
    i.testOnly ? 'testnet-only' : 'mainnet',
    i.urlSafe === null ? 'base64 (no alphabet-specific characters)' : i.urlSafe ? 'URL-safe base64' : 'standard base64'
  ].join(', ')
})

const rows = computed<KeyValueItem[]>(() => {
  if (!result.value?.ok) return []
  const d = result.value.data
  const f = tab.value === 'testnet' ? d.testnet : d.mainnet
  return [
    { label: 'Non-bounceable (wallets)', value: f.nonBounceable.urlSafe, hint: 'Share this to receive funds into a wallet. Wallet apps show this form.' },
    { label: 'Bounceable (contracts)', value: f.bounceable.urlSafe, hint: 'Use for smart contracts: a failed transfer bounces back to the sender.' },
    { label: 'Non-bounceable, standard base64', value: f.nonBounceable.standard },
    { label: 'Bounceable, standard base64', value: f.bounceable.standard },
    { label: 'Raw', value: d.raw, hint: 'workchain:hash. Same on every network and flag combination.' }
  ]
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <AddressInput v-model="input" label="Any TON address" placeholder="EQ…, UQ…, kQ…, 0Q… or 0:<64 hex>" />
      <UButton
        v-if="!input"
        label="Try an example"
        icon="i-lucide-sparkles"
        variant="link"
        size="sm"
        class="px-0"
        @click="input = EXAMPLE"
      />
    </div>

    <UAlert
      v-if="result && !result.ok"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="result.error"
    />

    <template v-if="result?.ok">
      <div class="grid gap-x-6 sm:grid-cols-[auto_1fr]">
        <ResultField label="Workchain" :value="`${result.data.workchain} (${result.data.workchain === -1 ? 'masterchain' : 'basechain'})`" :copy="false" />
        <ResultField label="Account hash" :value="result.data.hashHex" />
        <ResultField label="Detected input" :value="detected" :mono="false" :copy="false" class="sm:col-span-2" />
      </div>

      <div>
        <UTabs
          v-model="tab"
          :content="false"
          :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]"
          variant="link"
          class="w-full"
        />
        <KeyValue :items="rows" class="mt-2" />
      </div>
    </template>
  </div>
</template>
