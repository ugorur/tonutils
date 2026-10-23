<script setup lang="ts">
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { VanityMatch, VanityMode, VanityOptions, VanityVersion } from './logic'
import type { handlers } from './vanity.worker'
import { mnemonicWordList } from '@ton/crypto'
import { workerClient } from '~/utils/lazy/rpc'
import { expectedTries, normalizePrefix, patternError, supportsEd25519, WALLET_CODE } from './logic'

// Rough per-thread speeds, for the estimate shown before a run (replaced by the measured speed while running).
const TYPICAL_RATE: Record<VanityMode, number> = { key: 7000, mnemonic: 8 }

const { network } = useTonNetwork()
const mode = ref<VanityMode>('mnemonic')
const prefixInput = ref('')
const suffix = ref('')
const matchCase = ref(false)
const versionChoice = ref<'v5r1' | 'v4r2' | 'both'>('v5r1')
const bounceable = ref(false)
const cores = import.meta.client ? navigator.hardwareConcurrency || 4 : 4
const threads = ref(Math.max(1, cores - 1))

const prefix = computed(() => normalizePrefix(prefixInput.value))
const versions = computed<VanityVersion[]>(() => versionChoice.value === 'both' ? ['v5r1', 'v4r2'] : [versionChoice.value])
const invalid = computed(() => prefix.value || suffix.value ? patternError(prefix.value, suffix.value, matchCase.value) : null)
const expected = computed(() => invalid.value || (!prefix.value && !suffix.value) ? null : expectedTries(prefix.value, suffix.value, matchCase.value, versions.value.length))

const running = ref(false)
const tried = ref(0)
const elapsed = ref(0)
// Each result keeps the network and pattern it was found with, so later edits do not relabel it.
type Found = VanityMatch & { network: TonNetwork, pre: number, suf: number }
const found = ref<Found[]>([])
const error = ref<unknown>(null)
const revealed = ref(new Set<string>())
let clients: ReturnType<typeof workerClient<typeof handlers>>[] = []
let started = 0
let ticker: ReturnType<typeof setInterval> | undefined

const speed = computed(() => elapsed.value > 1 ? tried.value / elapsed.value : threads.value * TYPICAL_RATE[mode.value])
// A new run starts from zero, so only a running search counts what it has tried.
const eta = computed(() => expected.value ? Math.max(0, expected.value - (running.value ? tried.value : 0)) / speed.value : 0)
const chanceSoFar = computed(() => expected.value ? 1 - Math.exp(-tried.value / expected.value) : 0)

