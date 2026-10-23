<script setup lang="ts">
import type { BodyKind } from '~/lib/payloads/message'
import type { W5Action, W5Auth } from './logic'
import { Address } from '@ton/core'
import DecodedTree from '~/lib/payloads/DecodedTree.vue'
import { analyzeInput, decodePayload } from '~/lib/payloads/decode'
import { b64, buildBody, buildStateInit } from '~/lib/payloads/message'
import { describeMode } from '~/lib/payloads/sendmode'
import { messageHash, normalizedExtMessageHash } from '~/utils/ton/messages'
import { W5_EXTENSION, W5_EXTERNAL, W5_INTERNAL } from '../payload-decoder/vectors'
import { attachSignature, buildRequest, externalMessage, MAX_ACTIONS, safeMode, walletIdV5R1 } from './logic'

const { network, isTestnet } = useTonNetwork()
const tab = ref('build')
const TABS = [{ label: 'Build', value: 'build', icon: 'i-lucide-hammer' }, { label: 'Decode', value: 'decode', icon: 'i-lucide-scan-text' }]

// ---------------------------------------------------------------- build form
const auth = ref<W5Auth>('external')
const AUTH_ITEMS = [
  { label: 'Signed, external', value: 'external', description: 'The usual case: the wallet owner signs and the message is broadcast with sendBoc.' },
  { label: 'Signed, internal', value: 'internal', description: 'Signed body delivered in an internal message, e.g. by a gasless relayer.' },
  { label: 'Extension', value: 'extension', description: 'Sent by an installed extension contract. No signature, no seqno.' }
]
const walletId = ref(String(walletIdV5R1(network.value)))
const defaultWalletId = computed(() => String(walletIdV5R1(network.value)))
watch(network, () => (walletId.value = defaultWalletId.value))
const seqno = ref('0')
const now = () => Math.floor(Date.now() / 1000)
const validUntil = ref(String(now() + 600))
const queryId = ref('0')

type ActionType = 'send' | 'add_extension' | 'remove_extension' | 'set_signature_allowed'
interface ActionForm {
  id: number
  type: ActionType
  to: string
  amount: string
  nano: bigint | null
  bounce: boolean
  bodyKind: BodyKind
  text: string
  init: string
  mode: string
  address: string
  allowed: boolean
}
let nextId = 1
const blank = (type: ActionType = 'send'): ActionForm => ({ id: nextId++, type, to: '', amount: '', nano: null, bounce: false, bodyKind: 'comment', text: '', init: '', mode: '3', address: '', allowed: true })
const actions = ref<ActionForm[]>([blank()])
const TYPE_ITEMS = [
  { label: 'Send message', value: 'send' },
  { label: 'Add extension', value: 'add_extension' },
  { label: 'Remove extension', value: 'remove_extension' },
  { label: 'Allow / disallow signature', value: 'set_signature_allowed' }
]
const BODY_ITEMS = [{ label: 'None', value: 'none' }, { label: 'Comment', value: 'comment' }, { label: 'BOC', value: 'boc' }]

function example() {
  auth.value = 'external'
  walletId.value = defaultWalletId.value
  seqno.value = '12'
  validUntil.value = String(now() + 600)
  const foundation = '0:059a3528654a8a14404660510c6effa6eb5b054ad8007d447c27a8490f0514d3' // TON Foundation (tonapi label)
  actions.value = [
    { ...blank(), to: foundation, amount: '0.01', text: 'First payment' },
    { ...blank(), to: foundation, amount: '0.02', text: 'Second payment' }
  ]
}

// Bounce follows the address typed (EQ…/kQ… bounceable, UQ…/0Q… not), as wallets do; raw 0:… keeps the switch.
function syncBounce(a: ActionForm, v: string) {
  const t = v.trim()
  if (/^[EUk0][Qf][\w-]{46}$/.test(t)) a.bounce = t[0] === 'E' || t[0] === 'k'
}

