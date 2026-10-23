<script setup lang="ts">
import { RENAME_DATE, TICKERS, scanMessage } from './logic'

const renameDate = new Date(`${RENAME_DATE}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

const changed = [
  `The coin's name: ${COIN_FORMER} → ${COIN_NAME}`,
  `The ticker on exchanges and apps: TON → ${COIN_SYMBOL}`,
  `The small unit's name: ${NANO_FORMER} → ${NANO_NAME}`
]
const unchanged = [
  'Your wallet, address and recovery phrase',
  `Your balance (1 old TON = 1 ${COIN_SYMBOL}, automatically)`,
  'The network: it is still called TON, and exchanges still list deposits on the "TON" network',
  'Jettons, NFTs, .ton domains and smart contracts',
  `On-chain units: 1 ${COIN_SYMBOL} = 1,000,000,000 ${NANO_NAME}`
]

const message = ref('')
const flags = computed(() => scanMessage(message.value))
const scamExample = `URGENT: ${COIN_FORMER} is being replaced by ${COIN_SYMBOL}. Migrate your TON before the deadline or your coins will be lost. Connect your wallet at our official swap site and confirm with your 24 words.`

const faq = [
  { q: 'Do I need to do anything?', a: 'No. Nothing happened on-chain. Your coins are the same coins; wallets and exchanges simply show a new name.' },
  { q: 'Will my address change?', a: 'No. Addresses (EQ…/UQ…) stay exactly the same. Keep using them.' },
  { q: 'Which network do I pick when withdrawing from an exchange?', a: `The TON network, as before. Only the coin is called ${COIN_SYMBOL} now.` },
  { q: `Is there a ${COIN_SYMBOL} airdrop or bonus for holders?`, a: 'No. Any site offering one for the rename is a scam.' },
  { q: 'Is this related to the old 2019 "Gram" from Telegram\'s TON project?', a: 'The name goes back to it, but there is nothing to redeem: the coin you already hold is the one now called Gram.' }
]
</script>

<template>
  <div class="space-y-8">
    <section class="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <p class="font-display text-xl font-semibold text-highlighted sm:text-2xl">
        {{ COIN_FORMER }} is now called {{ COIN_NAME }} ({{ COIN_SYMBOL }}).
      </p>
      <p class="mt-2 text-toned">
        Since {{ renameDate }} only the name and ticker changed. It is the same coin on the same TON network. <strong>You do not need to migrate, swap or claim anything.</strong>
      </p>
    </section>

    <section class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-lg border border-default p-4">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-pencil" class="size-4 text-primary" aria-hidden="true" /> What changed
        </h3>
        <ul class="mt-2 space-y-1.5 text-sm">
          <li v-for="c in changed" :key="c" class="flex gap-2">
            <span class="text-primary" aria-hidden="true">•</span>{{ c }}
          </li>
        </ul>
      </div>
      <div class="rounded-lg border border-default p-4">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-shield-check" class="size-4 text-success" aria-hidden="true" /> What did not change
        </h3>
        <ul class="mt-2 space-y-1.5 text-sm">
          <li v-for="c in unchanged" :key="c" class="flex gap-2">
            <span class="text-success" aria-hidden="true">✓</span>{{ c }}
          </li>
        </ul>
      </div>
    </section>

    <section class="space-y-3">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-siren"
        :title="`Any “migrate TON to ${COIN_SYMBOL}” message is a scam`"
        :description="`Scammers use the rename to ask for recovery phrases, wallet connections or deposits “to receive ${COIN_SYMBOL}”. Never enter your recovery words anywhere, and never send coins to get coins back.`"
      />
      <UFormField label="Got a message about the rename? Check it here" hint="checked in your browser, never sent">
        <UTextarea v-model="message" :rows="4" autoresize class="w-full" placeholder="Paste the message, email or post…" aria-label="Message to check" />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton label="Try a scam example" size="xs" color="neutral" variant="outline" icon="i-lucide-flask-conical" @click="message = scamExample" />
        <UButton v-if="message" label="Clear" size="xs" color="neutral" variant="ghost" @click="message = ''" />
      </div>

      <div v-if="message.trim()" aria-live="polite">
        <div v-if="flags.length" class="space-y-2">
          <p class="font-semibold text-error">
            {{ flags.length }} red {{ flags.length === 1 ? 'flag' : 'flags' }}: treat this as a scam.
          </p>
          <ul class="space-y-2">
            <li v-for="f in flags" :key="f.id" class="rounded-lg border border-error/30 bg-error/5 p-3">
              <p class="text-sm font-medium text-highlighted">
                {{ f.title }}
              </p>
              <p class="mt-1 text-sm text-toned">
                {{ f.why }}
              </p>
              <p class="mt-1 text-xs text-muted">
                Matched: “<span class="italic">{{ f.match }}</span>”
              </p>
            </li>
          </ul>
        </div>
        <p v-else class="rounded-lg border border-default p-3 text-sm text-toned">
          No known red flags found. That is not a guarantee: if it asks you to do anything because of the rename, it is still not needed.
        </p>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="font-display text-base font-semibold text-highlighted">
        Where to find it now
      </h3>
      <ul class="divide-y divide-default rounded-lg border border-default">
        <li v-for="t in TICKERS" :key="t.venue" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 p-3">
          <ULink :to="t.url" target="_blank" rel="noopener" class="w-24 font-medium text-primary">
            {{ t.venue }}
          </ULink>
          <span class="font-mono text-sm text-highlighted">{{ t.name }}</span>
          <span v-if="t.note" class="w-full text-xs text-muted sm:ms-auto sm:w-auto">{{ t.note }}</span>
        </li>
      </ul>
      <p class="text-xs text-dimmed">
        Checked against each venue's public API on 23 October 2026.
      </p>
    </section>

    <section class="space-y-2">
      <h3 class="font-display text-base font-semibold text-highlighted">
        Questions
      </h3>
      <details v-for="f in faq" :key="f.q" class="group rounded-lg border border-default p-3">
        <summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-highlighted">
          <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed transition group-open:rotate-90" aria-hidden="true" />{{ f.q }}
        </summary>
        <p class="mt-2 ps-6 text-sm text-toned">
          {{ f.a }}
        </p>
      </details>
    </section>

    <p class="text-sm">
      Converting amounts? 1 {{ COIN_SYMBOL }} = 1,000,000,000 {{ NANO_NAME }} (formerly {{ NANO_FORMER }}). Use the <ULink to="/tools/ton-units" class="text-primary">unit converter</ULink>, or check an address before sending with <ULink to="/tools/safe-to-send" class="text-primary">safe to send</ULink>.
    </p>
  </div>
</template>
