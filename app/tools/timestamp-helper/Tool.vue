<script setup lang="ts">
import type { ChainClock, TcBlock } from './logic'
import { describeTime, ltBlockQuery, parseLt, parseTime, relative, toChainClock, validUntil, VALID_PRESETS } from './logic'

const EXAMPLE_LT = { lt: '111813286000010', tx: '91671f17a22d16bc64a4b274bce06583ba590aea2353bc4c0475cd37ebde9c72' }

const { network } = useTonNetwork()
const tc = useToncenter(network)

// device clock, ticking
const now = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 1000)
  loadChain()
})
onUnmounted(() => clearInterval(timer))

// chain clock
const chain = ref<ChainClock | null>(null)
const chainAt = ref(0)
const chainLoading = ref(false)
const chainError = ref<unknown>(null)
async function loadChain() {
  chainLoading.value = true
  chainError.value = null
  try {
    const r = await tc.v3<{ last: TcBlock }>('masterchainInfo')
    chain.value = toChainClock(r.last)
    chainAt.value = Math.floor(Date.now() / 1000)
  }
  catch (e) {
    chainError.value = e
  }
  finally {
    chainLoading.value = false
  }
}
watch(network, loadChain)
/** Device clock minus chain clock at fetch time (a few seconds is normal: blocks take time to arrive). */
const drift = computed(() => (chain.value ? chainAt.value - chain.value.genUtime : null))

