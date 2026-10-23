<script setup lang="ts">
import { fetchAccountStates, resolveName, useAccountClients } from '~/lib/accounts/api'
import type { AccountState } from '~/lib/accounts/core'
import { friendly, STATUS_INFO } from '~/lib/accounts/core'
import type { Grouped, TonapiSearchItem } from './logic'
import { classifyInput, groupResults, lookalikeOf, MIN_QUERY } from './logic'

const EXAMPLES = ['Binance', 'Fragment', 'Tonkeeper', 'foundation.ton']
const KIND_LABEL = { account: 'Account', jetton: 'Jetton', collection: 'NFT collection', other: 'Other' } as const

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const clients = useAccountClients(network)

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = computed(() => classifyInput(input.value))

const loading = ref(false)
const error = ref<unknown>(null)
const searched = ref('')
const groups = ref<Grouped | null>(null)
/** The exact .ton / .t.me name typed, resolved through DNS: raw address, or an Error. */
const exact = ref<{ name: string, raw?: string, error?: string } | null>(null)
const states = ref(new Map<string, AccountState>())
const showUnverified = ref(false)
let runId = 0

async function search() {
  const p = parsed.value
  if (p.kind !== 'text') return
  const id = ++runId
  loading.value = true
  error.value = null
  groups.value = null
  exact.value = null
  states.value = new Map()
  showUnverified.value = false
  searched.value = p.q
  router.replace({ query: { ...route.query, q: p.q } })
  try {
    const [res, ex] = await Promise.all([
      clients.tonapi<{ addresses: TonapiSearchItem[] }>('accounts/search', { name: p.q }),
      p.domain
        ? resolveName(p.q, clients).then(raw => ({ name: p.q.toLowerCase(), raw }), (e: Error) => ({ name: p.q.toLowerCase(), error: e.message } as { name: string, raw?: string, error?: string }))
        : Promise.resolve(null)
    ])
    if (id !== runId) return
    groups.value = groupResults(res.addresses ?? [], p.q)
    exact.value = ex
    loading.value = false
    // Balance, status and the memo flag for the accounts on screen (one batched request per API).
    const raws = [...new Set([...(ex?.raw ? [ex.raw] : []), ...[...groups.value.verified, ...groups.value.unverified].filter(r => r.kind === 'account').map(r => r.raw)])].slice(0, 100)
    if (raws.length) {
      fetchAccountStates(raws, clients).then((s) => {
        if (id === runId) states.value = s.states
      }, () => { /* extras only: results stay usable without them */ })
    }
  }
  catch (e) {
    if (id === runId) {
      error.value = e
      loading.value = false
    }
  }
}

// Search as you type, gently: public APIs allow about one request per second.
let timer: ReturnType<typeof setTimeout> | undefined
watch(input, () => {
  clearTimeout(timer)
  if (parsed.value.kind === 'text' && parsed.value.q !== searched.value) timer = setTimeout(search, 700)
})
onBeforeUnmount(() => clearTimeout(timer))
watch(network, () => {
  searched.value = ''
  search()
})
onMounted(() => search())

function searchNow(v: string) {
  input.value = v
  clearTimeout(timer)
  search()
}

const lookalikes = computed(() => {
  const g = groups.value
  return new Map((g?.unverified ?? []).map(r => [r, lookalikeOf(r, g!.verified)] as const))
})

