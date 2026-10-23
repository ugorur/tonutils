<script setup lang="ts">
import type { Address } from '@ton/core'
import { formatJettonAmount } from '~/utils/ton/jetton'
import type { Wrapped } from './logic'
import { cardSvg, loadActivity, periodLabel, wrap, yearRange } from './logic'

const EXAMPLE = { address: 'UQCIyU4WDsGc3jL_5y2bXrNKwiSyiSmyL12YLYQDnWvMRqYo', period: '2026' }

const route = useRoute()
const tc = useToncenter()
const { network, isTestnet } = useTonNetwork()

const thisYear = new Date().getFullYear()
const PERIODS = [
  { label: 'Last 12 months', value: 'last12' },
  ...Array.from({ length: thisYear - 2019 + 1 }, (_, i) => ({ label: String(thisYear - i), value: String(thisYear - i) }))
]

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)
const period = ref(String(thisYear))

const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const result = shallowRef<Wrapped | null>(null)
const friendly = ref('')
let session = 0
let signal = { aborted: false }

function rangeOf(p: string) {
  const now = Math.floor(Date.now() / 1000)
  if (p !== 'last12') return yearRange(Number(p), now)
  // The current month plus the 11 before it, so the card's 12 month bars cover the whole period.
  const d = new Date()
  return { from: Math.floor(new Date(d.getFullYear(), d.getMonth() - 11, 1).getTime() / 1000), to: now }
}

