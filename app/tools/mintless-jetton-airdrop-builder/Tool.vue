<script setup lang="ts">
import type { Address } from '@ton/core'
import type { DroppedFile } from '~/components/FileDrop.vue'
import { formatJettonAmount } from '~/utils/ton/jetton'
import type { BuiltAirdrop } from './logic'
import {
  buildAirdrop, buildApiDump, claimApiResponse, claimPayload, EXAMPLE_CSV, LARGE_LIST, MINTLESS_WALLET_CODE_HASH,
  parseAirdropCsv, proofFor
} from './logic'

const { isTestnet } = useTonNetwork()

// ---------------------------------------------------------------- settings
const decimals = ref(9)
const toLocalInput = (unix: number) => {
  const d = new Date(unix * 1000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const now = Math.floor(Date.now() / 1000)
const startLocal = ref(toLocalInput(now))
const expireLocal = ref(toLocalInput(now + 90 * 86400))
const toUnix = (local: string) => Math.floor(new Date(local).getTime() / 1000)

// ---------------------------------------------------------------- CSV
const csv = ref('')
const fileName = ref('')
function onFile(f: DroppedFile) {
  csv.value = f.text ?? new TextDecoder().decode(f.bytes)
  fileName.value = f.name
}
const parsedCsv = computed(() => {
  if (!csv.value.trim()) return null
  const d = Number(decimals.value)
  if (!Number.isInteger(d) || d < 0 || d > 255) return { rows: [], errors: [{ line: 0, message: 'Decimals must be a whole number from 0 to 255' }] }
  return parseAirdropCsv(csv.value, { decimals: d, startFrom: toUnix(startLocal.value), expireAt: toUnix(expireLocal.value) })
})

// ---------------------------------------------------------------- build
const built = shallowRef<BuiltAirdrop | null>(null)
const building = ref(false)
const buildError = ref<string | null>(null)
watch([csv, decimals, startLocal, expireLocal], () => (built.value = null))

async function build() {
  const p = parsedCsv.value
  if (!p?.rows.length) return
  building.value = true
  buildError.value = null
  await new Promise(r => setTimeout(r, 30)) // let the spinner paint
  try {
    built.value = buildAirdrop(p.rows)
  }
  catch (e) {
    buildError.value = (e as Error).message
  }
  finally {
    building.value = false
  }
}

function downloadBytes(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const dumpBoc = computed(() => (built.value ? built.value.cell.toBoc() : null))

// ---------------------------------------------------------------- per owner
const minter = ref('')
const minterParsed = shallowRef<Address | null>(null)
const lookup = ref('')
const lookupParsed = shallowRef<Address | null>(null)
const lookupResult = computed(() => {
  if (!built.value || !lookupParsed.value) return null
  const item = built.value.dict.get(lookupParsed.value)
  if (!item) return { ok: false as const }
  const payload = claimPayload(proofFor(built.value.cell, lookupParsed.value))
  const api = minterParsed.value ? claimApiResponse(built.value, lookupParsed.value, minterParsed.value) : null
  return { ok: true as const, item, payload: payload.toBoc().toString('base64'), api }
})

// ---------------------------------------------------------------- bulk export
const exporting = ref(false)
const progress = ref(0)
async function exportApi() {
  if (!built.value || !minterParsed.value) return
  exporting.value = true
  progress.value = 0
  try {
    const dump = await buildApiDump(built.value, minterParsed.value, undefined, (d, t) => (progress.value = Math.round((d / t) * 100)))
    downloadText(JSON.stringify(dump), 'mintless-claim-api.json', 'application/json')
  }
  finally {
    exporting.value = false
  }
}
async function exportPayloads() {
  if (!built.value || !parsedCsv.value) return
  exporting.value = true
  progress.value = 0
  try {
    const rows = []
    const list = parsedCsv.value.rows
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!
      rows.push({ owner: r.address.toRawString(), amount: r.amount, start_from: r.startFrom, expire_at: r.expireAt, custom_payload: claimPayload(proofFor(built.value.cell, r.address)).toBoc().toString('base64') })
      if ((i + 1) % 500 === 0) {
        progress.value = Math.round(((i + 1) / list.length) * 100)
        await new Promise(res => setTimeout(res, 0))
      }
    }
    downloadText(toCsv(rows), 'mintless-claim-payloads.csv', 'text/csv')
  }
  finally {
    exporting.value = false
  }
}

const fmt = (units: bigint) => formatJettonAmount(units, Number(decimals.value))
const dateOf = (unix: number) => new Date(unix * 1000).toLocaleString()
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-4">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        1. Airdrop list
      </h3>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Jetton decimals">
          <UInputNumber v-model="decimals" :min="0" :max="255" class="w-full" />
        </UFormField>
        <UFormField label="Default claim start (local time)">
          <UInput v-model="startLocal" type="datetime-local" class="w-full" />
        </UFormField>
        <UFormField label="Default expiry">
          <UInput v-model="expireLocal" type="datetime-local" class="w-full" />
        </UFormField>
      </div>
      <p class="text-sm text-muted">
        One owner per line: <code>address, amount</code> and optionally <code>start_from, expire_at</code>. Amounts are whole tokens (12.5);
        dates are unix seconds or ISO dates (2026-11-01, UTC). Rows without dates use the defaults above.
      </p>
      <UFormField label="Airdrop CSV" :hint="fileName || undefined">
        <UTextarea v-model="csv" :rows="6" autoresize :maxrows="14" class="w-full" :ui="{ base: 'font-mono text-xs' }" spellcheck="false" placeholder="UQ…,1500&#10;0:…,250.75,2026-11-01,2027-01-01" />
      </UFormField>
      <div class="flex flex-wrap gap-x-4">
        <UButton label="Load an example list" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="csv = EXAMPLE_CSV; fileName = ''" />
        <UButton v-if="csv" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="csv = ''; fileName = ''" />
      </div>
      <FileDrop v-if="!csv" accept=".csv,.txt,text/csv" text :max-bytes="100 * 1024 * 1024" label="Or drop a .csv file (read locally)" @file="onFile" />

      <template v-if="parsedCsv">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="success" variant="subtle" :label="`${parsedCsv.rows.length.toLocaleString()} valid row${parsedCsv.rows.length === 1 ? '' : 's'}`" />
          <UBadge v-if="parsedCsv.errors.length" color="error" variant="subtle" :label="`${parsedCsv.errors.length} with errors`" />
        </div>
        <UAlert
          v-if="parsedCsv.errors.length"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Fix these lines (they are left out)"
        >
          <template #description>
            <ul class="mt-1 space-y-0.5 font-mono text-xs">
              <li v-for="e in parsedCsv.errors.slice(0, 15)" :key="e.line">
                {{ e.line ? `line ${e.line}: ` : '' }}{{ e.message }}
              </li>
              <li v-if="parsedCsv.errors.length > 15">
                … and {{ parsedCsv.errors.length - 15 }} more
              </li>
            </ul>
          </template>
        </UAlert>
        <UAlert v-if="parsedCsv.rows.length > LARGE_LIST" color="info" variant="subtle" icon="i-lucide-hourglass" title="Large list" description="Building runs in this tab and can take a while for very large lists. Keep the tab open." />
        <UButton label="Build the airdrop" icon="i-lucide-hammer" size="lg" :loading="building" :disabled="!parsedCsv.rows.length" @click="build" />
        <UAlert v-if="buildError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="buildError" />
      </template>
    </section>

    <section v-if="built" class="space-y-4" aria-live="polite">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        2. Minter values
      </h3>
      <KeyValue
        :items="[
          { label: 'merkle_root (uint256)', value: '0x' + built.root, hint: 'Store it in the jetton minter. Wallets check every claim against it.' },
          { label: 'Total airdrop (total_supply to set)', value: `${fmt(built.total)} (${built.total} base units)`, mono: false },
          { label: 'Owners', value: built.dict.size.toLocaleString(), mono: false, copy: false }
        ]"
      />
      <div class="flex flex-wrap items-center gap-3">
        <UButton label="Download airdrop dictionary (.boc)" icon="i-lucide-download" variant="soft" @click="downloadBytes(dumpBoc!, 'airdrop-dict.boc')" />
        <span class="text-xs text-muted">{{ ((dumpBoc?.length ?? 0) / 1024).toFixed(1) }} KB. Publish it at <code>mintless_merkle_dump_uri</code> so anyone can rebuild the proofs.</span>
      </div>
    </section>

    <section v-if="built" class="space-y-4">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        3. Claim data (TEP-176 API)
      </h3>
      <p class="text-sm text-muted">
        Wallets call <code>{custom_payload_api_uri}/wallet/{owner}</code> and attach the answer's custom_payload and state_init to the owner's first transfer.
        With the minter address, this page builds the full answer, including the jetton wallet's state_init (standard mintless wallet code, library <span class="font-mono">{{ MINTLESS_WALLET_CODE_HASH.slice(0, 8) }}…</span>).
      </p>
      <AddressInput v-model="minter" label="Jetton minter address (optional)" placeholder="EQ… (deployed or planned)" @parsed="minterParsed = $event" />
      <AddressInput v-model="lookup" label="Look up one owner" @parsed="lookupParsed = $event" />
      <div v-if="parsedCsv?.rows.length" class="-mt-2">
        <UButton label="Use the first owner in the list" icon="i-lucide-mouse-pointer-click" variant="link" size="sm" class="px-0" @click="lookup = parsedCsv.rows[0]!.address.toString({ bounceable: false, testOnly: isTestnet })" />
      </div>

      <UAlert v-if="lookupResult && !lookupResult.ok" color="warning" variant="subtle" icon="i-lucide-search-x" title="This address is not in the airdrop" />
      <template v-if="lookupResult?.ok">
        <KeyValue
          :items="[
            { label: 'Amount', value: `${fmt(lookupResult.item.amount)} (${lookupResult.item.amount} base units)`, mono: false },
            { label: 'Claim window', value: `${dateOf(lookupResult.item.startFrom)} → ${dateOf(lookupResult.item.expireAt)}`, mono: false, copy: false },
            { label: 'custom_payload (base64 BOC)', value: lookupResult.payload, hint: 'merkle_airdrop_claim#0df602d6 with this owner\'s Merkle proof' }
          ]"
        />
        <JsonView v-if="lookupResult.api" :value="lookupResult.api" label="API answer for this owner" />
        <p v-else class="text-sm text-muted">
          Enter the minter address to see the jetton wallet address, its state_init and the full API answer.
        </p>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <UButton label="Download all answers (JSON)" icon="i-lucide-file-json" :disabled="!minterParsed || exporting" :loading="exporting" @click="exportApi" />
        <UButton label="Download claim payloads (CSV)" icon="i-lucide-sheet" variant="soft" :disabled="exporting" @click="exportPayloads" />
        <span v-if="exporting" class="text-sm text-muted" role="status">{{ progress }}%</span>
      </div>
      <p class="text-xs text-dimmed">
        The JSON maps each owner's raw address to its API answer, so a static file server or a tiny worker can serve <code>/wallet/{owner}</code>.
        Everything is computed in your browser; nothing is uploaded.
      </p>
    </section>
  </div>
</template>
