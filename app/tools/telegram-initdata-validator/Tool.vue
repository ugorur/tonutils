<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { HashCheck, TelegramEnv } from './logic'
import { ageSeconds, botIdFromToken, checkHash, checkSignature, dataCheckString, normalizeInitData, parseFields } from './logic'

// Real Telegram-signed initData for a public test bot (from the @tma.js init-data test fixtures, which publish
// that bot's token too). Its Ed25519 signature can be checked with the bot ID alone.
const EXAMPLE = {
  initData: 'user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%20%2B%20-%20%3F%20%5C%2F%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2F4FPEE4tmP3ATHa57u6MqTDih13LTOiMoKoLDRG4PnSA.svg%22%7D&chat_instance=8134722200314281151&chat_type=private&auth_date=1733584787&signature=zL-ucjNyREiHDE8aihFwpfR9aggP2xiAo3NSpfe-p7IbCisNlDKlo7Kb6G4D0Ao2mBrSgEk4maLSdv6MLIlADQ&hash=2174df5b000556d044f3f020384e879c8efcab55ddea2ced4eb752e93e7080d6',
  botId: '7342037359',
  token: '7342037359:AAFZehRPBRs8Seg40oDjTMIW8uTGPuW1zfQ'
}

const input = ref('')
const token = ref('')
const showToken = ref(false)
const botIdInput = ref('')
const env = ref<TelegramEnv>('production')
const maxAge = ref(86400)

const raw = computed(() => normalizeInitData(input.value))
const tokenBotId = computed(() => botIdFromToken(token.value))
const botId = computed(() => tokenBotId.value ?? (/^\d{5,20}$/.test(botIdInput.value.trim()) ? Number(botIdInput.value.trim()) : null))
const fields = computed(() => (raw.value ? parseFields(raw.value) : null))
const hasHash = computed(() => !!raw.value && new URLSearchParams(raw.value).has('hash'))

const hash = shallowRef<HashCheck | null>(null)
watch([raw, token], async ([r, t]) => {
  hash.value = null
  if (!r || !t.trim()) return
  const res = await checkHash(r, t)
  if (r === raw.value && t === token.value) hash.value = res // ignore stale results
}, { immediate: true })

const signature = computed(() => (raw.value && botId.value ? checkSignature(raw.value, botId.value, env.value) : null))
const hasSignature = computed(() => !!raw.value && new URLSearchParams(raw.value).has('signature'))