function parseAddress(s: string, where: string) {
  try {
    return Address.parse(s.trim())
  }
  catch {
    throw new Error(`${where}: enter a valid address`)
  }
}

function toAction(a: ActionForm, i: number): W5Action {
  const where = `Action ${i + 1}`
  if (a.type === 'send') {
    if (a.nano === null) throw new Error(`${where}: enter an amount`)
    const mode = Number(a.mode)
    if (!Number.isInteger(mode) || mode < 0 || mode > 255) throw new Error(`${where}: send mode must be 0–255`)
    return {
      type: 'send',
      mode,
      message: {
        to: parseAddress(a.to, where),
        value: a.nano,
        bounce: a.bounce,
        body: buildBody(a.bodyKind, a.text),
        init: buildStateInit({ stateInitBoc: a.init })
      }
    }
  }
  if (a.type === 'set_signature_allowed') return { type: a.type, allowed: a.allowed }
  return { type: a.type, address: parseAddress(a.address, where) }
}

const uint32 = (s: string, name: string) => {
  const n = Number(s)
  if (!/^\d+$/.test(s.trim()) || n > 0xFFFFFFFF) throw new Error(`${name} must be a whole number from 0 to 4294967295`)
  return n
}

const built = computed(() => {
  try {
    const list = actions.value.map(toAction)
    const req = buildRequest({
      auth: auth.value,
      walletId: uint32(walletId.value, 'wallet_id'),
      validUntil: uint32(validUntil.value, 'valid_until'),
      seqno: uint32(seqno.value, 'seqno'),
      queryId: auth.value === 'extension' ? BigInt(queryId.value.trim() || '0') : undefined,
      actions: list
    })
    // Decode what we built (with a zero signature placeholder) so the user sees each action as the wallet will.
    const forPreview = req.signingHash ? attachSignature(req.unsigned, '00'.repeat(64)) : req.unsigned
    const preview = decodePayload(forPreview, { testOnly: isTestnet.value })
    delete preview.fields.signature // only the placeholder
    return { ok: true as const, req, list, preview }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const warnings = computed(() => {
  const w: string[] = []
  actions.value.forEach((a, i) => {
    if (a.type === 'send' && auth.value === 'external' && safeMode(Number(a.mode), 'external') !== Number(a.mode)) w.push(`Action ${i + 1}: external requests must use send mode +2 (ignore errors), so it is sent with mode ${safeMode(Number(a.mode), 'external')}. The wallet rejects anything else with exit code 137.`)
    if (a.type === 'set_signature_allowed' && auth.value !== 'extension') w.push(`Action ${i + 1}: only an extension can allow or disallow signature auth. A signed request with this action fails with exit code 146.`)
    if (a.type === 'set_signature_allowed' && !a.allowed) w.push(`Action ${i + 1}: after this, the recovery phrase can no longer sign. Only installed extensions control the wallet. Make sure one can turn signatures back on.`)
    if (a.type === 'send' && Number(a.mode) & 128) w.push(`Action ${i + 1}: mode +128 sends the whole balance; the amount is ignored.`)
  })
  if (Number(validUntil.value) < now()) w.push('valid_until is in the past: the wallet will reject the request (exit code 136).')
  return w
})

// ---------------------------------------------------------------- signature + external message
const signature = ref('')
const walletAddress = ref('')
const signed = computed(() => {
  if (!built.value.ok || !built.value.req.signingHash || !signature.value.trim()) return null
  try {
    const body = attachSignature(built.value.req.unsigned, signature.value)
    let ext: { boc: string, hash: string, norm: string } | null = null
    if (auth.value === 'external' && walletAddress.value.trim()) {
      const cell = externalMessage(parseAddress(walletAddress.value, 'Wallet address'), body)
      ext = { boc: b64(cell), hash: messageHash(cell), norm: normalizedExtMessageHash(cell) }
    }
    return { ok: true as const, body: b64(body), ext }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

// ---------------------------------------------------------------- decode tab
const decodeInput = ref('')
const DECODE_EXAMPLES = [
  { label: 'External (mainnet)', value: W5_EXTERNAL },
  { label: 'Gasless internal', value: W5_INTERNAL },
  { label: 'Extension', value: W5_EXTENSION }
]
const decoded = computed(() => {
  if (!decodeInput.value.trim()) return null
  try {
    const r = analyzeInput(decodeInput.value, { testOnly: isTestnet.value })
    if (r.kind === 'body') return { ok: true as const, body: r.body }
    if (r.kind === 'message') return { ok: true as const, body: { op: null, opHex: null, name: 'message', title: r.message.title, fields: r.message.fields } }
    return { ok: false as const, error: 'That looks like a transaction hash. Paste a W5 body or external message BOC, or use the message body decoder for hashes.' }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="tab" :items="TABS" :content="false" class="w-full" />

    <!-- ================================================================ BUILD -->
    <div v-if="tab === 'build'" class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="max-w-prose text-sm text-muted">
          Builds the exact body a W5 (v5r1) wallet processes. Nothing is signed here: you get the bytes and the hash to sign
          with your own tooling. To just send coins, use your wallet or the internal message builder.
        </p>
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>

      <UFormField label="Who authorizes the request">
        <URadioGroup v-model="auth" :items="AUTH_ITEMS" />
      </UFormField>

      <div v-if="auth !== 'extension'" class="grid gap-4 sm:grid-cols-3">
        <UFormField label="wallet_id" :hint="walletId === defaultWalletId ? `default for ${network}` : 'custom'">
          <UInput v-model="walletId" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }">
            <template v-if="walletId !== defaultWalletId" #trailing>
              <UButton icon="i-lucide-rotate-ccw" variant="link" size="xs" aria-label="Reset to default" @click="walletId = defaultWalletId" />
            </template>
          </UInput>
        </UFormField>
        <UFormField label="seqno" hint="the wallet's current seqno">
          <UInput v-model="seqno" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }" />
        </UFormField>
        <UFormField label="valid_until" :hint="Number(validUntil) ? new Date(Number(validUntil) * 1000).toLocaleString() : ''">
          <UInput v-model="validUntil" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }">
            <template #trailing>
              <UButton label="+10 min" variant="link" size="xs" @click="validUntil = String(now() + 600)" />
            </template>
          </UInput>
        </UFormField>
      </div>
      <UFormField v-else label="query_id" class="sm:max-w-xs">
        <UInput v-model="queryId" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }" />
      </UFormField>

      <section class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Actions <span class="font-sans text-xs font-normal text-muted">({{ actions.length }} / {{ MAX_ACTIONS }})</span>
        </h3>
        <ol class="space-y-3">
          <li v-for="(a, i) in actions" :key="a.id" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-muted">#{{ i + 1 }}</span>
              <USelect v-model="a.type" :items="TYPE_ITEMS" class="min-w-0 flex-1 sm:max-w-64" />
              <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="sm" :aria-label="`Remove action ${i + 1}`" :disabled="actions.length === 1" class="ml-auto" @click="actions.splice(i, 1)" />
            </div>

            <template v-if="a.type === 'send'">
              <AddressInput v-model="a.to" label="To" @update:model-value="syncBounce(a, $event)" />
              <div class="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <AmountInput v-model="a.amount" v-model:nano="a.nano" label="Value" />
                <UFormField label="Send mode" :hint="describeMode(Number(a.mode) || 0).replace(/^\d+ = /, '')">
                  <UInput v-model="a.mode" inputmode="numeric" class="w-24" :ui="{ base: 'font-mono' }" />
                </UFormField>
                <USwitch v-model="a.bounce" :label="a.bounce ? 'Bounceable' : 'Non-bounceable'" class="sm:mb-2" />
              </div>
              <URadioGroup v-model="a.bodyKind" :items="BODY_ITEMS" orientation="horizontal" legend="Body" />
              <UInput v-if="a.bodyKind === 'comment'" v-model="a.text" placeholder="Comment" class="w-full" />
              <UTextarea v-else-if="a.bodyKind === 'boc'" v-model="a.text" :rows="2" autoresize placeholder="Body BOC (base64 or hex)" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
              <UCollapsible>
                <UButton label="StateInit (optional)" variant="link" size="xs" color="neutral" class="px-0" trailing-icon="i-lucide-chevron-down" />
                <template #content>
                  <UTextarea v-model="a.init" :rows="2" autoresize placeholder="StateInit BOC, to deploy the destination" class="mt-2 w-full" :ui="{ base: 'font-mono text-xs break-all' }" spellcheck="false" />
                </template>
              </UCollapsible>
            </template>
            <AddressInput v-else-if="a.type !== 'set_signature_allowed'" v-model="a.address" label="Extension contract address" />
            <USwitch v-else v-model="a.allowed" :label="a.allowed ? 'Allow signature auth' : 'Disallow signature auth (extensions only)'" />
          </li>
        </ol>
        <div class="flex flex-wrap gap-2">
          <UButton label="Add action" icon="i-lucide-plus" variant="soft" size="sm" :disabled="actions.length >= MAX_ACTIONS" @click="actions.push(blank())" />
        </div>
      </section>

      <UAlert v-if="!built.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />
      <UAlert v-for="w in warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-info" :description="w" />

      <template v-if="built.ok">
        <section class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Result
          </h3>
          <KeyValue
            v-if="built.req.signingHash"
            :items="[
              { label: 'Hash to sign (ed25519)', value: built.req.signingHash, hint: 'The wallet checks the signature against this 32-byte cell hash. Sign it with the key of the wallet, e.g. sign(hash, secretKey) in @ton/crypto.' },
              { label: 'Unsigned body BOC', value: b64(built.req.unsigned), hint: 'Everything before the signature. The signed body is this cell with the 64-byte signature appended.' }
            ]"
          />
          <KeyValue
            v-else
            :items="[{ label: 'Body BOC', value: b64(built.req.unsigned), hint: 'Complete: the extension contract sends this body to the wallet in an internal message.' }]"
          />
        </section>

        <section v-if="built.req.signingHash" class="space-y-3 rounded-lg border border-default p-4">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Add the signature
          </h3>
          <UFormField label="Signature (hex, 64 bytes)">
            <UInput v-model="signature" class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="128 hex characters" spellcheck="false" autocomplete="off" />
          </UFormField>
          <AddressInput v-if="auth === 'external'" v-model="walletAddress" label="Wallet address (to build the external message)" />
          <UAlert v-if="signed && !signed.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="signed.error" />
          <KeyValue
            v-if="signed?.ok"
            :items="[
              { label: 'Signed body BOC', value: signed.body },
              ...(signed.ext ? [
                { label: 'External message BOC', value: signed.ext.boc, hint: 'Broadcast with sendBoc (toncenter, tonapi or any liteserver). Add the StateInit yourself if the wallet is not deployed yet.' },
                { label: 'Normalized hash (TEP-467)', value: signed.ext.norm, hint: 'Find the transaction by this hash once it is sent.' },
                { label: 'Message hash', value: signed.ext.hash }
              ] : [])
            ]"
          />
          <p class="text-xs text-muted">
            The signature is not verified here (that needs the public key); a wrong one is rejected by the wallet with exit code 135.
          </p>
        </section>

        <section class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            What the wallet will do
          </h3>
          <div class="rounded-lg border border-default p-4">
            <DecodedTree :body="built.preview" />
          </div>
        </section>
      </template>
    </div>

    <!-- ================================================================ DECODE -->
    <div v-else class="space-y-4">
      <BocInput v-model="decodeInput" label="W5 body or external message" :examples="DECODE_EXAMPLES" />
      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />
      <div v-else-if="decoded?.ok" class="rounded-lg border border-default p-4">
        <DecodedTree :body="decoded.body" />
      </div>
    </div>
  </div>
</template>