async function run() {
  if (!parsed.value) return
  signal.aborted = true
  signal = { aborted: false }
  const mine = signal
  const my = ++session
  loading.value = true
  progress.value = ''
  error.value = null
  result.value = null
  try {
    const raw = parsed.value.toRawString()
    friendly.value = parsed.value.toString({ bounceable: false, testOnly: isTestnet.value })
    const { from, to } = rangeOf(period.value)
    const data = await loadActivity(tc.v3, raw, from, to, {
      maxPages: 5,
      signal: mine,
      onProgress: (s) => {
        if (my === session) progress.value = s
      }
    })
    if (my === session) result.value = wrap(raw, from, to, data)
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function stop() {
  signal.aborted = true
}

function example() {
  input.value = EXAMPLE.address
  period.value = EXAMPLE.period
  nextTick(run)
}

watch(network, () => {
  signal.aborted = true
  session++
  result.value = null
  loading.value = false
})
onMounted(() => {
  if (input.value) nextTick(run)
})

const svg = computed(() => (result.value ? cardSvg(result.value, friendly.value) : ''))
const svgUrl = computed(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.value)}`)
const fileName = computed(() => `ton-wrapped-${result.value ? periodLabel(result.value.from, result.value.to).replace(/\W+/g, '-') : ''}.png`)

async function pngBlob(): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg.value], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 1080
    c.height = 1350
    c.getContext('2d')!.drawImage(img, 0, 0)
    return await new Promise<Blob>((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'))
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

const saving = ref(false)
const saveError = ref<unknown>(null)
async function downloadPng() {
  saving.value = true
  saveError.value = null
  try {
    const url = URL.createObjectURL(await pngBlob())
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.value
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  catch (e) {
    saveError.value = e
  }
  finally {
    saving.value = false
  }
}

const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
})
async function share() {
  saveError.value = null
  try {
    const file = new File([await pngBlob()], fileName.value, { type: 'image/png' })
    await navigator.share({ files: [file], title: 'My TON Wrapped', text: 'My year on TON, made with tonutils.io' })
  }
  catch (e) {
    if ((e as Error).name !== 'AbortError') saveError.value = e
  }
}

const fmtDay = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-4" @submit.prevent="run">
      <AddressInput v-model="input" label="Wallet address" placeholder="UQ… / EQ… / 0:…" @parsed="parsed = $event" />
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Period">
          <USelect v-model="period" :items="PERIODS" class="w-44" size="lg" />
        </UFormField>
        <UButton type="submit" label="Make my Wrapped" icon="i-lucide-party-popper" size="lg" :loading="loading" :disabled="!parsed" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-1" @click="example" />
      </div>
      <p class="text-xs text-muted">
        Reads up to 5,000 actions and 5,000 transactions from toncenter, about one request per second. Nothing is stored.
      </p>
    </form>

    <div v-if="loading" class="flex flex-wrap items-center gap-3">
      <LoadingState :label="progress || 'Reading your activity…'" />
      <UButton label="Stop and show what's loaded" size="xs" color="neutral" variant="outline" @click="stop" />
    </div>
    <ErrorNotice :error="error" title="Could not load the activity" @retry="run" />

    <template v-if="result">
      <UAlert
        v-if="result.truncated"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Partial period"
        description="This wallet has more activity than we load in one go, or you stopped early. The card covers only the part that was loaded."
      />
      <p v-if="!result.actions" class="text-sm text-muted">
        No activity in this period. Try another year.
      </p>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div class="space-y-3">
          <!-- An <img> never runs script, so on-chain token names in the card cannot inject anything; it also matches the PNG exactly. -->
          <img :src="svgUrl" :alt="`TON Wrapped card for ${periodLabel(result.from, result.to)}`" width="1080" height="1350" class="block h-auto w-full rounded-xl shadow-lg" data-testid="wrapped-card">
          <div class="flex flex-wrap gap-2">
            <UButton label="Download PNG" icon="i-lucide-image-down" :loading="saving" @click="downloadPng" />
            <UButton v-if="canShare" label="Share" icon="i-lucide-share-2" color="neutral" variant="outline" @click="share" />
          </div>
          <ErrorNotice :error="saveError" title="Could not create the image" />
        </div>

        <div class="space-y-5 text-sm">
          <section class="space-y-2" aria-labelledby="aw-overview">
            <h3 id="aw-overview" class="font-display font-semibold text-highlighted">
              Overview
            </h3>
            <AddressLink :address="friendly" />
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt class="text-muted">
                Actions / transactions
              </dt>
              <dd class="font-mono">
                {{ result.actions }} / {{ result.transactions }}
              </dd>
              <dt class="text-muted">
                {{ COIN_SYMBOL }} received
              </dt>
              <dd><TokenAmount :nano="result.gramIn" :max-decimals="4" /></dd>
              <dt class="text-muted">
                {{ COIN_SYMBOL }} sent
              </dt>
              <dd><TokenAmount :nano="result.gramOut" :max-decimals="4" /></dd>
              <dt class="text-muted">
                Fees paid
              </dt>
              <dd><TokenAmount :nano="result.fees" :max-decimals="6" /></dd>
              <dt class="text-muted">
                Balance change
              </dt>
              <dd><TokenAmount :nano="result.netChange" :max-decimals="4" /></dd>
              <dt class="text-muted">
                NFTs bought / sold
              </dt>
              <dd class="font-mono">
                {{ result.nftsBought }} / {{ result.nftsSold }}
              </dd>
              <dt class="text-muted">
                Spent on NFTs
              </dt>
              <dd><TokenAmount :nano="result.nftSpent" :max-decimals="4" /></dd>
              <dt class="text-muted">
                NFTs received / sent
              </dt>
              <dd class="font-mono">
                {{ result.nftsReceived }} / {{ result.nftsSent }}
              </dd>
              <template v-if="result.firstActive">
                <dt class="text-muted">
                  First / last action
                </dt>
                <dd>{{ fmtDay(result.firstActive) }} – {{ fmtDay(result.lastActive!) }}</dd>
              </template>
            </dl>
            <p class="text-xs text-muted">
              {{ COIN_SYMBOL }} received and sent count plain transfers only; swaps and NFT purchases are listed separately. Balance change and fees come from every transaction.
            </p>
          </section>

          <section v-if="result.tokens.length" class="space-y-2" aria-labelledby="aw-tokens">
            <h3 id="aw-tokens" class="font-display font-semibold text-highlighted">
              Top tokens
            </h3>
            <ul class="divide-y divide-default">
              <li v-for="t in result.tokens" :key="t.master" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span class="font-medium">{{ t.symbol }} <span class="text-xs text-muted">· {{ t.uses }} uses</span></span>
                <span class="font-mono text-xs">
                  in {{ formatJettonAmount(t.received, t.decimals, { maxDecimals: 4 }) }} · out {{ formatJettonAmount(t.sent, t.decimals, { maxDecimals: 4 }) }}
                </span>
              </li>
            </ul>
          </section>

          <section v-if="result.counterparties.length" class="space-y-2" aria-labelledby="aw-parties">
            <h3 id="aw-parties" class="font-display font-semibold text-highlighted">
              Top counterparties
            </h3>
            <ul class="divide-y divide-default">
              <li v-for="c in result.counterparties" :key="c.address" class="space-y-1 py-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span v-if="c.domain" class="font-medium">{{ c.domain }}</span>
                  <AddressLink :address="c.friendly" />
                  <span class="text-xs text-muted">{{ c.count }} actions</span>
                </div>
                <div v-if="c.gramIn || c.gramOut" class="text-xs text-muted">
                  from them <TokenAmount :nano="c.gramIn" :max-decimals="2" /> · to them <TokenAmount :nano="c.gramOut" :max-decimals="2" />
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
