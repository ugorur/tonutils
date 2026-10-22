<script setup lang="ts">
useSeoMeta({
  title: 'About & privacy',
  description: 'What TonUtils is, how it handles your data, and where the source code lives.'
})

const promises = [
  { icon: 'i-lucide-cpu', title: 'Your browser does the work', text: 'Seed phrases, private keys and signatures are computed in JavaScript on your device. They are never sent to our server, and we do not have a server that could receive them.' },
  { icon: 'i-lucide-radio-tower', title: 'Chain data comes from public APIs', text: 'Tools that read the blockchain call toncenter or tonapi directly from your browser. The address you look up is visible to that API, like on any explorer.' },
  { icon: 'i-lucide-wallet', title: 'Your wallet signs, not us', text: 'Tools that send transactions use TonConnect. You approve each one in your own wallet app. TonUtils never holds keys or funds.' },
  { icon: 'i-lucide-eye-off', title: 'No accounts, no tracking of inputs', text: 'There is no sign-up. We do not log what you type into tools. The only thing we keep is your mainnet/testnet choice, in a cookie on your device.' }
]
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      About TonUtils
    </h1>
    <p class="mt-4 text-lg text-muted">
      TonUtils is a free toolbox for The Open Network. People who hold {{ COIN_NAME }} ({{ COIN_SYMBOL }}, formerly {{ COIN_FORMER }}) get simple, safe tools for everyday questions: which address is mine, how much is this in {{ NANO_NAME }}, what does this transaction do. Developers get the converters, decoders and lookups they would otherwise rewrite for every project.
    </p>

    <UAlert
      class="mt-6"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="COIN_RENAME_NOTE"
      :description="`The coin was renamed on 15 June 2026. Balances, addresses and units did not change: 1 ${COIN_SYMBOL} is still 1,000,000,000 ${NANO_NAME} (${NANO_FORMER}). There is nothing to swap; any “migration” offer is a scam.`"
    />

    <h2 class="mt-12 font-display text-xl font-semibold text-highlighted">
      Privacy promise
    </h2>
    <ul class="mt-5 space-y-5">
      <li v-for="p in promises" :key="p.title" class="flex gap-4">
        <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <UIcon :name="p.icon" class="size-5" />
        </div>
        <div>
          <h3 class="font-medium text-highlighted">
            {{ p.title }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            {{ p.text }}
          </p>
        </div>
      </li>
    </ul>

    <h2 class="mt-12 font-display text-xl font-semibold text-highlighted">
      Open source
    </h2>
    <p class="mt-3 text-muted">
      Every line is public, so you can check these promises yourself. Tools are small, self-contained folders with tests, which makes them easy to review and to contribute.
    </p>
    <div class="mt-5 flex flex-wrap gap-3">
      <UButton to="https://github.com/ugorur/tonutils" target="_blank" icon="i-lucide-github" label="View source on GitHub" />
      <UButton to="https://github.com/ugorur/tonutils/issues/new" target="_blank" icon="i-lucide-lightbulb" label="Suggest a tool" color="neutral" variant="outline" />
    </div>

    <p class="mt-12 border-t border-default pt-6 text-sm text-dimmed">
      TonUtils is an independent project and is not affiliated with the TON Foundation. Tools are provided as is. Double-check addresses and amounts before you send funds.
    </p>
  </div>
</template>
