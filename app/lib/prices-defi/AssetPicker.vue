<script setup lang="ts">
import type { Asset, TonapiJettonMeta } from './assets'
import { FIATS, POPULAR, assetFromTonapi, assetKey, normalizeMaster } from './assets'

// GRAM / popular jettons / any jetton by address (metadata from tonapi), optionally fiat currencies.
// Client-only (AddressInput imports @ton/core). Prices and DEX data are mainnet, so metadata is read from mainnet.
const model = defineModel<Asset>({ required: true })
const props = defineProps<{ label: string, fiat?: boolean }>()

const tonapi = useTonapi('mainnet')
const custom = ref<Asset[]>([])
const showCustom = ref(false)
const address = ref('')
const loading = ref(false)
const error = ref<unknown>(null)

const known = computed(() => [...POPULAR, ...custom.value.filter(c => !POPULAR.some(p => assetKey(p) === assetKey(c)))])
const items = computed(() => {
  const coins = known.value.map(a => ({ label: a.symbol, value: assetKey(a), description: a.name, avatar: a.image ? { src: a.image, alt: '' } : undefined }))
  const groups: { label: string, value: string, description?: string, type?: 'label' }[][] = [
    [{ label: 'Tokens', value: '_t', type: 'label' }, ...coins, { label: 'Other jetton…', value: 'custom', description: 'Paste a jetton master address' }]
  ]
  if (props.fiat) groups.push([{ label: 'Currencies', value: '_f', type: 'label' }, ...FIATS.map(f => ({ label: f.symbol, value: assetKey(f), description: f.name }))])
  return groups
})

const selected = computed({
  get: () => assetKey(model.value),
  set: (key: string) => {
    if (key === 'custom') {
      showCustom.value = true
      return
    }
    showCustom.value = false
    const found = [...known.value, ...FIATS].find(a => assetKey(a) === key)
    if (found) model.value = found
  }
})

// Keep a jetton set from outside (URL, example button) selectable.
watch(model, (a) => {
  if (a.kind === 'jetton' && !known.value.some(k => assetKey(k) === assetKey(a))) custom.value.push(a)
}, { immediate: true })

async function load() {
  error.value = null
  let master: string
  try {
    master = normalizeMaster(address.value)
  }
  catch {
    error.value = new Error('Not a valid TON address.')
    return
  }
  loading.value = true
  try {
    const asset = assetFromTonapi(await tonapi.get<TonapiJettonMeta>(`jettons/${master}`))
    model.value = asset
    showCustom.value = false
    address.value = ''
  }
  catch (e) {
    error.value = e instanceof TonApiError && e.status === 404 ? new Error('No jetton found at this address. Paste the jetton master (token contract), not a wallet.') : e
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <UFormField :label="label">
      <USelectMenu
        v-model="selected"
        :items="items"
        value-key="value"
        size="lg"
        class="w-full"
        :search-input="{ placeholder: 'Search…' }"
        :avatar="model.image ? { src: model.image, alt: '' } : undefined"
      >
        <span class="truncate"><span class="font-medium">{{ model.symbol }}</span> <span class="text-muted">{{ model.name }}</span></span>
      </USelectMenu>
    </UFormField>
    <p v-if="model.kind === 'jetton' && model.verification && model.verification !== 'whitelist'" class="flex items-start gap-1.5 text-xs text-warning">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
      <span>{{ model.verification === 'blacklist' ? 'Flagged as a scam by tonapi.' : 'Not verified by tonapi.' }} Scam tokens copy names and logos: check the address.</span>
    </p>
    <div v-if="showCustom" class="space-y-2 rounded-lg border border-default p-3">
      <AddressInput v-model="address" label="Jetton master address" placeholder="EQ… address of the token contract" />
      <div class="flex gap-2">
        <UButton label="Use this jetton" icon="i-lucide-check" size="sm" :loading="loading" :disabled="!address.trim()" @click="load" />
        <UButton label="Cancel" size="sm" color="neutral" variant="ghost" @click="showCustom = false" />
      </div>
      <ErrorNotice :error="error" @retry="load" />
    </div>
  </div>
</template>
