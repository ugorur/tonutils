<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { checkUrl } from '~/lib/jettons-dev/fetchCheck'
import CheckList from '~/lib/security-signing/CheckList.vue'
import type { CheckState } from '~/lib/security-signing/proof'
import type { DecodedLink, Finding, ManifestReport, Severity } from './logic'
import { analyzeManifest, parseConnectLink, sortFindings, verdict } from './logic'

const ID = '8d6e7c0f7a1b4b3a9e2f5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f'
const stonReq = encodeURIComponent(JSON.stringify({ manifestUrl: 'https://app.ston.fi/tonconnect-manifest.json', items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'example-nonce' }] }))
const demoReq = encodeURIComponent(JSON.stringify({ manifestUrl: 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json', items: [{ name: 'ton_addr' }] }))
// Embedded sendTransaction (deeplinks.md wire format): 0.005 to the address the official TonConnect demo dApp uses.
const demoTx = btoa(JSON.stringify({ m: 'st', vu: 1893456000, ms: [{ a: 'EQCKWpx7cNMpvmcN5ObM5lLUZHZRFKqYA4xmw9jOry0ZsF9M', am: '5000000' }] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
// Same as @tonconnect/sdk encodeTelegramUrlParameters.
const tgEncode = (qs: string) => qs.replaceAll('.', '%2E').replaceAll('-', '%2D').replaceAll('_', '%5F').replaceAll('&', '-').replaceAll('=', '__').replaceAll('%', '--')
const EXAMPLES = [
  { label: 'STON.fi QR (tc://)', value: `tc://?v=2&id=${ID}&r=${stonReq}&ret=none` },
  { label: 'Telegram Wallet link', value: `https://t.me/wallet/start?startapp=tonconnect-${tgEncode(`v=2&id=${ID}&r=${stonReq}`)}` },
  { label: 'Link with a hidden transaction', value: `https://app.tonkeeper.com/ton-connect?v=2&id=${ID}&r=${demoReq}&ret=back&e=${demoTx}` }
]

const input = ref('')
const decoded = computed<{ link: DecodedLink | null, error: unknown }>(() => {
  if (!input.value.trim()) return { link: null, error: null }
  try {
    return { link: parseConnectLink(input.value), error: null }
  }
  catch (e) {
    return { link: null, error: e }
  }
})
const link = computed(() => decoded.value.link)

const manifestLoading = ref(false)
const manifestError = ref<unknown>(null)
const manifest = shallowRef<ManifestReport | null>(null)

async function loadManifest() {
  const url = link.value?.request.manifestUrl
  manifest.value = null
  manifestError.value = null
  if (!url || !/^https?:\/\//i.test(url)) return
  manifestLoading.value = true
  try {
    const check = await checkUrl(url)
    if (url === link.value?.request.manifestUrl) manifest.value = analyzeManifest(url, check)
  }
  catch (e) {
    manifestError.value = e
  }
  finally {
    manifestLoading.value = false
  }
}
watch(() => link.value?.request.manifestUrl, loadManifest)

const findings = computed<Finding[]>(() => sortFindings([...(link.value?.findings ?? []), ...(manifest.value?.findings ?? [])]))
const STATE: Record<Severity, CheckState> = { danger: 'fail', warn: 'warn', info: 'info', ok: 'pass' }
const checkItems = computed(() => findings.value.map(f => ({ label: f.title, state: STATE[f.severity], detail: f.detail })))

const banner = computed(() => {
  if (!link.value) return null
  const v = verdict(findings.value)
  const app = manifest.value?.manifest ? `"${manifest.value.manifest.name}" (${manifest.value.appHost})` : 'this app'
  if (v === 'danger') return { color: 'error' as const, icon: 'i-lucide-octagon-alert', title: 'Do not connect unless you are sure', text: 'This link shows strong signs of phishing or asks for more than a connection. Read the red items below.' }
  if (v === 'warn') return { color: 'warning' as const, icon: 'i-lucide-triangle-alert', title: 'Check the warnings first', text: `Connect only if you opened this link yourself on ${app}'s real website.` }
  if (manifestLoading.value) return null
  return { color: 'success' as const, icon: 'i-lucide-shield-check', title: 'No red flags found', text: `A plain connection request from ${app}. Still connect only if you got it from that site yourself: anyone can copy a real app's manifest.` }
})

const FORMS: Record<DecodedLink['form'], string> = {
  'tc': 'Unified tc:// link (any wallet)',
  'universal': 'Wallet universal link',
  'custom-scheme': 'Wallet app scheme',
  'telegram': 'Telegram Mini App link',
  'json': 'ConnectRequest JSON'
}
const WALLETS: Record<string, string> = { 'app.tonkeeper.com/ton-connect': 'Tonkeeper', 'connect.mytonwallet.org': 'MyTonWallet', 't.me/wallet': 'Wallet in Telegram', 'tonkeeper-tc://': 'Tonkeeper app' }
const linkRows = computed<KeyValueItem[]>(() => {
  const l = link.value
  if (!l) return []
  const rows: KeyValueItem[] = [{ label: 'Link type', value: FORMS[l.form], mono: false, copy: false }]
  if (l.opensIn) rows.push({ label: 'Opens in', value: WALLETS[l.opensIn] ? `${WALLETS[l.opensIn]} (${l.opensIn})` : l.opensIn, mono: false, copy: false })
  rows.push({ label: 'Manifest URL', value: l.request.manifestUrl, hint: 'The wallet loads the app name, icon and domain from here' })
  if (l.ret) rows.push({ label: 'After approval', value: l.ret === 'back' ? 'back: return to the app' : l.ret === 'none' ? 'none: stay in the wallet' : l.ret, mono: l.ret !== 'back' && l.ret !== 'none' })
  if (l.clientId) rows.push({ label: 'Session key (id)', value: l.clientId, hint: 'One-time public key of the app\'s bridge session' })
  if (l.traceId) rows.push({ label: 'Trace id', value: l.traceId })
  return rows
})

const manifestRows = computed<KeyValueItem[]>(() => {
  const m = manifest.value?.manifest
  if (!m) return []
  return [
    { label: 'App name', value: m.name ?? '—', mono: false },
    { label: 'App URL', value: m.url ?? '—' },
    { label: 'Icon URL', value: m.iconUrl ?? '—' },
    ...(m.termsOfUseUrl ? [{ label: 'Terms of use', value: m.termsOfUseUrl }] : []),
    ...(m.privacyPolicyUrl ? [{ label: 'Privacy policy', value: m.privacyPolicyUrl }] : [])
  ]
})

const embeddedMessages = computed<TonConnectMessage[]>(() => (link.value?.embedded?.messages ?? []).map(m => ({ address: m.address, amount: m.amount, payload: m.payload, stateInit: m.stateInit })))
const fmtTime = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function example(v: string) {
  input.value = v
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <UFormField label="TonConnect link" hint="tc://, https://… or t.me/…">
        <UTextarea
          v-model="input"
          :rows="3"
          autoresize
          :maxrows="8"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="tc://?v=2&id=…&r=%7B%22manifestUrl%22…"
          spellcheck="false"
          data-testid="link-input"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
      <details class="group rounded-md border border-default">
        <summary class="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-highlighted">
          Have a QR code instead? Scan or upload it
          <UIcon name="i-lucide-chevron-down" class="size-4 transition group-open:rotate-180" />
        </summary>
        <div class="border-t border-default p-4">
          <QrScan @result="input = $event" />
        </div>
      </details>
      <p class="text-xs text-muted">
        The link is decoded in your browser. Opening this page never connects your wallet. To read the manifest, its URL is fetched once through the TonUtils URL checker (most manifests block direct browser reads).
      </p>
    </div>

    <ErrorNotice :error="decoded.error" title="Not a TonConnect link" />

    <template v-if="link">
      <UAlert v-if="banner" :color="banner.color" variant="subtle" :icon="banner.icon" :title="banner.title" :description="banner.text" data-testid="verdict" />
      <LoadingState v-if="manifestLoading" label="Reading the app manifest…" />
      <ErrorNotice :error="manifestError" title="Could not check the manifest" @retry="loadManifest" />

      <section class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Findings
        </h3>
        <CheckList :checks="checkItems" />
      </section>

      <section v-if="link.embedded" class="space-y-3 rounded-lg border border-error/40 p-4" data-testid="embedded">
        <h3 class="font-display text-sm font-semibold text-error">
          Hidden request: {{ link.embedded.method }}
        </h3>
        <p class="text-sm text-muted">
          <template v-if="link.embedded.validUntil">
            Valid until {{ fmtTime(link.embedded.validUntil) }}.
          </template>
          <template v-if="link.embedded.network">
            Network {{ link.embedded.network === '-239' ? 'mainnet' : link.embedded.network === '-3' ? 'testnet' : link.embedded.network }}.
          </template>
          <template v-if="link.embedded.from">
            From {{ link.embedded.from }}.
          </template>
        </p>
        <TxPreview v-if="embeddedMessages.length" :messages="embeddedMessages" />
        <div v-for="(it, i) in link.embedded.items ?? []" :key="i" class="rounded-md border border-default p-3">
          <UBadge color="warning" variant="subtle" :label="it.type === 'nft' ? 'NFT transfer' : it.type === 'jetton' ? 'Jetton transfer' : `${it.type} item`" />
          <KeyValue :items="it.fields.map(f => ({ label: f.label, value: f.value }))" />
        </div>
        <KeyValue
          v-if="link.embedded.signData"
          :items="[
            { label: 'Data type', value: link.embedded.signData.type, mono: false, copy: false },
            ...(link.embedded.signData.text !== undefined ? [{ label: 'Text to sign', value: link.embedded.signData.text, mono: false }] : []),
            ...(link.embedded.signData.bytes ? [{ label: 'Bytes (base64)', value: link.embedded.signData.bytes }] : []),
            ...(link.embedded.signData.schema ? [{ label: 'TL-B schema', value: link.embedded.signData.schema }] : []),
            ...(link.embedded.signData.cell ? [{ label: 'Cell (BOC)', value: link.embedded.signData.cell }] : [])
          ]"
        />
      </section>

      <section v-if="manifestRows.length">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          What your wallet will show
        </h3>
        <KeyValue :items="manifestRows" />
      </section>

      <section>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Link details
        </h3>
        <KeyValue :items="linkRows" />
      </section>

      <JsonView :value="link.request" label="Connect request (r=)" />
    </template>
  </div>
</template>
