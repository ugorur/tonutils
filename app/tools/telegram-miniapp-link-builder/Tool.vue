<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { ChatType, LinkKind, Mode, PayloadFormat } from './logic'
import { buildLinks, inspectParam, LINK_KINDS, makeParam, paramLimit, parseLink } from './logic'

const tab = ref<'build' | 'decode'>('build')

// ---------------------------------------------------------------- build
const kind = ref<LinkKind>('direct')
const bot = ref('')
const app = ref('')
const mode = ref<Mode | 'default'>('default')
const choose = ref<ChatType[]>([])
const format = ref<PayloadFormat>('raw')
const payload = ref('')

const param = computed(() => {
  if (!payload.value.trim()) return { value: '', error: null as string | null }
  try {
    return { value: makeParam(payload.value, format.value), error: null }
  }
  catch {
    return { value: '', error: format.value === 'json' ? 'Not valid JSON.' : 'Could not encode the payload.' }
  }
})
const built = computed(() => (bot.value.trim() ? buildLinks({ kind: kind.value, bot: bot.value, app: app.value, param: param.value.value, mode: mode.value === 'default' ? '' : mode.value, choose: choose.value }) : null))
const ok = computed(() => built.value && !built.value.errors.length && !param.value.error)
const kindHint = computed(() => LINK_KINDS.find(k => k.value === kind.value)?.hint)
const opensMiniApp = computed(() => kind.value !== 'start')
const twaReturnUrl = computed(() => {
  if (!ok.value || (kind.value !== 'direct' && kind.value !== 'main')) return ''
  const base = built.value!.https.split('?')[0]!
  return kind.value === 'main' ? `${base}?startapp` : base // a bare t.me/<bot> opens the chat, not the Mini App
})
const snippet = computed(() => `// In the Mini App
const startParam = window.Telegram.WebApp.initDataUnsafe.start_param
// also in the launch URL: ?tgWebAppStartParam=…${format.value === 'raw'
  ? ''
  : `
const bytes = Uint8Array.from(atob(startParam.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const decoded = ${format.value === 'json' ? 'JSON.parse(new TextDecoder().decode(bytes))' : 'new TextDecoder().decode(bytes)'}`}
// Verify initData on your server before trusting it (see the initData validator).`)

const CHAT_TYPES: ChatType[] = ['users', 'bots', 'groups', 'channels']
function toggleChoose(t: ChatType) {
  choose.value = choose.value.includes(t) ? choose.value.filter(x => x !== t) : [...choose.value, t]
}
function example() {
  kind.value = 'direct'
  bot.value = 'DemoDappWithTonConnectBot'
  app.value = 'demo'
  mode.value = 'default'
  format.value = 'json'
  payload.value = '{"ref":"tonutils","item":42}'
}

// ---------------------------------------------------------------- decode
const decodeInput = ref('')
const decoded = computed(() => {
  const s = decodeInput.value.trim()
  if (!s) return null
  const link = parseLink(s)
  if (!link && !/^[\w-]+$/.test(s)) return { error: 'Paste a t.me or tg://resolve link, or a start parameter (A–Z, a–z, 0–9, _ and - only).' }
  const p = link ? link.param : s
  return { link, param: p, inspect: p ? inspectParam(p) : null }
})
const decodedItems = computed<KeyValueItem[]>(() => {
  const d = decoded.value
  if (!d || 'error' in d) return []
  const rows: KeyValueItem[] = []
  if (d.link) {
    rows.push({ label: 'Link type', value: LINK_KINDS.find(k => k.value === d.link!.kind)?.label ?? 'Bot or channel link', copy: false, mono: false })
    rows.push({ label: 'Bot', value: `@${d.link.bot}` })
    if (d.link.app) rows.push({ label: 'Mini App short name', value: d.link.app })
    if (d.link.mode) rows.push({ label: 'Mode', value: d.link.mode, copy: false })
  }
  rows.push({ label: 'Start parameter', value: d.param ?? '', hint: d.param ? `${d.param.length} characters` : 'None' })
  if (d.inspect?.text != null) rows.push({ label: 'Decoded (base64url → UTF-8)', value: d.inspect.text, mono: false })
  return rows
})
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="tab"
      :content="false"
      :items="[{ label: 'Build a link', value: 'build', icon: 'i-lucide-link' }, { label: 'Decode a link', value: 'decode', icon: 'i-lucide-search' }]"
      class="w-full"
    />

    <div v-if="tab === 'build'" class="space-y-6">
      <div class="space-y-4">
        <UFormField label="Link type" :hint="kindHint">
          <USelect v-model="kind" :items="LINK_KINDS.map(k => ({ label: k.label, value: k.value }))" class="w-full" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Bot username">
            <UInput v-model="bot" placeholder="@my_bot" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" />
          </UFormField>
          <UFormField v-if="kind === 'direct'" label="Mini App short name" hint="From @BotFather /newapp">
            <UInput v-model="app" placeholder="app" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" />
          </UFormField>
          <UFormField v-if="kind === 'direct' || kind === 'main'" label="Open as">
            <USelect v-model="mode" :items="[{ label: 'Default', value: 'default' }, { label: 'Compact (half screen)', value: 'compact' }, { label: 'Full screen', value: 'fullscreen' }]" class="w-full" />
          </UFormField>
        </div>
        <UFormField v-if="kind === 'attach'" label="Let the user pick a chat" hint="Optional: opens a chat picker first">
          <div class="flex flex-wrap gap-2">
            <UButton v-for="t in CHAT_TYPES" :key="t" :label="t" size="sm" :variant="choose.includes(t) ? 'solid' : 'outline'" color="neutral" @click="toggleChoose(t)" />
          </div>
        </UFormField>

        <div class="space-y-2">
          <div class="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <UFormField label="Payload is">
              <USelect v-model="format" :items="[{ label: 'Ready parameter', value: 'raw' }, { label: 'Text → base64url', value: 'text' }, { label: 'JSON → base64url', value: 'json' }]" class="w-full" />
            </UFormField>
            <UFormField :label="format === 'raw' ? 'Start parameter' : format === 'json' ? 'JSON payload' : 'Text payload'" :error="param.error ?? undefined" :hint="`Optional · up to ${paramLimit(kind)} characters after encoding`">
              <UTextarea v-model="payload" :rows="2" autoresize :maxrows="6" class="w-full" :ui="{ base: 'font-mono text-sm' }" :placeholder="format === 'json' ? '{&quot;ref&quot;: &quot;friend123&quot;}' : format === 'text' ? 'any text, emoji, …' : 'ref_friend123'" spellcheck="false" />
            </UFormField>
          </div>
          <div class="flex flex-wrap gap-x-4">
            <UButton label="Try the TonConnect demo app" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
          </div>
        </div>
      </div>

      <template v-if="built">
        <UAlert v-for="e in built.errors" :key="e" color="error" variant="subtle" icon="i-lucide-circle-x" :title="e" />
        <UAlert v-for="w in built.warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="w" />

        <div v-if="ok" class="grid gap-6 md:grid-cols-[1fr_auto]">
          <div class="min-w-0">
            <div class="divide-y divide-default">
              <ResultField label="Link" :value="built.https" hint="Share this. Opens in Telegram on any device.">
                <a :href="built.https" target="_blank" rel="noopener" class="hover:text-primary">{{ built.https }}</a>
              </ResultField>
              <ResultField label="tg:// link" :value="built.tg" hint="For buttons inside other apps; skips the browser." />
              <ResultField v-if="param.value && format !== 'raw'" label="Start parameter" :value="param.value" :hint="`${param.value.length} / ${paramLimit(kind)} characters`" />
              <ResultField v-if="twaReturnUrl" label="TonConnect twaReturnUrl" :value="twaReturnUrl" hint="Set as actionsConfiguration.twaReturnUrl in TonConnect UI so the wallet returns the user to this Mini App." />
            </div>
          </div>
          <div class="flex flex-col items-center gap-1">
            <QrCode :value="built.https" :size="180" />
            <span class="text-xs text-muted">Scan with a phone camera</span>
          </div>
        </div>

        <div v-if="ok && opensMiniApp" class="space-y-1">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Reading it in your Mini App
          </h3>
          <div class="relative rounded-md border border-default bg-muted">
            <CopyButton :value="snippet" size="xs" class="absolute top-1.5 right-1.5" />
            <pre class="overflow-auto p-3 pr-10 font-mono text-xs">{{ snippet }}</pre>
          </div>
        </div>
      </template>
      <p v-else class="text-sm text-muted">
        Enter your bot's username to build the link.
      </p>
    </div>

    <div v-else class="space-y-4">
      <UFormField label="Link or start parameter">
        <UTextarea v-model="decodeInput" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="https://t.me/my_bot/app?startapp=… or eyJyZWYiOjQyfQ" spellcheck="false" />
      </UFormField>
      <UButton label="Try a link" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="decodeInput = 'https://t.me/DemoDappWithTonConnectBot/demo?startapp=eyJyZWYiOiJ0b251dGlscyIsIml0ZW0iOjQyfQ&mode=compact'" />
      <template v-if="decoded">
        <UAlert v-if="'error' in decoded" color="error" variant="subtle" icon="i-lucide-circle-x" :title="decoded.error" />
        <template v-else>
          <KeyValue :items="decodedItems" />
          <JsonView v-if="decoded.inspect?.json !== undefined" :value="decoded.inspect.json" label="Decoded JSON" />
          <p v-if="decoded.param && decoded.inspect?.text == null" class="text-sm text-muted">
            The parameter is not base64url text, so the Mini App receives it exactly as shown.
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
