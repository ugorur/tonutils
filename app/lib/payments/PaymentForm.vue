<script setup lang="ts">
import { KNOWN_JETTONS } from '~/utils/ton/jetton'
import type { DraftResult, PaymentDraft } from './form'
import { COIN_ASSET, CUSTOM_ASSET } from './form'

// Recipient / asset / amount / comment / expiry form shared by the payment tools. The parent owns the draft
// and validates it with draftToRequest(); this only renders fields and the result's errors.
const draft = defineModel<PaymentDraft>({ required: true })
const props = withDefaults(defineProps<{
  result: DraftResult
  /** Show the expiry field. */
  expiry?: boolean
  /** Show the advanced binary body (bin) field. */
  bin?: boolean
  amountLabel?: string
  amountHint?: string
  commentLabel?: string
  commentHint?: string
}>(), { amountLabel: 'Amount', amountHint: 'Optional: leave empty to let the payer choose', commentLabel: 'Comment', commentHint: 'Optional' })

const { isTestnet } = useTonNetwork()

const assetItems = computed(() => [
  { label: `${COIN_SYMBOL} (formerly ${COIN_FORMER})`, value: COIN_ASSET },
  ...(isTestnet.value ? [] : KNOWN_JETTONS.map(j => ({ label: `${j.symbol} · ${j.name}`, value: j.master }))),
  { label: 'Other token (jetton master address)', value: CUSTOM_ASSET }
])
// A known mainnet jetton picked before switching to testnet falls back to the coin.
watch(isTestnet, (t) => {
  if (t && draft.value.asset !== COIN_ASSET && draft.value.asset !== CUSTOM_ASSET) draft.value.asset = COIN_ASSET
})

const pad = (n: number) => String(n).padStart(2, '0')
const expLocal = computed({
  get: () => {
    if (draft.value.exp === null) return ''
    const d = new Date(draft.value.exp * 1000)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  },
  set: (v: string) => {
    const t = v ? new Date(v).getTime() : Number.NaN
    draft.value.exp = Number.isNaN(t) ? null : Math.floor(t / 1000)
  }
})
const EXP_PRESETS = [
  { label: '1 hour', sec: 3600 },
  { label: '24 hours', sec: 86400 },
  { label: '7 days', sec: 7 * 86400 }
]
const setExpIn = (sec: number) => {
  draft.value.exp = Math.floor(Date.now() / 1000) + sec
}
const showAdvanced = ref(!!draft.value.bin)
</script>

<template>
  <div class="space-y-4">
    <AddressInput v-model="draft.to" label="Receiving address" placeholder="UQ… / EQ… (your wallet address)" />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Currency">
        <USelect v-model="draft.asset" :items="assetItems" class="w-full" size="lg" data-testid="asset-select" />
      </UFormField>
      <UFormField :label="amountLabel" :error="result.errors.amount" :hint="amountHint">
        <UInput v-model="draft.amount" inputmode="decimal" placeholder="0.0" class="w-full" size="lg" :ui="{ base: 'font-mono' }" autocomplete="off" data-testid="amount-input">
          <template #trailing>
            <span class="text-xs text-muted">{{ result.asset.symbol }}</span>
          </template>
        </UInput>
      </UFormField>
    </div>

    <div v-if="draft.asset === CUSTOM_ASSET" class="grid gap-4 sm:grid-cols-[1fr_8rem]">
      <UFormField label="Jetton master address" :error="result.errors.jetton" hint="The token contract, not a wallet">
        <UInput v-model="draft.customJetton" placeholder="EQ…" class="w-full" size="lg" :ui="{ base: 'font-mono text-sm' }" autocomplete="off" spellcheck="false" />
      </UFormField>
      <UFormField label="Decimals" :error="result.errors.decimals">
        <UInput v-model="draft.decimals" inputmode="numeric" class="w-full" size="lg" />
      </UFormField>
    </div>

    <UFormField :label="commentLabel" :hint="commentHint">
      <div class="flex gap-2">
        <UInput v-model="draft.text" class="w-full" size="lg" placeholder="e.g. Order #1042" :disabled="!!draft.bin.trim()" data-testid="comment-input" />
        <slot name="comment-action" />
      </div>
      <template #help>
        <slot name="comment-help">
          Comments are public on chain. A unique comment lets you match the payment to an order.
        </slot>
      </template>
    </UFormField>

    <UFormField v-if="expiry" label="Expires (optional)" :error="result.errors.exp" hint="Wallets refuse the link after this time">
      <div class="flex flex-wrap items-center gap-2">
        <UInput v-model="expLocal" type="datetime-local" size="lg" class="w-full sm:w-auto" data-testid="exp-input" />
        <UButton v-for="p in EXP_PRESETS" :key="p.sec" :label="`In ${p.label}`" size="xs" variant="outline" color="neutral" @click="setExpIn(p.sec)" />
        <UButton v-if="draft.exp !== null" label="No expiry" size="xs" variant="ghost" color="neutral" @click="draft.exp = null" />
      </div>
    </UFormField>

    <div v-if="bin">
      <UButton
        :label="showAdvanced ? 'Hide advanced' : 'Advanced: attach a binary body (bin)'"
        :icon="showAdvanced ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        variant="link"
        size="sm"
        color="neutral"
        class="px-0"
        @click="showAdvanced = !showAdvanced"
      />
      <UFormField v-if="showAdvanced" label="Message body (BOC)" :error="result.errors.bin" hint="base64 or hex" class="mt-2">
        <UTextarea v-model="draft.bin" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="te6cc…" spellcheck="false" />
        <template #help>
          For developers: the wallet attaches this cell as the message body instead of a comment (Keeper shows a blind-signing warning). Needs an amount.
        </template>
      </UFormField>
    </div>

    <UAlert v-for="w in props.result.warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="w" />
  </div>
</template>
