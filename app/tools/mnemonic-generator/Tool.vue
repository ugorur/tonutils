<script setup lang="ts">
import type { DerivedKeys } from './logic'
import { deriveFromMnemonic, generateMnemonic } from './logic'

const words = ref<string[]>([])
const keys = ref<DerivedKeys | null>(null)
const busy = ref(false)
const error = ref('')
const revealed = ref(true)
const showPrivate = ref(false)
const { network } = useTonNetwork()
const tab = ref<string>(network.value)

async function generate() {
  busy.value = true
  error.value = ''
  showPrivate.value = false
  try {
    const w = await generateMnemonic()
    keys.value = await deriveFromMnemonic(w)
    words.value = w
    revealed.value = true
  }
  catch (e) {
    error.value = `Could not generate a phrase: ${(e as Error).message}`
  }
  finally {
    busy.value = false
  }
}

function wipe() {
  words.value = []
  keys.value = null
  showPrivate.value = false
}

onBeforeUnmount(wipe)

const phrase = computed(() => words.value.join(' '))
const wallets = computed(() =>
  (keys.value?.wallets ?? []).map(w => ({ ...w, forms: tab.value === 'testnet' ? w.testnet : w.mainnet }))
)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Anyone with these 24 words owns the wallet"
      description="The phrase is created by your browser's secure random generator and never leaves this page. Write it on paper. Do not screenshot it, paste it into chats or store it in cloud notes. For real funds, a hardware wallet or an official wallet app is the safer choice."
    />

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        :label="words.length ? 'Generate another' : 'Generate seed phrase'"
        icon="i-lucide-refresh-cw"
        size="lg"
        :loading="busy"
        @click="generate"
      />
      <template v-if="words.length">
        <UButton
          :icon="revealed ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :label="revealed ? 'Hide words' : 'Show words'"
          color="neutral"
          variant="outline"
          size="lg"
          @click="revealed = !revealed"
        />
        <CopyButton :value="phrase" label="Copy phrase" size="lg" />
        <UButton label="Clear" icon="i-lucide-eraser" color="neutral" variant="ghost" size="lg" @click="wipe" />
      </template>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="error" />

    <template v-if="words.length && keys">
      <ol
        class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-default bg-(--ui-border) sm:grid-cols-3 lg:grid-cols-4"
        :class="!revealed && 'select-none'"
        aria-label="Seed phrase, 24 words in order"
        data-testid="mnemonic-words"
      >
        <li v-for="(w, i) in words" :key="i" class="flex items-baseline gap-2 bg-default px-3 py-2">
          <span class="w-5 text-right font-mono text-xs text-dimmed tabular-nums">{{ i + 1 }}</span>
          <span class="font-mono text-sm text-highlighted transition-[filter]" :class="!revealed && 'blur-sm'">{{ w }}</span>
        </li>
      </ol>

      <section aria-labelledby="keys-h">
        <h2 id="keys-h" class="font-display text-base font-semibold text-highlighted">
          Key pair
        </h2>
        <div class="mt-1 divide-y divide-default">
          <ResultField label="Public key (hex)" :value="keys.publicKey" />
          <ResultField
            label="Private key (32-byte seed, hex)"
            :value="showPrivate ? keys.privateKey : ''"
            :copy="showPrivate"
            hint="Same power as the seed phrase. Reveal only if you need it for a script."
          >
            <span v-if="!showPrivate" class="font-sans">
              <UButton label="Reveal private key" size="xs" color="warning" variant="soft" icon="i-lucide-eye" @click="showPrivate = true" />
            </span>
          </ResultField>
          <ResultField
            v-if="showPrivate"
            label="Secret key (64 bytes: seed + public key, hex)"
            :value="keys.secretKey"
            hint="The format @ton/crypto keyPair.secretKey and TonWeb expect."
          />
        </div>
      </section>

      <section aria-labelledby="wallets-h">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <h2 id="wallets-h" class="font-display text-base font-semibold text-highlighted">
            Wallet addresses
          </h2>
          <UTabs
            v-model="tab"
            :content="false"
            :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]"
            size="sm"
          />
        </div>
        <p class="mt-1 text-sm text-muted">
          One phrase controls a different address per wallet version. Most apps today create W5; older ones use v4R2.
        </p>
        <div class="mt-3 space-y-3">
          <div v-for="w in wallets" :key="w.version" class="rounded-lg border border-default px-4 py-1">
            <div class="pt-2 text-sm font-medium text-highlighted">
              {{ w.label }}
            </div>
            <div class="divide-y divide-default">
              <ResultField label="Receive address (non-bounceable)" :value="w.forms.nonBounceable" />
              <ResultField label="Bounceable" :value="w.forms.bounceable" />
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
