<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { V5Context } from './logic'
import { parsePublicKey } from '~/lib/wallet-derivation/wallets'
import { decodeContext, defaultSubwalletId, isStandardContext, NETWORKS, parseWalletId, v4Address, v5Address, v5WalletId, walletIdForms } from './logic'

const { network } = useTonNetwork()
const mode = ref<'build' | 'decode'>('build')

// Build
const net = ref<string>(network.value)
const customGid = ref(-239)
const workchain = ref<number>(0)
const subwallet = ref(0)
const gid = computed(() => net.value === 'custom' ? customGid.value : NETWORKS.find(n => n.id === net.value)!.globalId)
const built = computed(() => {
  if (!Number.isInteger(subwallet.value) || subwallet.value < 0 || subwallet.value > 32767) return null
  return walletIdForms(v5WalletId(gid.value, workchain.value, subwallet.value))
})
const builtRows = computed<KeyValueItem[]>(() => built.value
  ? [
      { label: 'wallet_id (uint32, as explorers and toncenter show it)', value: String(built.value.unsigned) },
      { label: 'wallet_id (int32, as stored in contract data)', value: String(built.value.signed) },
      { label: 'Hex', value: built.value.hex }
    ]
  : [])

// Decode
const idInput = ref('')
const decoded = computed(() => {
  if (!idInput.value.trim()) return null
  try {
    const id = parseWalletId(idInput.value)
    return { ok: true as const, id, forms: walletIdForms(id), reads: NETWORKS.map(n => ({ ...n, ctx: decodeContext(id, n.globalId) })) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function describe(c: V5Context): string {
  if (c.kind === 'custom') return `Custom context, counter ${c.counter}`
  const wc = c.workchain === 0 ? 'basechain (0)' : c.workchain === -1 ? 'masterchain (−1)' : `workchain ${c.workchain}`
  const ver = c.walletVersion === 0 ? 'v5r1' : `unknown version ${c.walletVersion}`
  return `${ver}, ${wc}, subwallet ${c.subwallet}`
}

// Address preview
const pubInput = ref('')
const v4Sub = ref<number | null>(null)
const EXAMPLE_PUB = '02bc2f2b7882d72b25eb04bc0a639414d60b99cf92c5074e090189a56aa2a6a3'
const preview = computed(() => {
  if (!pubInput.value.trim()) return null
  try {
    const key = parsePublicKey(pubInput.value)
    const id = mode.value === 'build' ? built.value?.signed : decoded.value?.ok ? decoded.value.id : undefined
    const g = mode.value === 'build' ? gid.value : NETWORKS.find(n => n.id === network.value)!.globalId
    const testOnly = g === -3
    const wc = mode.value === 'build' ? workchain.value : 0
    const fmt = (a: ReturnType<typeof v4Address>) => a.toString({ bounceable: false, testOnly, urlSafe: true })
    const sub = v4Sub.value ?? defaultSubwalletId(wc)
    return {
      ok: true as const,
      testOnly,
      v5: id === undefined ? null : fmt(v5Address(key, id, g, wc)),
      v4: fmt(v4Address(key, sub, wc)),
      sub
    }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'Build', value: 'build', icon: 'i-lucide-calculator' }, { label: 'Decode', value: 'decode', icon: 'i-lucide-binary' }]"
    />

    <section v-if="mode === 'build'" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Network" hint="network_global_id">
          <USelect
            v-model="net"
            class="w-full"
            :items="[{ label: 'Mainnet (−239)', value: 'mainnet' }, { label: 'Testnet (−3)', value: 'testnet' }, { label: 'Custom', value: 'custom' }]"
          />
        </UFormField>
        <UFormField label="Workchain">
          <USelect
            v-model="workchain"
            class="w-full"
            :items="[{ label: 'Basechain (0)', value: 0 }, { label: 'Masterchain (−1)', value: -1 }]"
          />
        </UFormField>
        <UFormField label="Subwallet number" hint="0–32767" :error="built ? undefined : 'Must be 0 to 32767'">
          <UInputNumber v-model="subwallet" :min="0" :max="32767" class="w-full" />
        </UFormField>
        <UFormField v-if="net === 'custom'" label="Custom network_global_id" class="sm:col-span-3">
          <UInputNumber v-model="customGid" :min="-2147483648" :max="2147483647" class="w-full sm:w-60" />
        </UFormField>
      </div>

      <div v-if="built" class="rounded-lg border border-default px-4 py-1">
        <KeyValue :items="builtRows" />
      </div>
      <p class="text-sm text-muted">
        Wallet apps create W5 with subwallet 0. The network is part of the id, so the same key has a
        different W5 address on mainnet and testnet. Older wallets (v3, v4) use a plain
        <span class="font-mono">subwallet_id</span>; the default is
        <span class="font-mono">698983191 + workchain</span> = <span class="font-mono">{{ defaultSubwalletId(workchain) }}</span> here.
      </p>
    </section>

    <section v-else class="space-y-4">
      <div class="space-y-2">
        <UFormField label="wallet_id" hint="decimal or 0x hex">
          <UInput v-model="idInput" placeholder="2147483409" class="w-full font-mono" inputmode="numeric" autocomplete="off" />
        </UFormField>
        <UButton
          v-if="!idInput"
          label="Try an example (mainnet W5 default)"
          icon="i-lucide-sparkles"
          variant="link"
          size="sm"
          class="px-0"
          @click="idInput = '2147483409'"
        />
      </div>
      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />
      <template v-if="decoded?.ok">
        <div class="rounded-lg border border-default px-4 py-1">
          <KeyValue
            :items="[
              { label: 'Unsigned', value: String(decoded.forms.unsigned) },
              { label: 'Signed (int32)', value: String(decoded.forms.signed) },
              { label: 'Hex', value: decoded.forms.hex }
            ]"
          />
        </div>
        <div class="space-y-2">
          <div v-for="r in decoded.reads" :key="r.id" class="flex flex-wrap items-center gap-2 rounded-lg border border-default px-4 py-3 text-sm">
            <span class="w-full shrink-0 font-medium text-highlighted sm:w-40">Read as {{ r.id }} ({{ r.globalId }})</span>
            <span class="min-w-0 flex-1 text-default">{{ describe(r.ctx) }}</span>
            <UBadge v-if="isStandardContext(r.ctx) && r.ctx.kind === 'client' && r.ctx.subwallet === 0" label="Wallet app default" color="success" variant="subtle" />
            <UBadge v-else-if="isStandardContext(r.ctx)" label="Valid subwallet" color="neutral" variant="subtle" />
          </div>
        </div>
        <p class="text-sm text-muted">
          The network ids −239 and −3 differ only in their last byte, so a wallet_id alone cannot tell the network:
          the mainnet default is also a valid testnet subwallet (236). Read it with the network the wallet lives on.
        </p>
      </template>
    </section>

    <section aria-labelledby="addr-h" class="space-y-3 border-t border-default pt-6">
      <h2 id="addr-h" class="font-display text-base font-semibold text-highlighted">
        Resulting address (optional)
      </h2>
      <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <UFormField label="Public key" hint="64 hex characters">
          <UInput v-model="pubInput" placeholder="02bc2f2b…" class="w-full font-mono" autocomplete="off" spellcheck="false" />
        </UFormField>
        <UFormField label="v4 subwallet_id" :hint="`default ${defaultSubwalletId(mode === 'build' ? workchain : 0)}`">
          <UInputNumber v-model="v4Sub" :min="0" :max="4294967295" placeholder="default" class="w-full" />
        </UFormField>
      </div>
      <UButton
        v-if="!pubInput"
        label="Use a real mainnet W5 key"
        icon="i-lucide-sparkles"
        variant="link"
        size="sm"
        class="px-0"
        @click="pubInput = EXAMPLE_PUB"
      />
      <UAlert v-if="preview && !preview.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="preview.error" />
      <div v-if="preview?.ok" class="divide-y divide-default rounded-lg border border-default px-4 py-1">
        <ResultField v-if="preview.v5" label="W5 (v5R1) with this wallet_id" :value="preview.v5">
          <span>{{ preview.v5 }}</span>
          <div class="mt-1 font-sans">
            <ExplorerLinks :value="preview.v5" :network="preview.testOnly ? 'testnet' : 'mainnet'" />
          </div>
        </ResultField>
        <ResultField :label="`Wallet v4R2 with subwallet_id ${preview.sub}`" :value="preview.v4">
          <span>{{ preview.v4 }}</span>
          <div class="mt-1 font-sans">
            <ExplorerLinks :value="preview.v4" :network="preview.testOnly ? 'testnet' : 'mainnet'" />
          </div>
        </ResultField>
      </div>
      <p v-if="mode === 'decode'" class="text-xs text-dimmed">
        Decode mode builds the address for the site network ({{ network }}) on the basechain.
      </p>
    </section>
  </div>
</template>
