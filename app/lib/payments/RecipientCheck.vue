<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { recipientNotes } from '~/lib/wallet-actions/core'

// Who receives a payment: full address, tonapi name / status / scam flag, plus the wallet-actions checks.
const props = withDefaults(defineProps<{
  /** User-friendly or raw address. */
  address: string
  purpose?: 'coin' | 'jetton'
  comment?: string
}>(), { purpose: 'coin', comment: '' })
const emit = defineEmits<{ account: [a: TonapiAccount | null] }>()

const tonapi = useTonapi()
const { network, isTestnet } = useTonNetwork()
const account = shallowRef<TonapiAccount | null>(null)
const error = ref<unknown>(null)
const loading = ref(false)
let session = 0

const parsed = computed(() => {
  try {
    return Address.isFriendly(props.address) ? Address.parseFriendly(props.address) : { address: Address.parse(props.address), isTestOnly: null }
  }
  catch {
    return null
  }
})

async function load() {
  const my = ++session
  account.value = null
  error.value = null
  emit('account', null)
  if (!parsed.value) return
  loading.value = true
  try {
    const a = await tonapi.get<TonapiAccount>(`accounts/${parsed.value.address.toRawString()}`)
    if (my !== session) return
    account.value = a
    emit('account', a)
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
watch([() => props.address, network], load, { immediate: true })

const notes = computed(() => parsed.value
  ? recipientNotes(parsed.value.address, account.value, {
      purpose: props.purpose,
      comment: props.comment,
      testnet: isTestnet.value,
      typedTestOnly: parsed.value.isTestOnly
    })
  : [])
const NOTE_STYLE = {
  error: { color: 'error', icon: 'i-lucide-octagon-x' },
  warning: { color: 'warning', icon: 'i-lucide-triangle-alert' },
  info: { color: 'info', icon: 'i-lucide-info' }
} as const
const STATUS_LABEL: Record<string, string> = { active: 'Active', uninit: 'Not activated yet', nonexist: 'New (never used)', frozen: 'Frozen' }
</script>

<template>
  <div class="space-y-2" data-testid="recipient-check">
    <div class="rounded-lg border border-default p-3">
      <div class="text-xs text-muted">
        Recipient
      </div>
      <div class="mt-1 font-mono text-sm break-all text-highlighted" data-testid="recipient-full">
        {{ address }}
      </div>
      <div v-if="parsed" class="mt-1 font-mono text-xs break-all text-muted" data-testid="recipient-raw">
        raw {{ parsed.address.toRawString() }}
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <template v-if="account">
          <UBadge v-if="account.name" color="primary" variant="subtle" icon="i-lucide-badge-check" :label="account.name" />
          <UBadge :color="account.status === 'active' ? 'success' : account.status === 'frozen' ? 'warning' : 'neutral'" variant="subtle" :label="STATUS_LABEL[account.status] ?? account.status" />
          <UBadge v-if="account.is_wallet" color="neutral" variant="outline" label="Wallet" />
          <UBadge v-else-if="account.status === 'active'" color="neutral" variant="outline" label="Smart contract" />
          <UBadge v-if="account.is_scam" color="error" variant="solid" icon="i-lucide-shield-alert" label="Flagged as scam" />
        </template>
        <LoadingState v-else-if="loading" label="Checking the recipient…" />
        <CopyButton :value="address" label="Copy" size="xs" />
      </div>
      <ExplorerLinks :value="address" class="mt-2" />
    </div>
    <ErrorNotice v-if="error" :error="error" title="Could not check the recipient" @retry="load" />
    <UAlert v-for="(n, i) in notes" :key="i" :color="NOTE_STYLE[n.level].color" :icon="NOTE_STYLE[n.level].icon" variant="subtle" :description="n.text" />
  </div>
</template>
