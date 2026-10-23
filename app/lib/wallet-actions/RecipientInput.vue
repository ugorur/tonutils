<script setup lang="ts">
import { Address } from '@ton/core'
import type { Purpose, Recipient, TonapiAccount } from './core'
import { chooseBounce, parseRecipient, recipientNotes } from './core'

// Recipient field for the wallet-action tools: address or .ton / .t.me name, resolved and checked with tonapi
// (status, memo_required, scam flag, contract vs wallet). Client-only (imports @ton/core).
const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{
  label?: string
  purpose: Purpose
  /** Comment entered alongside (memo checks). */
  comment?: string
  /** Owner / connected wallet, to flag self-transfers. */
  self?: Address | null
}>(), { label: 'Recipient', comment: '' })
const emit = defineEmits<{ resolved: [r: Recipient | null] }>()

const tonapi = useTonapi()
const { network, isTestnet } = useTonNetwork()

const parsed = computed(() => parseRecipient(model.value))
const resolving = ref(false)
const lookupError = ref<unknown>(null)
const domainError = ref<string | null>(null)
/** `key` is the input + network it was resolved for: a stale result (while the next lookup is debounced) is never used. */
const target = shallowRef<{ key: string, address: Address, account: TonapiAccount | null, domain: string | null } | null>(null)
const inputKey = () => `${network.value}|${model.value.trim()}`
let session = 0
let timer: ReturnType<typeof setTimeout> | undefined

async function lookup() {
  const my = ++session
  const key = inputKey()
  const p = parsed.value
  target.value = null
  lookupError.value = null
  domainError.value = null
  if (p.kind !== 'address' && p.kind !== 'domain') {
    resolving.value = false
    return
  }
  resolving.value = true
  try {
    let address: Address
    let domain: string | null = null
    if (p.kind === 'domain') {
      domain = p.domain
      const r = await tonapi.get<{ wallet?: { address?: string } }>(`dns/${encodeURIComponent(p.domain)}/resolve`).catch((e: unknown) => {
        if (e instanceof TonApiError && e.status > 0 && e.status < 500 && !e.isRateLimit) return null
        throw e
      })
      if (my !== session) return
      if (!r?.wallet?.address) {
        domainError.value = `${p.domain} does not point to a wallet: it is not registered, expired, or has no wallet record.`
        return
      }
      address = Address.parse(r.wallet.address)
    }
    else {
      address = p.address
    }
    // Show the parsed address right away; account details follow.
    target.value = { key, address, account: null, domain }
    const account = await tonapi.get<TonapiAccount>(`accounts/${address.toRawString()}`)
    if (my === session) target.value = { key, address, account, domain }
  }
  catch (e) {
    if (my === session) lookupError.value = e
  }
  finally {
    if (my === session) resolving.value = false
  }
}

watch([() => model.value.trim(), network], () => {
  clearTimeout(timer)
  timer = setTimeout(lookup, 450)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const result = computed<Recipient | null>(() => {
  const t = target.value
  const p = parsed.value
  if (!t || !t.account || t.key !== inputKey()) return null
  const typed = p.kind === 'address' ? p.bounceable : null
  const { bounceable, autofixed } = props.purpose === 'coin'
    ? chooseBounce(typed, t.account.status)
    : { bounceable: false, autofixed: false }
  const notes = recipientNotes(t.address, t.account, {
    purpose: props.purpose,
    comment: props.comment,
    testnet: isTestnet.value,
    typedTestOnly: p.kind === 'address' ? p.testOnly : null,
    self: props.self,
    autofixed
  })
  return {
    address: t.address,
    destination: t.address.toString({ bounceable, testOnly: isTestnet.value, urlSafe: true }),
    bounceable,
    domain: t.domain,
    account: t.account,
    notes,
    blocked: notes.some(n => n.level === 'error')
  }
})

watch(result, r => emit('resolved', r), { immediate: true })

const fieldError = computed(() => (parsed.value.kind === 'invalid' ? parsed.value.error : domainError.value ?? undefined))
const NOTE_STYLE = {
  error: { color: 'error', icon: 'i-lucide-octagon-x' },
  warning: { color: 'warning', icon: 'i-lucide-triangle-alert' },
  info: { color: 'info', icon: 'i-lucide-info' }
} as const
const STATUS_LABEL: Record<string, string> = { active: 'Active', uninit: 'Not activated yet', nonexist: 'New (never used)', frozen: 'Frozen' }
</script>

<template>
  <div class="space-y-2">
    <UFormField :label="label" :error="fieldError" hint="Address or name (.ton, .t.me)">
      <UInput
        v-model="model"
        placeholder="UQ… / EQ… / name.ton"
        class="w-full"
        size="lg"
        :ui="{ base: 'font-mono text-sm' }"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :loading="resolving"
        data-testid="recipient-input"
      >
        <template v-if="result && !result.blocked" #trailing>
          <UIcon name="i-lucide-circle-check" class="size-4 text-success" aria-label="Recipient checked" />
        </template>
      </UInput>
    </UFormField>

    <ErrorNotice v-if="lookupError" :error="lookupError" title="Could not check the recipient" @retry="lookup" />

    <div v-if="target" class="space-y-2 rounded-lg border border-default p-3 text-sm" data-testid="recipient-card">
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="target.domain" class="font-medium text-highlighted">{{ target.domain }} →</span>
        <AddressLink :address="result?.destination ?? target.address.toString({ testOnly: isTestnet })" :bounceable="result?.bounceable ?? true" />
      </div>
      <div v-if="target.account" class="flex flex-wrap gap-1.5">
        <UBadge v-if="target.account.name" color="primary" variant="subtle" :label="target.account.name" />
        <UBadge :color="target.account.status === 'active' ? 'success' : target.account.status === 'frozen' ? 'warning' : 'neutral'" variant="subtle" :label="STATUS_LABEL[target.account.status] ?? target.account.status" />
        <UBadge v-if="target.account.is_wallet" color="neutral" variant="outline" label="Wallet" />
        <UBadge v-else-if="target.account.status === 'active'" color="neutral" variant="outline" label="Smart contract" />
        <UBadge v-if="target.account.memo_required" color="warning" variant="subtle" label="Memo required" />
        <UBadge v-if="target.account.is_scam" color="error" variant="subtle" label="Scam" />
      </div>
      <LoadingState v-else label="Checking the account…" />
    </div>

    <UAlert
      v-for="(n, i) in result?.notes ?? []"
      :key="i"
      :color="NOTE_STYLE[n.level].color"
      :icon="NOTE_STYLE[n.level].icon"
      variant="subtle"
      :description="n.text"
      data-testid="recipient-note"
    />
  </div>
</template>
