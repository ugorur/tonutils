<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TaAccount, TaEventsPage } from '~/lib/tx-user/events'
import ActionLine from '~/lib/tx-user/ActionLine.vue'
import type { HistoryItem, KindFilter } from './logic'
import { KIND_FILTERS, PAGE_SIZE, groupByDay, matches, toHistoryItem, tokenOptions } from './logic'

const EXAMPLES = [
  { label: 'Active trader', value: 'UQA1oZvigoavK2fWe1imzZKmoAx6GlzHA0efVqJFNYJ6Mwtx' },
  { label: 'TON Foundation (old)', value: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N' }
]

const route = useRoute()
const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)
const api = useTonapi()
const { network, isTestnet } = useTonNetwork()

const items = ref<HistoryItem[]>([])
const account = ref<TaAccount | null>(null)
const viewer = ref('')
const nextFrom = ref<number | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

const kind = ref<KindFilter>('all')
const asset = ref('all')
const hideSpam = ref(true)

const done = computed(() => nextFrom.value === 0)
const visible = computed(() => items.value.filter(i => matches(i, { kind: kind.value, asset: asset.value, hideSpam: hideSpam.value })))
const hiddenSpam = computed(() => (hideSpam.value ? items.value.filter(i => i.spam).length : 0))
const groups = computed(() => groupByDay(visible.value))
const tokens = computed(() => [{ label: 'All tokens', value: 'all' }, ...tokenOptions(items.value, hideSpam.value).map(t => ({ label: t.label, value: t.value }))])

let session = 0

async function load(reset: boolean) {
  if (loading.value) return
  if (reset) {
    if (!parsed.value) return
    session++
    viewer.value = parsed.value.toRawString()
    items.value = []
    account.value = null
    nextFrom.value = null
    asset.value = 'all'
  }
  else if (done.value || nextFrom.value === null) {
    return
  }
  const my = session
  loading.value = true
  error.value = null
  try {
    const page = await api.get<TaEventsPage>(`accounts/${viewer.value}/events`, { limit: PAGE_SIZE, before_lt: reset ? undefined : nextFrom.value ?? undefined })
    if (my !== session) return
    account.value ??= page.events[0]?.account ?? null
    items.value.push(...page.events.map(e => toHistoryItem(e, viewer.value)))
    nextFrom.value = page.next_from
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function useExample(v: string) {
  input.value = v
  nextTick(() => load(true))
}

// Infinite scroll: load the next page when the sentinel under the list comes into view.
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && items.value.length && !error.value) load(false)
  }, { rootMargin: '400px' })
  watch(sentinel, (el, old) => {
    if (old) observer?.unobserve(old)
    if (el) observer?.observe(el)
  }, { immediate: true })
  if (input.value) nextTick(() => load(true))
})
onBeforeUnmount(() => observer?.disconnect())

watch(network, () => {
  session++
  items.value = []
  nextFrom.value = null
  loading.value = false
  // Reload the same address on the other network.
  if (viewer.value && parsed.value) nextTick(() => load(true))
})

const time = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const q = (slug: string, id: string) => `/tools/${slug}?q=${id}`
const friendly = computed(() => parsed.value?.toString({ bounceable: false, testOnly: isTestnet.value }) ?? '')
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="load(true)">
      <AddressInput v-model="input" label="Wallet address" placeholder="UQ… / EQ… / 0:…" @parsed="parsed = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Show history" icon="i-lucide-history" :loading="loading && !items.length" :disabled="!parsed" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error && !items.length" :error="error" @retry="load(true)" />
    <LoadingState v-else-if="loading && !items.length" label="Reading history from tonapi…" />

    <template v-if="items.length || (nextFrom === 0 && !error)">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-4">
        <div class="min-w-0">
          <div v-if="account?.name" class="font-display font-semibold text-highlighted">
            {{ account.name }}
          </div>
          <AddressLink :address="friendly" full />
        </div>
        <UButton :to="`/tools/history-csv-export?q=${friendly}`" label="Export CSV" icon="i-lucide-file-spreadsheet" size="sm" color="neutral" variant="outline" />
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          <UButton
            v-for="f in KIND_FILTERS"
            :key="f.value"
            :label="f.label"
            size="xs"
            :color="kind === f.value ? 'primary' : 'neutral'"
            :variant="kind === f.value ? 'solid' : 'outline'"
            :aria-pressed="kind === f.value"
            @click="kind = f.value"
          />
        </div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
          <USelect v-model="asset" :items="tokens" class="w-44" size="sm" aria-label="Filter by token" />
          <USwitch v-model="hideSpam" label="Hide likely spam" size="sm" />
        </div>
        <p class="text-xs text-muted">
          Filters apply to the {{ items.length }} event{{ items.length === 1 ? '' : 's' }} loaded so far{{ hiddenSpam ? ` (${hiddenSpam} hidden as spam)` : '' }}. Scroll down to load older ones.
        </p>
      </div>

      <p v-if="!visible.length && done" class="py-6 text-center text-sm text-muted">
        {{ items.length ? 'Nothing matches these filters.' : 'No transactions on this address yet.' }}
      </p>

      <div v-for="g in groups" :key="g.day" class="space-y-1">
        <h3 class="pt-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {{ g.day }}
        </h3>
        <ul class="divide-y divide-default">
          <li v-for="it in g.items" :key="it.id" class="space-y-2 py-3">
            <ActionLine v-for="(a, i) in it.actions" :key="i" :view="a" />
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs text-muted">
              <span>{{ time(it.time) }}</span>
              <UBadge v-if="it.inProgress" color="warning" variant="subtle" size="sm" icon="i-lucide-clock" label="Pending" />
              <span v-if="it.fee">Fee <TokenAmount :nano="it.fee" /></span>
              <ULink :to="q('tx-lookup', it.id)" class="text-primary">Details</ULink>
              <ULink :to="q('tx-receipt', it.id)" class="text-primary">Receipt</ULink>
              <ExplorerLinks kind="tx" :value="it.id" />
            </div>
          </li>
        </ul>
      </div>

      <div ref="sentinel" />
      <ErrorNotice v-if="error && items.length" :error="error" @retry="load(false)" />
      <LoadingState v-else-if="loading && items.length" label="Loading older transactions…" />
      <div v-else-if="!done && items.length" class="flex justify-center">
        <UButton label="Load more" icon="i-lucide-chevron-down" color="neutral" variant="outline" @click="load(false)" />
      </div>
      <p v-else-if="done && items.length" class="text-center text-xs text-muted">
        That's the whole history.
      </p>
    </template>
  </div>
</template>
