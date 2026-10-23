<script setup lang="ts">
import type { Address } from '@ton/core'
import { hexToBase64, statsText } from '~/lib/contracts-read/cells'
import { inspect, type Inspection, type TonapiAccount, type TonapiInspect, type ToncenterAccount } from './logic'

const EXAMPLES = [
  { label: 'USD₮ jetton master', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
  { label: 'Wallet v4R2', value: 'EQDOOjaP487stfk9E38me2LsuunR93JtiY3dGfPWOUOH9XLb' },
  { label: 'USD₮ wallet (library code)', value: 'EQAmJs8wtwK93thF78iD76RQKf9Z3v2sxM57iwpZZtdQAiVM' }
]

const route = useRoute()
const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)
const tc = useToncenter()
const api = useTonapi()
const { isTestnet } = useTonNetwork()

const loading = ref(false)
const error = ref<unknown>(null)
const partialError = ref<unknown>(null)
const result = ref<Inspection | null>(null)
const addr = ref('')

async function run() {
  if (!parsed.value) return
  const a = parsed.value
  const raw = a.toRawString()
  error.value = null
  partialError.value = null
  result.value = null
  loading.value = true
  addr.value = a.toString({ testOnly: isTestnet.value })
  try {
    // tonapi adds interfaces, compiler and the method list; the tool still works from toncenter alone.
    const soft = <T>(p: Promise<T>) => p.catch((e) => {
      partialError.value = e
      return null
    })
    const [acc, info] = await Promise.all([
      tc.v3<ToncenterAccount>('account', { address: raw }),
      soft(api.get<TonapiAccount>(`accounts/${raw}`))
    ])
    // tonapi already failed after its retries: a second call would only add ~7 s of backoff
    const insp = acc.code && !partialError.value ? await soft(api.get<TonapiInspect>(`blockchain/accounts/${raw}/inspect`)) : null
    result.value = inspect(acc, info, insp)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function useExample(v: string) {
  input.value = v
  nextTick(run)
}

const q = (slug: string, params: Record<string, string>) => `/tools/${slug}?${new URLSearchParams(params)}`
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = { active: 'success', uninit: 'warning', frozen: 'error', nonexist: 'neutral' }

if (input.value) onMounted(() => nextTick(run))
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <AddressInput v-model="input" label="Contract address" placeholder="EQ… / UQ… / 0:…" @parsed="parsed = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Inspect" icon="i-lucide-scan-search" :loading="loading" :disabled="!parsed" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="run" />
    <LoadingState v-else-if="loading" label="Reading account state, interfaces and code…" />

    <template v-if="result">
      <UAlert v-if="result.isScam" color="error" variant="subtle" icon="i-lucide-shield-alert" title="Marked as scam by tonapi" description="Do not send funds to this contract." />

      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="result.name" class="font-display font-semibold text-highlighted">{{ result.name }}</span>
          <UBadge :color="STATUS_COLOR[result.status] ?? 'neutral'" variant="subtle" :label="result.status" />
          <UBadge v-if="result.code?.wallet" color="primary" variant="subtle" icon="i-lucide-wallet" :label="result.code.wallet.label" />
          <UBadge v-for="i in result.interfaces" :key="i.id" color="neutral" variant="outline" :label="i.label" />
          <UBadge v-if="result.compiler" color="neutral" variant="soft" icon="i-lucide-braces" :label="result.compiler" />
          <UBadge v-if="result.hasSource" color="success" variant="subtle" icon="i-lucide-file-code" label="Source available" />
        </div>
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span class="text-sm text-muted">Balance <TokenAmount :nano="result.balance" class="font-medium text-highlighted" /></span>
          <ExplorerLinks :value="addr" />
        </div>
      </div>

      <UAlert
        v-if="partialError"
        color="warning"
        variant="subtle"
        icon="i-lucide-info"
        title="Some details are missing"
        description="tonapi did not answer (likely its 1 request/second limit), so interfaces, compiler or the method list may be incomplete. Inspect again in a few seconds."
      />

      <UAlert
        v-if="!result.code"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="No code on chain"
        :description="result.status === 'frozen' ? `The account is frozen for unpaid storage. Frozen state hash: ${result.frozenHash}` : 'This address has no deployed contract. Wallets get their code with the first outgoing transfer.'"
      />

      <section v-if="result.code" class="space-y-2">
        <h3 class="font-display font-semibold text-highlighted">
          Code
        </h3>
        <KeyValue
          :items="[
            { label: 'Code hash (hex)', value: result.code.hashHex },
            { label: 'Code hash (base64)', value: result.code.hashBase64, hint: 'Same hash, in the form toncenter and tonapi use.' },
            ...(result.code.effectiveHash !== result.code.hashHex ? [{ label: 'Library hash = real code hash', value: result.code.effectiveHash, hint: 'The code is a library cell; the real code lives in a masterchain library with this hash.' }] : []),
            { label: 'Size', value: statsText(result.code.stats), mono: false, copy: false }
          ]"
        />
        <UAlert
          v-if="result.code.libraries.length && result.code.effectiveHash === result.code.hashHex"
          color="info"
          variant="subtle"
          icon="i-lucide-library"
          :title="`Uses ${result.code.libraries.length} library cell(s) inside its code`"
        />
        <details class="group">
          <summary class="cursor-pointer text-sm text-primary">
            Show code BOC
          </summary>
          <div class="mt-2 flex justify-end">
            <CopyButton :value="result.code.boc" label="Copy BOC" />
          </div>
          <pre class="mt-1 max-h-40 overflow-auto rounded-md bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap">{{ result.code.boc }}</pre>
        </details>
      </section>

      <section v-if="result.data" class="space-y-2">
        <h3 class="font-display font-semibold text-highlighted">
          Data
        </h3>
        <KeyValue
          :items="[
            { label: 'Data hash (hex)', value: result.data.hashHex },
            { label: 'Data hash (base64)', value: hexToBase64(result.data.hashHex) },
            { label: 'Size', value: statsText(result.data.stats), mono: false, copy: false }
          ]"
        />
        <details>
          <summary class="cursor-pointer text-sm text-primary">
            Show data BOC
          </summary>
          <div class="mt-2 flex justify-end">
            <CopyButton :value="result.data.boc" label="Copy BOC" />
          </div>
          <pre class="mt-1 max-h-40 overflow-auto rounded-md bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap">{{ result.data.boc }}</pre>
        </details>
      </section>

      <section v-if="result.code" class="space-y-2">
        <h3 class="font-display font-semibold text-highlighted">
          Get-methods <span v-if="result.methods.length" class="text-muted">({{ result.methods.length }})</span>
        </h3>
        <p v-if="!result.methods.length" class="text-sm text-muted">
          No named get-methods found in the code{{ partialError ? ' (or tonapi did not answer)' : '' }}.
        </p>
        <div v-else class="flex flex-wrap gap-1.5">
          <UButton
            v-for="m in result.methods"
            :key="m.id"
            :to="q('get-method-runner', { q: addr, method: m.name })"
            :label="m.name"
            size="xs"
            variant="soft"
            color="neutral"
            icon="i-lucide-play"
            class="font-mono"
          />
        </div>
        <p class="text-xs text-muted">
          Click a method to run it on this contract.
        </p>
      </section>

      <div v-if="result.code" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <ULink :to="q('contract-source-verifier-lookup', { q: addr })" class="text-primary">Verified source</ULink>
        <ULink v-if="result.code.libraries.length" :to="q('library-cell-resolver', { q: addr })" class="text-primary">Resolve library code</ULink>
      </div>
    </template>
  </div>
</template>