// converter
const timeText = ref('')
const timeParsed = computed(() => {
  if (!timeText.value.trim()) return null
  try {
    return { ok: true as const, ...parseTime(timeText.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const timeOut = computed(() => (timeParsed.value?.ok ? describeTime(timeParsed.value.unix, now.value) : null))
const KIND_LABEL = { seconds: 'unix seconds', milliseconds: 'milliseconds', microseconds: 'microseconds', date: 'a date' }

// valid_until
const ttl = ref(300)
const base = ref<'device' | 'chain'>('device')
const baseTime = computed(() => (base.value === 'chain' && chain.value ? chain.value.genUtime + (now.value - chainAt.value) : now.value))
const until = computed(() => validUntil(baseTime.value, Math.max(0, ttl.value || 0)))

// lt lookup
const ltText = ref('')
const lt = computed(() => parseLt(ltText.value))
const ltLoading = ref(false)
const ltError = ref<unknown>(null)
const ltBlock = ref<ChainClock | null | 'future'>(null)
async function lookupLt() {
  if (lt.value === null) return
  ltLoading.value = true
  ltError.value = null
  ltBlock.value = null
  try {
    const r = await tc.v3<{ blocks: TcBlock[] }>('blocks', ltBlockQuery(lt.value))
    ltBlock.value = r.blocks[0] ? toChainClock(r.blocks[0]) : 'future'
  }
  catch (e) {
    ltError.value = e
  }
  finally {
    ltLoading.value = false
  }
}
function exampleLt() {
  ltText.value = EXAMPLE_LT.lt
  lookupLt()
}
const utc = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
</script>

<template>
  <div class="space-y-6">
    <!-- CHAIN CLOCK -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-radio-tower" class="size-4 text-primary" /> Chain clock ({{ network }})
          </div>
          <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" label="Refresh" :loading="chainLoading" @click="loadChain" />
        </div>
      </template>
      <ErrorNotice :error="chainError" title="Could not read the latest block" @retry="loadChain" />
      <LoadingState v-if="chainLoading && !chain" label="Reading the latest masterchain block…" />
      <div v-if="chain" class="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
        <ResultField label="Masterchain seqno" :value="String(chain.seqno)" />
        <ResultField label="Block time (gen_utime)" :value="String(chain.genUtime)" :hint="`${utc(chain.genUtime)} · ${relative(chain.genUtime, now)}`" />
        <ResultField label="Your device now" :value="String(now)" :hint="drift === null ? undefined : Math.abs(drift) <= 30 ? `In sync (${Math.abs(drift)} s ${drift < 0 ? 'behind' : 'ahead of'} the last block)` : `Your clock is ${drift > 0 ? 'ahead' : 'behind'} by about ${Math.abs(drift)} s`" />
        <ResultField label="Block lt range" :value="`${chain.startLt}…${chain.endLt}`" :copy="false" />
      </div>
      <UAlert v-if="drift !== null && Math.abs(drift) > 30" class="mt-3" color="warning" variant="subtle" icon="i-lucide-clock-alert" description="A skewed device clock makes valid_until values wrong. Use chain time as the base below, or fix your system clock." />
    </UCard>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- CONVERTER -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-calendar-clock" class="size-4 text-primary" /> Unix time ⇄ date
          </div>
        </template>
        <div class="space-y-3">
          <UFormField label="Timestamp or date" :error="timeParsed && !timeParsed.ok ? timeParsed.error : undefined" :hint="timeParsed?.ok ? `Read as ${KIND_LABEL[timeParsed.kind]}` : 'Dates without a timezone are UTC'">
            <UInput v-model="timeText" placeholder="1781481600 · 1781481600000 · 2026-06-15 12:00" class="w-full" :ui="{ base: 'font-mono' }" data-testid="time-input" />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton size="xs" variant="soft" label="Now" @click="timeText = String(now)" />
            <UButton v-if="chain" size="xs" variant="soft" label="Last block time" @click="timeText = String(chain.genUtime)" />
            <UButton size="xs" variant="soft" :label="`${COIN_SYMBOL} rename day`" @click="timeText = '2026-06-15'" />
          </div>
          <KeyValue
            v-if="timeOut"
            :items="[
              { label: 'Unix seconds', value: timeOut.seconds },
              { label: 'Milliseconds', value: timeOut.milliseconds },
              { label: 'ISO 8601 (UTC)', value: timeOut.iso },
              { label: 'Your local time', value: timeOut.local, mono: false },
              { label: 'Relative', value: timeOut.relative, mono: false, copy: false }
            ]"
          />
        </div>
      </UCard>

      <!-- VALID UNTIL -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-timer" class="size-4 text-primary" /> valid_until builder
          </div>
        </template>
        <div class="space-y-3">
          <p class="text-sm text-muted">
            Wallet contracts reject an external message once the block time passes its <code class="font-mono">valid_until</code>, and TonConnect sends it as <code class="font-mono">validUntil</code>. Keep it short: a signed message that never landed stays valid until then.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton v-for="p in VALID_PRESETS" :key="p.seconds" size="xs" :variant="ttl === p.seconds ? 'solid' : 'soft'" :label="p.label" @click="ttl = p.seconds" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Lifetime (seconds)">
              <UInputNumber v-model="ttl" :min="0" class="w-full" />
            </UFormField>
            <UFormField label="Counted from">
              <USelect v-model="base" :items="[{ label: 'Device clock', value: 'device' }, { label: 'Chain time', value: 'chain', disabled: !chain }]" class="w-full" />
            </UFormField>
          </div>
          <ResultField label="valid_until" :value="String(until)" :hint="`${utc(until)} · ${relative(until, now)}`" data-testid="valid-until" />
          <KeyValue
            :items="[
              { label: 'TonConnect', value: `validUntil: ${until}` },
              { label: 'JavaScript (computed at send time)', value: `Math.floor(Date.now() / 1000) + ${Math.max(0, ttl || 0)}` }
            ]"
          />
        </div>
      </UCard>
    </div>

    <!-- LT -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2 font-medium text-highlighted">
          <UIcon name="i-lucide-list-ordered" class="size-4 text-primary" /> Logical time (lt)
        </div>
      </template>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          <code class="font-mono">lt</code> is not a clock. It is a 64-bit counter that orders events: every transaction and message gets a larger lt than whatever caused it, and each block covers an lt range (they start at multiples of 1,000,000). An account's transactions are identified by (lt, hash). Paste an lt to see roughly when it happened.
        </p>
        <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="lookupLt">
          <UFormField label="lt" class="flex-1" :error="ltText.trim() && lt === null ? 'A whole number (uint64)' : undefined">
            <UInput v-model="ltText" inputmode="numeric" placeholder="111813286000010" class="w-full" :ui="{ base: 'font-mono' }" data-testid="lt-input" />
          </UFormField>
          <UButton type="submit" icon="i-lucide-search" label="When was it?" :loading="ltLoading" :disabled="lt === null" class="justify-center" />
          <UButton variant="soft" label="Example" class="justify-center" @click="exampleLt" />
        </form>
        <ErrorNotice :error="ltError" @retry="lookupLt" />
        <UAlert v-if="ltBlock === 'future'" color="neutral" variant="subtle" icon="i-lucide-info" description="No masterchain block has reached this lt yet: it is in the future (or on the other network)." />
        <div v-else-if="ltBlock" class="grid gap-x-6 sm:grid-cols-2" data-testid="lt-result">
          <ResultField label="Committed around" :value="utc(ltBlock.genUtime)" :hint="`${relative(ltBlock.genUtime, now)} · unix ${ltBlock.genUtime}`" :mono="false" />
          <ResultField label="By masterchain block" :value="String(ltBlock.seqno)" :hint="`The first masterchain block with start_lt ≥ this lt (${ltBlock.startLt})`" />
        </div>
        <p v-if="ltText === EXAMPLE_LT.lt && ltBlock && ltBlock !== 'future'" class="text-xs text-dimmed">
          Example: this lt belongs to a mainnet wallet transaction. <ExplorerLinks kind="tx" :value="EXAMPLE_LT.tx" network="mainnet" />
        </p>
      </div>
    </UCard>
  </div>
</template>