function addressFor(r: { raw: string, kind?: string }) {
  const s = states.value.get(r.raw)
  return friendly(r.raw, { wallet: s ? s.isWallet || s.status !== 'active' : false, testnet: isTestnet.value })
}
function overviewLink(raw: string) {
  return `/tools/account-overview?q=${encodeURIComponent(raw)}`
}
const total = computed(() => (groups.value?.verified.length ?? 0) + (groups.value?.unverified.length ?? 0))
const unverifiedShown = computed(() => showUnverified.value ? groups.value?.unverified ?? [] : (groups.value?.unverified ?? []).slice(0, 5))
const lookalikeCount = computed(() => [...lookalikes.value.values()].filter(Boolean).length)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="searchNow(input)">
      <UFormField label="Name to search" :hint="`At least ${MIN_QUERY} characters`" help="An exchange, wallet app, service, token or a .ton / .t.me name.">
        <div class="flex gap-2">
          <UInput
            v-model="input"
            placeholder="Binance, Fragment, foundation.ton…"
            class="min-w-0 flex-1"
            size="lg"
            icon="i-lucide-search"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" size="lg" label="Search" :loading="loading" :disabled="parsed.kind !== 'text'" />
        </div>
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex" :label="ex" variant="link" size="sm" class="px-0" @click="searchNow(ex)" />
      </div>
    </form>

    <UAlert
      v-if="parsed.kind === 'address'"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="That is already an address"
      description="This tool searches by name. To see who owns this address, its balance and any warnings, open it in Account overview."
      :actions="[{ label: 'Open in Account overview', to: overviewLink(parsed.raw), icon: 'i-lucide-user-round-search' }]"
    />

    <UAlert
      v-if="isTestnet"
      color="warning"
      variant="subtle"
      icon="i-lucide-flask-conical"
      title="Testnet"
      description="tonapi's name list is built from mainnet, so testnet results may point to accounts that do not exist on testnet."
    />

    <LoadingState v-if="loading" :label="`Searching for “${searched}”…`" />
    <ErrorNotice :error="error" title="Search failed" @retry="search" />

    <template v-if="groups && !loading">
      <section v-if="exact" class="rounded-lg border p-4" :class="exact.raw ? 'border-primary/40 bg-primary/5' : 'border-default'">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon name="i-lucide-globe" class="size-4 text-primary" />
          <span class="font-medium text-highlighted">{{ exact.name }}</span>
          <UBadge color="neutral" variant="subtle" size="sm" label="DNS record" />
        </div>
        <template v-if="exact.raw">
          <p class="mt-1 text-sm text-muted">
            This name points to the wallet below. A .ton name proves only that its owner set this wallet, not who they are.
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <AddressLink :address="addressFor({ raw: exact.raw })" full class="break-all" />
            <UButton :to="overviewLink(exact.raw)" label="Overview" icon="i-lucide-user-round-search" variant="link" size="sm" class="px-0" />
          </div>
        </template>
        <p v-else class="mt-1 text-sm text-muted">
          {{ exact.error }}
        </p>
      </section>

      <p v-if="!total" class="text-sm text-muted">
        Nothing found for “{{ searched }}”. Try a shorter or different name. Only names that tonapi knows (verified services, tokens and .ton / .t.me names) can be found.
      </p>

      <section v-if="groups.verified.length">
        <h3 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-badge-check" class="size-4 text-primary" />
          Verified ({{ groups.verified.length }})
        </h3>
        <p class="mt-1 text-xs text-dimmed">
          Reviewed by tonapi (the data behind Tonkeeper and Tonviewer). Still compare the address with the one the service shows you.
        </p>
        <ul class="mt-2 divide-y divide-default rounded-lg border border-default">
          <li v-for="r in groups.verified" :key="`${r.raw}|${r.title}`" class="flex items-start gap-3 px-3 py-2.5">
            <UAvatar :src="r.image" :alt="r.title" size="md" class="mt-0.5" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-medium text-highlighted">{{ r.title }}</span>
                <UBadge color="neutral" variant="outline" size="sm" :label="KIND_LABEL[r.kind]" />
                <UBadge v-if="states.get(r.raw)?.memoRequired" color="warning" variant="subtle" size="sm" icon="i-lucide-message-square-warning" label="Memo required" />
                <UBadge v-if="states.get(r.raw)?.isScam" color="error" variant="subtle" size="sm" label="Scam" />
              </div>
              <AddressLink :address="addressFor(r)" class="text-sm" />
              <div v-if="states.get(r.raw)" class="text-xs text-muted">
                {{ STATUS_INFO[states.get(r.raw)!.status].label }} · {{ states.get(r.raw)!.kind }} · <TokenAmount :nano="states.get(r.raw)!.balance" :max-decimals="2" />
              </div>
            </div>
            <UButton v-if="r.kind === 'account'" :to="overviewLink(r.raw)" icon="i-lucide-user-round-search" aria-label="Open in Account overview" variant="ghost" color="neutral" size="sm" />
          </li>
        </ul>
        <p v-if="groups.verified.some(r => states.get(r.raw)?.memoRequired)" class="mt-2 text-xs text-warning">
          “Memo required” addresses are shared exchange deposit wallets. Send there only with the memo/comment your exchange account shows, or the deposit can be lost.
        </p>
      </section>

      <section v-if="groups.unverified.length">
        <h3 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-shield-alert" class="size-4 text-warning" />
          Not verified ({{ groups.unverified.length }})
        </h3>
        <UAlert
          class="mt-2"
          color="warning"
          variant="subtle"
          :title="lookalikeCount ? `${lookalikeCount} lookalike name${lookalikeCount > 1 ? 's' : ''} of a verified service` : 'Anyone can register these names'"
          description="Anyone can register a .ton or .t.me name or create a token with any name. Names like “fragment-support.ton” are not the real service. Never send funds or connect your wallet based on a name alone."
        />
        <ul class="mt-2 divide-y divide-default rounded-lg border border-default">
          <li v-for="r in unverifiedShown" :key="`${r.raw}|${r.title}`" class="flex items-start gap-3 px-3 py-2">
            <UAvatar :src="r.image" :alt="r.title" size="sm" class="mt-0.5" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="break-all text-highlighted">{{ r.title }}</span>
                <UBadge color="neutral" variant="outline" size="sm" :label="r.domain ? 'Name' : KIND_LABEL[r.kind]" />
                <UBadge v-if="lookalikes.get(r)" color="error" variant="subtle" size="sm" :label="`Not ${lookalikes.get(r)}`" />
                <UBadge v-if="states.get(r.raw)?.isScam" color="error" variant="subtle" size="sm" label="Scam" />
              </div>
              <AddressLink :address="addressFor(r)" class="text-sm" />
            </div>
            <UButton v-if="r.kind === 'account'" :to="overviewLink(r.raw)" icon="i-lucide-user-round-search" aria-label="Open in Account overview" variant="ghost" color="neutral" size="sm" />
          </li>
        </ul>
        <UButton
          v-if="groups.unverified.length > 5"
          :label="showUnverified ? 'Show fewer' : `Show all ${groups.unverified.length}`"
          :icon="showUnverified ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          variant="link"
          size="sm"
          class="mt-1 px-0"
          @click="showUnverified = !showUnverified"
        />
      </section>
      <p v-if="total" class="text-xs text-dimmed">
        Names from tonapi's account search. Balances from toncenter.
      </p>
    </template>
  </div>
</template>
