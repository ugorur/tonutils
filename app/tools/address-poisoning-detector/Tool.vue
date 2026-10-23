<script setup lang="ts">
import type { Address } from '@ton/core'
import { formatTime } from '~/lib/jettons-read/core'
import { friendlyOf, type PoisonReport } from '~/lib/security/core'
import { DEPTHS, detectPoisoning, EXAMPLE, fakeCount, fetchEvents, highlight, verdict } from './logic'

const tonapi = useTonapi()
const tc = useTonConnect()
const { network, isTestnet } = useTonNetwork()

const text = ref('')
const addr = shallowRef<Address | null>(null)
const depth = ref<(typeof DEPTHS)[number]>(100)
const depthItems = DEPTHS.map(d => ({ label: `Last ${d} events`, value: d }))

watch(() => tc.wallet.value, (w) => {
  if (w && !tc.networkMismatch.value && !text.value) text.value = w.friendly
}, { immediate: true })

const report = shallowRef<PoisonReport | null>(null)
const more = ref(false)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
let session = 0

async function scan() {
  if (!addr.value) return
  const my = ++session
  const raw = addr.value.toRawString().toLowerCase()
  loading.value = true
  error.value = null
  report.value = null
  try {
    stage.value = 'Reading history (tonapi)…'
    const r = await fetchEvents(tonapi.get, raw, depth.value, n => (stage.value = `Read ${n} events…`))
    if (my !== session) return
    more.value = r.more
    report.value = detectPoisoning(r.events, raw, isTestnet.value)
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example() {
  text.value = EXAMPLE
  nextTick(scan)
}
watch(network, () => {
  report.value = null
})

const v = computed(() => (report.value ? verdict(report.value) : null))
const fq = (raw: string) => friendlyOf(raw, { testnet: isTestnet.value })
const showSpam = ref(false)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="scan">
      <AddressInput v-model="text" label="Wallet address" placeholder="Your wallet (filled in when you connect)" @parsed="addr = $event" />
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="How far back">
          <USelect v-model="depth" :items="depthItems" class="w-44" />
        </UFormField>
        <UButton type="submit" label="Scan history" icon="i-lucide-scan-search" :loading="loading" :disabled="!addr" />
        <UButton label="Try a poisoned wallet" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
      <p class="text-xs text-muted">
        Reads the public history from tonapi. About one page of 100 events per second; 1000 events take ~10 s.
      </p>
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not read the history" @retry="scan" />

    <template v-if="report && !loading">
      <UAlert
        v-if="v === 'poisoned'"
        color="error"
        variant="subtle"
        icon="i-lucide-octagon-x"
        :title="`${fakeCount(report)} fake look-alike address${fakeCount(report) === 1 ? '' : 'es'} in this history`"
        description="Someone created addresses that end like people you really pay and sent you tiny transfers, so the fakes sit in your history right next to the real ones. Never copy a recipient from your history: take it from the person, exchange or app every time."
        data-testid="verdict"
      />
      <UAlert
        v-else-if="v === 'spam'"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="No look-alikes, but spam and dust transfers"
        description="Nobody imitates your counterparties in this range. Some accounts sent you dust or spam (often with links): ignore them and never open the links."
        data-testid="verdict"
      />
      <UAlert
        v-else-if="v === 'clean'"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        title="No poisoning found"
        description="No look-alike addresses and no dust or spam senders in the scanned range."
        data-testid="verdict"
      />
      <p v-else class="rounded-lg border border-dashed border-accented p-4 text-sm text-muted">
        No history on {{ network }} for this address.
      </p>

      <p v-if="report.events" class="text-xs text-muted">
        Scanned {{ report.events }} events, {{ formatTime(report.from) }} to {{ formatTime(report.to) }}.
        <template v-if="more">
          Older history was not scanned: pick a longer range to go further back.
        </template>
      </p>

      <section v-for="g in report.groups" :key="g.real.raw" class="space-y-3 rounded-lg border border-default p-4" data-testid="lookalike-group">
        <div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <UBadge color="success" variant="subtle" icon="i-lucide-circle-check" label="Real counterparty" />
            <span>
              <template v-if="g.real.sent">you sent to it {{ g.real.sent }}×</template>
              <template v-if="g.real.sent && g.real.received">, </template>
              <template v-if="g.real.received">it sent you {{ g.real.received }}×</template>
            </span>
            <span v-if="g.real.name" class="text-highlighted">{{ g.real.name }}</span>
          </div>
          <div class="mt-1 flex items-start gap-1">
            <span class="font-mono text-sm break-all text-highlighted">{{ fq(g.real.raw) }}</span>
            <CopyButton :value="fq(g.real.raw)" size="xs" />
          </div>
          <ExplorerLinks :value="fq(g.real.raw)" class="mt-1" />
        </div>
        <div>
          <div class="mb-1 text-xs font-medium text-error">
            {{ g.fakes.length }} fake{{ g.fakes.length === 1 ? '' : 's' }} imitating it (matching characters highlighted; do not copy these)
          </div>
          <ul class="divide-y divide-default rounded-md border border-error/40 bg-error/5">
            <li v-for="f in g.fakes" :key="f.cp.raw" class="px-3 py-2" data-testid="fake">
              <div class="font-mono text-sm break-all select-none">
                <span v-for="(s, i) in highlight(f.cp.raw, f.match, isTestnet)" :key="i" :class="s.hit ? 'rounded-sm bg-error/20 font-semibold text-error' : 'text-muted'">{{ s.text }}</span>
              </div>
              <div class="mt-0.5 text-xs text-muted">
                Sent you {{ f.cp.junkIn }} dust/spam transfer{{ f.cp.junkIn === 1 ? '' : 's' }} · last {{ formatTime(f.cp.lastSeen) }}
                <UBadge v-if="f.cp.flaggedScam || f.cp.scamEvents" color="error" variant="subtle" size="sm" label="tonapi: scam" class="ml-1" />
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="report.junkSenders.length" class="space-y-2">
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Other dust and spam senders ({{ report.junkSenders.length }})
          </h3>
          <UButton :label="showSpam ? 'Hide' : 'Show'" size="xs" color="neutral" variant="ghost" @click="showSpam = !showSpam" />
        </div>
        <p class="text-xs text-muted">
          Accounts that only ever sent you tiny amounts or spam tokens. Their comments are shown as plain text: do not visit the sites they advertise.
        </p>
        <ul v-if="showSpam" class="divide-y divide-default rounded-lg border border-default" data-testid="spam-list">
          <li v-for="c in report.junkSenders" :key="c.raw" class="px-3 py-2">
            <div class="font-mono text-xs break-all text-muted select-none">
              {{ fq(c.raw) }}
            </div>
            <div class="text-xs text-muted">
              {{ c.junkIn }}× · last {{ formatTime(c.lastSeen) }}
              <UBadge v-if="c.flaggedScam || c.scamEvents" color="error" variant="subtle" size="sm" label="tonapi: scam" class="ml-1" />
            </div>
            <div v-for="(m, i) in c.comments" :key="i" class="mt-0.5 truncate text-xs text-dimmed italic">
              “{{ m }}”
            </div>
          </li>
        </ul>
      </section>
    </template>

    <UAlert
      color="neutral"
      variant="outline"
      icon="i-lucide-info"
      title="How address poisoning works"
      :description="`Wallet apps shorten addresses to the first and last few characters. Attackers generate addresses with the same ending as someone you pay, then send you 0.0001 ${COIN_SYMBOL} or a zero-value token so the fake shows up in your history. If you copy it from there next time, your money goes to them. Always compare the whole address, or use a saved contact.`"
    />
  </div>
</template>
