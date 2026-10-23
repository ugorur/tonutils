<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { convertAdnl } from './logic'

// Real on-chain value: the site record of foundation.ton, as toncenter returns it (base64).
const EXAMPLE = 'UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ='

const input = ref('')

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: convertAdnl(input.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const INPUT_LABEL = { hex: 'hex (64 characters)', friendly: '.adnl user form (55 characters)', base64: 'base64 (32 bytes)' }

const rows = computed<KeyValueItem[]>(() => {
  if (!result.value?.ok) return []
  const d = result.value.data
  return [
    { label: 'User form (.adnl)', value: d.friendly, hint: '55 base32 characters: 0x2d tag + 32 bytes + CRC16, first character dropped.' },
    { label: 'Hex', value: d.hex, hint: 'The 256-bit ADNL id. DNS site records, node configs and storage providers use this.' },
    { label: 'Base64', value: d.base64, hint: 'The same 32 bytes in base64, as toncenter returns dns_site_adnl.' },
    { label: 'TON Site URL', value: d.siteUrl, hint: 'Opens through a TON proxy (rldp-http-proxy) or a TON-enabled browser, not a regular one.' }
  ]
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="ADNL address" hint="hex, .adnl form, base64 or a TON Site URL">
        <UInput
          v-model="input"
          placeholder="e.g. 516618cf… or viwmggpns7…wkf or http://….adnl/"
          class="w-full"
          size="lg"
          :ui="{ base: 'font-mono text-sm' }"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        >
          <template v-if="result?.ok" #trailing>
            <UIcon name="i-lucide-circle-check" class="size-4 text-success" aria-label="Valid ADNL address" />
          </template>
        </UInput>
      </UFormField>
      <UButton v-if="!input" label="Try an example (foundation.ton site)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = EXAMPLE" />
    </div>

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="result?.ok">
      <ResultField label="Detected input" :value="INPUT_LABEL[result.data.input]" :mono="false" :copy="false" />
      <KeyValue :items="rows" />
    </template>

    <p class="text-xs text-dimmed">
      ADNL addresses identify nodes on TON's peer-to-peer network: TON Sites, TON Storage providers, proxies and validators. They are not wallet addresses and cannot receive {{ COIN_SYMBOL }}.
    </p>
  </div>
</template>
