<script setup lang="ts">
import type { PhraseCheck, Verdict } from './logic'
import { checkPhrase } from './logic'

const EXAMPLES = [
  { label: 'TON phrase', text: 'hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution' },
  { label: 'BIP39 phrase', text: 'legal winner thank year wave sausage worth useful legal winner thank yellow' },
  { label: 'Typo', text: 'hospital stove relief fringe tongue alwais charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution' }
]

const phrase = ref('')
const hidden = ref(false)
const check = ref<PhraseCheck | null>(null)
let run = 0
let timer: ReturnType<typeof setTimeout> | undefined

watch(phrase, (text) => {
  clearTimeout(timer)
  const id = ++run
  timer = setTimeout(async () => {
    const r = await checkPhrase(text)
    if (id === run) check.value = r
  }, 250)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  phrase.value = ''
  check.value = null
})

function replaceWord(index: number, word: string) {
  const words = check.value!.words.map(w => w.word)
  words[index] = word
  phrase.value = words.join(' ')
}

const VERDICTS: Record<Exclude<Verdict, 'empty'>, { color: 'success' | 'info' | 'warning' | 'error', icon: string, title: string, text: string }> = {
  'ton': { color: 'success', icon: 'i-lucide-circle-check', title: 'Valid TON mnemonic', text: 'TON wallet apps (Tonkeeper, MyTonWallet, Tonhub, TON Space) will restore it. The words pass TON\'s own check, which uses no password.' },
  'ton-password': { color: 'info', icon: 'i-lucide-lock-keyhole', title: 'TON mnemonic with a password', text: 'The words carry TON\'s "password needed" marker: they only open a wallet together with the password chosen at creation. Most wallet apps never set one.' },
  'bip39': { color: 'info', icon: 'i-lucide-git-fork', title: 'Valid BIP39 mnemonic, not a TON one', text: 'This is the multichain standard used by Trust Wallet, Ledger and others. TON-only apps reject it or derive different keys. Use the BIP39 tool to see which TON addresses it controls.' },
  'both': { color: 'warning', icon: 'i-lucide-split', title: 'Valid as both TON and BIP39', text: 'Rare, but it happens. A TON wallet app and a multichain wallet will open different addresses from it. Check both tools to find your funds.' },
  'neither': { color: 'error', icon: 'i-lucide-circle-x', title: 'Not a valid TON or BIP39 phrase', text: 'Every word is in the list, but neither checksum matches. A word may be wrong, missing or out of order.' },
  'unknown-words': { color: 'error', icon: 'i-lucide-spell-check', title: 'Some words are not in the word list', text: 'Fix the highlighted words; click a suggestion to replace it.' }
}
const verdict = computed(() => {
  const c = check.value
  if (!c || c.verdict === 'empty') return null
  const v = VERDICTS[c.verdict]
  // tonlib's check has no word count, but TON wallet apps expect 24 words.
  if (c.ton === 'ton' && c.count !== 24) {
    return { ...v, text: `The words pass TON's checksum, but TON wallet apps expect 24 words, so most will not restore this ${c.count}-word phrase as a TON one.${c.bip39 ? ' As BIP39 it works in multichain wallets: see the BIP39 tool.' : ''}` }
  }
  return v
})
</script>

<template>
  <div class="space-y-6">
    <UFormField label="Seed phrase" hint="checked locally as you type" help="Nothing is sent anywhere. For a funded wallet, prefer doing this offline.">
      <UTextarea
        v-model="phrase"
        :rows="3"
        autoresize
        class="w-full font-mono"
        :class="hidden && '[&_textarea]:blur-sm'"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="word1 word2 word3 …"
      />
    </UFormField>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <USwitch v-model="hidden" label="Hide words" size="sm" />
      <span v-if="!phrase" class="text-sm text-muted">Try:</span>
      <template v-if="!phrase">
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="phrase = e.text" />
      </template>
      <UButton v-else label="Clear" icon="i-lucide-eraser" color="neutral" variant="ghost" size="sm" @click="phrase = ''" />
    </div>

    <template v-if="check && verdict">
      <UAlert :color="verdict.color" variant="subtle" :icon="verdict.icon" :title="verdict.title" :description="verdict.text" data-testid="verdict">
        <template v-if="check.verdict !== 'unknown-words' && check.verdict !== 'neither'" #actions>
          <UButton v-if="check.ton !== 'none'" to="/tools/mnemonic-to-addresses" label="TON addresses" size="xs" :color="verdict.color" variant="outline" trailing-icon="i-lucide-arrow-right" />
          <UButton v-if="check.bip39" to="/tools/bip39-ton-derivation" label="BIP39 addresses" size="xs" :color="verdict.color" variant="outline" trailing-icon="i-lucide-arrow-right" />
        </template>
      </UAlert>

      <div class="flex flex-wrap gap-2 text-sm">
        <UBadge :label="`${check.count} words`" color="neutral" variant="subtle" />
        <UBadge
          :label="check.count === 24 ? 'TON wallets use 24 words' : `TON wallet apps expect 24 words`"
          :color="check.count === 24 ? 'success' : 'warning'"
          variant="subtle"
        />
        <UBadge
          :label="check.bip39Length ? 'BIP39 length OK' : 'BIP39 needs 12, 15, 18, 21 or 24 words'"
          :color="check.bip39Length ? 'success' : 'neutral'"
          variant="subtle"
        />
      </div>

      <ol class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-default bg-(--ui-border) sm:grid-cols-3 lg:grid-cols-4" aria-label="Words">
        <li v-for="(w, i) in check.words" :key="i" class="bg-default px-3 py-2" :class="!w.known && 'bg-error/10'">
          <div class="flex items-baseline gap-2">
            <span class="w-5 text-right font-mono text-xs text-dimmed tabular-nums">{{ i + 1 }}</span>
            <span class="font-mono text-sm transition-[filter]" :class="[w.known ? 'text-highlighted' : 'text-error line-through', hidden && 'blur-sm']">{{ w.word }}</span>
          </div>
          <div v-if="!w.known" class="mt-1 flex flex-wrap gap-1 pl-7">
            <UButton v-for="s in w.suggestions" :key="s" :label="s" size="xs" color="neutral" variant="outline" class="font-mono" @click="replaceWord(i, s)" />
            <span v-if="!w.suggestions.length" class="text-xs text-dimmed">no close match</span>
          </div>
        </li>
      </ol>
    </template>

    <section aria-labelledby="explain-h" class="space-y-2 border-t border-default pt-6 text-sm text-muted">
      <h2 id="explain-h" class="font-display text-base font-semibold text-highlighted">
        TON vs BIP39 phrases
      </h2>
      <p>
        Both use the same 2048-word English list, but they turn words into keys differently. A <strong class="text-default">TON mnemonic</strong>
        (24 words, Tonkeeper, MyTonWallet, Tonhub, TON Space) is checked and hashed with TON's own PBKDF2 scheme. A
        <strong class="text-default">BIP39 mnemonic</strong> (Trust Wallet, Ledger and other multichain wallets) has a checksum in its last word
        and derives the TON key along a path such as <span class="font-mono">m/44'/607'/0'</span> (Trust Wallet) or
        <span class="font-mono">m/44'/607'/0'/0'/0'/0'</span> (Ledger).
      </p>
      <p>
        Restoring a BIP39 phrase in a TON-only app, or the other way around, opens a different, empty wallet. Your funds are not lost:
        open the phrase with the tool that matches how it was created.
      </p>
    </section>
  </div>
</template>