function duration(s: number): string {
  if (!Number.isFinite(s)) return 'forever'
  if (s < 1) return 'under a second'
  const units: [number, string][] = [[31557600, 'year'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]
  const [size, name] = units.find(([u]) => s >= u)!
  const n = s / size
  if (n > 1e6) return `${n.toExponential(1)} ${name}s`
  const r = n < 10 ? Math.round(n * 10) / 10 : Math.round(n)
  return `${r.toLocaleString('en-US')} ${name}${r === 1 ? '' : 's'}`
}
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

async function start() {
  error.value = null
  if (!(await supportsEd25519())) {
    error.value = new Error('This browser has no Ed25519 in WebCrypto. Use a current Chrome, Edge, Firefox or Safari.')
    return
  }
  const opts: VanityOptions = {
    mode: mode.value,
    versions: versions.value,
    testnet: network.value === 'testnet',
    bounceable: bounceable.value,
    prefix: prefix.value,
    suffix: suffix.value,
    caseSensitive: matchCase.value,
    wordlist: mode.value === 'mnemonic' ? [...mnemonicWordList] : undefined
  }
  tried.value = 0
  elapsed.value = 0
  running.value = true
  started = Date.now()
  ticker = setInterval(() => {
    elapsed.value = (Date.now() - started) / 1000
  }, 250)
  clients = Array.from({ length: threads.value }, () =>
    workerClient<typeof handlers>(() => new Worker(new URL('./vanity.worker.ts', import.meta.url), { type: 'module' })))
  await Promise.all(clients.map(async (c) => {
    while (running.value) {
      try {
        const r = await c.call('searchSlice', opts, 1000)
        tried.value += r.tried
        if (r.found.length && running.value) {
          found.value.unshift(...r.found.map(m => ({ ...m, network: opts.testnet ? 'testnet' as const : 'mainnet' as const, pre: opts.prefix.length, suf: opts.suffix.length })))
          stop()
        }
      }
      catch (e) {
        if (running.value) {
          error.value = e
          stop()
        }
      }
    }
  }))
}

function stop() {
  running.value = false
  clearInterval(ticker)
  elapsed.value = (Date.now() - started) / 1000
  for (const c of clients) c.terminate()
  clients = []
}

function reset() {
  stop()
  found.value = []
  tried.value = 0
  elapsed.value = 0
  revealed.value = new Set()
}

watch([mode, prefix, suffix, matchCase, versionChoice, bounceable, network], () => {
  if (running.value) stop()
  tried.value = 0
  elapsed.value = 0
})
onBeforeUnmount(reset)

function toggleReveal(key: string) {
  const s = new Set(revealed.value)
  if (!s.delete(key)) s.add(key)
  revealed.value = s
}

function parts(m: Found) {
  const a = m.address
  const p = m.pre
  const s = m.suf
  return { flag: a.slice(0, 2), pre: a.slice(2, 2 + p), mid: a.slice(2 + p, a.length - s), suf: a.slice(a.length - s) }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="The result is a real wallet key"
      description="Keys are generated by your browser's secure random generator, in this tab only; nothing is sent or saved. Write the result down before closing the page. Anyone who sees it owns the wallet."
    />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Starts with" hint="after the UQ / EQ">
        <UInput v-model="prefixInput" placeholder="e.g. Dog" class="w-full font-mono" autocomplete="off" spellcheck="false" :disabled="running" />
      </UFormField>
      <UFormField label="Ends with">
        <UInput v-model="suffix" placeholder="e.g. GRAM" class="w-full font-mono" autocomplete="off" spellcheck="false" :disabled="running" />
      </UFormField>
    </div>
    <p class="-mt-3 text-xs text-dimmed">
      A wallet address looks like <span class="font-mono">UQ<b class="text-default">D</b>YW_1eSc…JqRRyQx</span>. The first two characters
      are fixed and the third is always A, B, C or D, so a prefix starts there. Every extra character makes the search about 64 times longer
      (about 32 times with "match case" off).
    </p>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="What you get" class="min-w-0">
        <URadioGroup
          v-model="mode"
          :disabled="running"
          :items="[
            { label: '24-word phrase', value: 'mnemonic', description: 'Imports into any TON wallet app. Slow: each phrase costs 100 000 hashing rounds.' },
            { label: 'Private key', value: 'key', description: 'About a thousand times faster, for scripts and SDKs. Most wallet apps only import phrases.' }
          ]"
        />
      </UFormField>
      <div class="min-w-0 space-y-4">
        <UFormField label="Wallet version">
          <USelect
            v-model="versionChoice"
            class="w-full"
            :disabled="running"
            :items="[
              { label: 'W5 (v5R1), what wallet apps create today', value: 'v5r1' },
              { label: 'Wallet v4R2', value: 'v4r2' },
              { label: 'Either (twice as fast)', value: 'both' }
            ]"
          />
        </UFormField>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <USwitch v-model="matchCase" label="Match case" size="sm" :disabled="running" />
          <USwitch v-model="bounceable" label="Bounceable form (EQ…)" size="sm" :disabled="running" />
        </div>
        <UFormField :label="`Threads: ${threads} of ${cores}`">
          <USlider v-model="threads" :min="1" :max="cores" :disabled="running" />
        </UFormField>
      </div>
    </div>

    <UAlert v-if="invalid" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="invalid" />

    <div v-if="expected" class="rounded-lg border border-default p-4">
      <div class="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <div class="text-xs text-muted">
            Expected tries
          </div>
          <div class="font-mono text-highlighted">
            {{ fmt(expected) }}
          </div>
        </div>
        <div>
          <div class="text-xs text-muted">
            {{ elapsed > 1 ? 'Speed' : 'Typical speed' }}
          </div>
          <div class="font-mono text-highlighted">
            {{ speed < 100 ? speed.toFixed(1) : fmt(speed) }} {{ mode === 'key' ? 'keys' : 'phrases' }}/s
          </div>
        </div>
        <div>
          <div class="text-xs text-muted">
            {{ running ? 'Expected time left' : 'Expected time' }}
          </div>
          <div class="font-mono text-highlighted" data-testid="eta">
            {{ duration(eta) }}
          </div>
        </div>
      </div>
      <div v-if="tried" class="mt-3 space-y-1">
        <UProgress :model-value="Math.round(chanceSoFar * 100)" size="sm" />
        <div class="text-xs text-muted" data-testid="progress">
          {{ fmt(tried) }} tried in {{ duration(elapsed) }}. Chance to have found one by now: {{ Math.round(chanceSoFar * 100) }}%.
          It is random: it can take much more or less than expected.
        </div>
      </div>
      <UAlert
        v-if="!running && eta > 86400"
        class="mt-3"
        color="warning"
        variant="subtle"
        icon="i-lucide-hourglass"
        title="This would take more than a day"
        :description="mode === 'mnemonic' ? 'Try fewer characters, turn off match case, or choose either wallet version.' : 'Try fewer characters or turn off match case.'"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="!running"
        :label="found.length ? 'Find another' : 'Start search'"
        icon="i-lucide-play"
        size="lg"
        :disabled="!expected"
        @click="start"
      />
      <UButton v-else label="Stop" icon="i-lucide-circle-stop" color="neutral" size="lg" @click="stop" />
      <UButton v-if="found.length && !running" label="Clear results" icon="i-lucide-eraser" color="neutral" variant="ghost" size="lg" @click="reset" />
    </div>

    <ErrorNotice :error="error" title="Search stopped" />

    <section v-for="m in found" :key="m.publicKey + m.version" class="space-y-3 rounded-xl border border-primary/50 p-4" aria-label="Found wallet">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :label="WALLET_CODE[m.version].label" variant="subtle" />
        <UBadge :label="m.network" color="neutral" variant="subtle" />
      </div>
      <ResultField label="Address" :value="m.address">
        <span data-testid="found-address">{{ parts(m).flag }}<mark class="rounded bg-primary/20 text-highlighted">{{ parts(m).pre }}</mark>{{ parts(m).mid }}<mark class="rounded bg-primary/20 text-highlighted">{{ parts(m).suf }}</mark></span>
        <div class="mt-1 font-sans">
          <ExplorerLinks :value="m.address" :network="m.network" />
        </div>
      </ResultField>

      <template v-if="m.mnemonic">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-highlighted">Seed phrase</span>
          <UButton
            :label="revealed.has(m.publicKey) ? 'Hide' : 'Reveal'"
            :icon="revealed.has(m.publicKey) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            size="xs"
            color="warning"
            variant="soft"
            @click="toggleReveal(m.publicKey)"
          />
          <CopyButton :value="m.mnemonic.join(' ')" label="Copy phrase" size="xs" />
        </div>
        <ol class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-default bg-(--ui-border) sm:grid-cols-4" aria-label="Seed phrase, 24 words in order">
          <li v-for="(w, j) in m.mnemonic" :key="j" class="flex items-baseline gap-2 bg-default px-3 py-1.5">
            <span class="w-5 text-right font-mono text-xs text-dimmed tabular-nums">{{ j + 1 }}</span>
            <span class="font-mono text-sm text-highlighted" :class="!revealed.has(m.publicKey) && 'blur-sm select-none'">{{ w }}</span>
          </li>
        </ol>
        <p class="text-xs text-muted">
          Import it in Tonkeeper, MyTonWallet or another TON wallet and pick {{ WALLET_CODE[m.version].label }} if the app asks for a version.
        </p>
      </template>
      <template v-else>
        <ResultField
          label="Private key (32-byte ed25519 seed, hex)"
          :value="revealed.has(m.publicKey) ? m.privateKey : ''"
          :copy="revealed.has(m.publicKey)"
          hint="Load it with keyPairFromSeed(Buffer.from(hex, 'hex')) from @ton/crypto. Most wallet apps cannot import a raw key."
        >
          <span v-if="!revealed.has(m.publicKey)" class="font-sans">
            <UButton label="Reveal private key" size="xs" color="warning" variant="soft" icon="i-lucide-eye" @click="toggleReveal(m.publicKey)" />
          </span>
        </ResultField>
      </template>
      <ResultField label="Public key (hex)" :value="m.publicKey" />
    </section>
  </div>
</template>
