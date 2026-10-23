<script setup lang="ts">
import QRCode from 'qrcode'
import { draftFromLink, draftToRequest, emptyDraft } from '~/lib/payments/form'
import { buildLink, formatAsset, requestFromQuery } from '~/lib/payments/link'
import PaymentForm from '~/lib/payments/PaymentForm.vue'
import type { Size, Target, Theme } from './logic'
import { buttonHtml, defaultLabel, markdownLink, previewDoc, TARGETS, targetUrl } from './logic'

const route = useRoute()
const { isTestnet } = useTonNetwork()

const fromQuery = requestFromQuery(route.query)
const draft = ref(fromQuery ? draftFromLink(fromQuery) : emptyDraft())
const title = ref(fromQuery?.extras.label ?? '')
const out = computed(() => draftToRequest(draft.value, { testnet: isTestnet.value }))
const req = computed(() => out.value.request)

const target = ref<Target>('hosted')
const theme = ref<Theme>('blue')
const size = ref<Size>('md')
const pill = ref(false)
const newTab = ref(true)
const withQr = ref(false)
const customLabel = ref('')

const autoLabel = computed(() => defaultLabel(req.value?.amount !== undefined ? formatAsset(req.value!.amount!, out.value.asset) : null, out.value.asset.symbol))
const label = computed(() => customLabel.value.trim() || autoLabel.value)
const href = computed(() => (req.value ? targetUrl(req.value, target.value, { testnet: isTestnet.value, decimals: out.value.asset.decimals, label: title.value.trim() || undefined }) : ''))

// QR of the ton:// link (what wallet scanners read), rendered locally as SVG markup.
const qrSvg = ref('')
watchEffect(async () => {
  const v = withQr.value && req.value ? buildLink(req.value, 'ton') : ''
  qrSvg.value = v ? await QRCode.toString(v, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : ''
})

const html = computed(() => (href.value ? buttonHtml({ href: href.value, label: label.value, theme: theme.value, size: size.value, pill: pill.value, newTab: newTab.value, qrSvg: qrSvg.value || undefined }) : ''))
const markdown = computed(() => (href.value && target.value !== 'ton' ? markdownLink(label.value, href.value) : ''))

const tab = ref('html')
const TABS = computed(() => [
  { label: 'HTML', value: 'html' },
  ...(markdown.value ? [{ label: 'Markdown', value: 'md' }] : []),
  { label: 'Link only', value: 'url' }
])
watch(markdown, (m) => {
  if (!m && tab.value === 'md') tab.value = 'html'
})
const code = computed(() => (tab.value === 'md' ? markdown.value : tab.value === 'url' ? href.value : html.value))

const THEMES = [{ label: 'TON blue', value: 'blue' }, { label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]
const SIZES = [{ label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' }]

function example() {
  draft.value = { ...emptyDraft(), to: 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K', amount: '5', text: 'Donation' }
  title.value = 'Support our project'
}
</script>

<template>
  <div class="space-y-6">
    <PaymentForm v-model="draft" :result="out" comment-hint="Optional" />
    <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example" />

    <section class="space-y-4" aria-labelledby="opt-h">
      <h3 id="opt-h" class="font-display text-sm font-semibold text-highlighted">
        Button
      </h3>
      <UFormField label="The button opens">
        <URadioGroup v-model="target" :items="TARGETS.map(t => ({ label: t.label, value: t.value, description: t.hint }))" data-testid="target" />
      </UFormField>
      <UFormField v-if="target === 'hosted'" label="Checkout page title (optional)" hint="Shown to the payer">
        <UInput v-model="title" class="w-full" size="lg" maxlength="200" placeholder="e.g. Support our project" />
      </UFormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Button text">
          <UInput v-model="customLabel" class="w-full" size="lg" maxlength="60" :placeholder="autoLabel" data-testid="button-label" />
        </UFormField>
        <UFormField label="Style">
          <div class="flex flex-wrap gap-2">
            <UTabs v-model="theme" :items="THEMES" :content="false" size="sm" />
            <UTabs v-model="size" :items="SIZES" :content="false" size="sm" />
          </div>
        </UFormField>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <USwitch v-model="pill" label="Pill shape" />
        <USwitch v-model="newTab" label="Open in a new tab" />
        <USwitch v-model="withQr" label="Show a QR code above the button" data-testid="with-qr" />
      </div>
    </section>

    <section v-if="html" class="space-y-4" aria-labelledby="prev-h" data-testid="button-result">
      <h3 id="prev-h" class="font-display text-sm font-semibold text-highlighted">
        Preview
      </h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <iframe
          v-for="dark in [false, true]"
          :key="String(dark)"
          :title="`Button preview on a ${dark ? 'dark' : 'light'} page`"
          :srcdoc="previewDoc(html, dark)"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          class="w-full rounded-lg border border-default"
          :class="withQr ? 'h-72' : 'h-32'"
          data-testid="preview"
        />
      </div>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UTabs v-model="tab" :items="TABS" :content="false" size="sm" />
          <CopyButton :value="code" label="Copy code" />
        </div>
        <pre class="max-h-72 overflow-auto rounded-lg border border-default bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap" data-testid="snippet">{{ code }}</pre>
        <p class="text-xs text-muted">
          Plain HTML with inline styles: no script, no tracking, nothing loaded from TonUtils except the checkout page when someone clicks it. Paste it into any site builder that accepts HTML.
          <template v-if="target === 'ton'">
            GitHub and many forums strip ton:// links, so Markdown is offered only for https links.
          </template>
        </p>
      </div>
    </section>
    <p v-else-if="!draft.to.trim()" class="text-sm text-muted">
      Enter the address that should receive payments to get your button.
    </p>
  </div>
</template>