const age = computed(() => (fields.value?.authDate ? ageSeconds(fields.value.authDate) : null))
const expired = computed(() => age.value !== null && maxAge.value > 0 && age.value > maxAge.value)
function humanAge(s: number) {
  if (s < 0) return 'in the future'
  if (s < 120) return `${s} s ago`
  if (s < 7200) return `${Math.round(s / 60)} min ago`
  if (s < 172800) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

const user = computed(() => fields.value?.values.user as Record<string, unknown> | undefined)
const summary = computed<KeyValueItem[]>(() => {
  const f = fields.value
  if (!f) return []
  const v = f.values
  const rows: KeyValueItem[] = []
  if (f.authDate) rows.push({ label: 'auth_date', value: String(f.authDate), hint: `${new Date(f.authDate * 1000).toUTCString()} · ${humanAge(age.value!)}` })
  const u = user.value
  if (u) {
    rows.push({ label: 'User ID', value: String(u.id ?? '') })
    rows.push({ label: 'Name', value: [u.first_name, u.last_name].filter(Boolean).join(' '), mono: false })
    if (u.username) rows.push({ label: 'Username', value: `@${u.username}`, mono: false })
    if (u.language_code) rows.push({ label: 'Language', value: String(u.language_code), copy: false })
    rows.push({ label: 'Premium', value: u.is_premium ? 'yes' : 'no', copy: false, mono: false })
  }
  for (const k of ['start_param', 'chat_type', 'chat_instance', 'query_id', 'can_send_after'])
    if (typeof v[k] === 'string') rows.push({ label: k, value: v[k] as string })
  return rows
})
const dcs = computed(() => (raw.value ? dataCheckString(raw.value, ['hash']) : ''))

function example() {
  input.value = EXAMPLE.initData
  botIdInput.value = EXAMPLE.botId
  token.value = EXAMPLE.token
  env.value = 'production'
  maxAge.value = 0 // the example is from 2024
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="primary"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="Runs only in your browser"
      description="The bot token and initData are checked with your browser's crypto and are never sent anywhere. Even so, prefer a test bot's token over a production one."
    />

    <div class="space-y-2">
      <UFormField label="initData" hint="Telegram.WebApp.initData, or the whole launch URL">
        <UTextarea
          v-model="input"
          :rows="4"
          autoresize
          :maxrows="10"
          class="w-full"
          :ui="{ base: 'font-mono text-xs break-all' }"
          placeholder="query_id=…&user=%7B…%7D&auth_date=…&signature=…&hash=…"
          spellcheck="false"
        />
      </UFormField>
      <div class="flex flex-wrap gap-x-4">
        <UButton label="Try a real signed example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
        <UButton v-if="input" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="input = ''" />
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Bot token" hint="Checks hash (what your backend does)">
        <UInput
          v-model="token"
          :type="showToken ? 'text' : 'password'"
          placeholder="123456789:AA…"
          class="w-full"
          :ui="{ base: 'font-mono text-sm', trailing: 'pe-1' }"
          autocomplete="off"
          spellcheck="false"
        >
          <template #trailing>
            <UButton :icon="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" :aria-label="showToken ? 'Hide token' : 'Show token'" color="neutral" variant="link" size="sm" @click="showToken = !showToken" />
          </template>
        </UInput>
      </UFormField>
      <UFormField label="Bot ID" :hint="tokenBotId ? 'Taken from the token' : 'Checks signature without the token'">
        <UInput :model-value="tokenBotId ? String(tokenBotId) : botIdInput" :disabled="!!tokenBotId" placeholder="123456789" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono text-sm' }" @update:model-value="v => (botIdInput = String(v))" />
      </UFormField>
      <UFormField label="Telegram environment" hint="Which Ed25519 key signed it">
        <USelect v-model="env" :items="[{ label: 'Production', value: 'production' }, { label: 'Test environment', value: 'test' }]" class="w-full" />
      </UFormField>
      <UFormField label="Max age (seconds)" hint="0 = do not check. Pick what your backend accepts.">
        <UInput v-model.number="maxAge" type="number" min="0" class="w-full" />
      </UFormField>
    </div>

    <template v-if="raw && fields">
      <div class="grid gap-3 sm:grid-cols-2">
        <!-- hash -->
        <div class="rounded-lg border p-4" :class="hash && hasHash ? (hash.ok ? 'border-success/50 bg-success/5' : 'border-error/50 bg-error/5') : 'border-default'">
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon :name="hash && hasHash ? (hash.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x') : 'i-lucide-circle-dashed'" :class="hash && hasHash ? (hash.ok ? 'text-success' : 'text-error') : 'text-dimmed'" class="size-5" />
            hash (bot token)
          </div>
          <p class="mt-1 text-sm text-muted">
            <template v-if="!hasHash">
              No hash field in this initData.
            </template>
            <template v-else-if="!token.trim()">
              Enter the bot token to check it.
            </template>
            <template v-else-if="hash?.ok">
              Valid: signed for this bot token.
            </template>
            <template v-else-if="hash">
              Invalid: the data was changed or belongs to another bot.
            </template>
          </p>
          <div v-if="hash && !hash.ok && hash.received" class="mt-2 space-y-0.5 font-mono text-xs break-all">
            <div><span class="text-muted">expected </span>{{ hash.expected }}</div>
            <div><span class="text-muted">received </span>{{ hash.received }}</div>
          </div>
        </div>
        <!-- signature -->
        <div class="rounded-lg border p-4" :class="signature?.present ? (signature.ok ? 'border-success/50 bg-success/5' : 'border-error/50 bg-error/5') : 'border-default'">
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon :name="signature?.present ? (signature.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x') : 'i-lucide-circle-dashed'" :class="signature?.present ? (signature.ok ? 'text-success' : 'text-error') : 'text-dimmed'" class="size-5" />
            signature (Ed25519, no token)
          </div>
          <p class="mt-1 text-sm text-muted">
            <template v-if="!hasSignature">
              No signature field (older Telegram clients do not send it).
            </template>
            <template v-else-if="!botId">
              Enter the bot ID to check it.
            </template>
            <template v-else-if="signature?.ok">
              Valid: Telegram signed this for bot {{ botId }} ({{ env }} key).
            </template>
            <template v-else>
              Invalid for bot {{ botId }} with the {{ env }} key.
            </template>
          </p>
        </div>
      </div>

      <UAlert
        v-if="expired"
        color="warning"
        variant="subtle"
        icon="i-lucide-clock-alert"
        title="Older than your max age"
        :description="`auth_date is ${humanAge(age!)}. A backend with this limit should reject it even if the hash is valid, to stop replays.`"
      />
      <UAlert v-if="!fields.authDate" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="auth_date is missing or invalid" />

      <div>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Parsed
        </h3>
        <KeyValue :items="summary" />
      </div>
      <JsonView :value="fields.values" label="All fields (decoded)" />
      <details class="group rounded-md border border-default">
        <summary class="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-highlighted">
          data-check-string (what the hash signs)
          <UIcon name="i-lucide-chevron-down" class="size-4 transition group-open:rotate-180" />
        </summary>
        <div class="border-t border-default p-3">
          <pre class="overflow-auto font-mono text-xs whitespace-pre-wrap break-all">{{ dcs }}</pre>
          <p class="mt-2 text-xs text-muted">
            All fields except hash, URL-decoded, sorted, joined with a line feed. Key = HMAC-SHA256("WebAppData", bot token). The signature check also drops signature and prefixes "&lt;bot_id&gt;:WebAppData\n".
          </p>
        </div>
      </details>
    </template>
    <p v-else class="text-sm text-muted">
      Paste initData from your Mini App (Telegram.WebApp.initData) to verify it and see what it contains. Never trust initDataUnsafe on your server without this check.
    </p>
  </div>
</template>
