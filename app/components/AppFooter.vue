<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-24 border-t border-default">
    <div class="mx-auto grid max-w-(--ui-container) gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
      <div>
        <NuxtLink to="/" class="flex items-center gap-2">
          <AppLogo class="size-6" />
          <span class="font-display font-semibold text-highlighted">tonutils</span>
        </NuxtLink>
        <p class="mt-3 max-w-sm text-sm text-muted">
          A free, open-source toolbox for TON. Keys and seed phrases are handled in your browser and never reach a server.
        </p>
      </div>
      <nav aria-label="Footer: site" class="flex flex-col gap-2 text-sm">
        <NuxtLink to="/tools" class="text-muted hover:text-highlighted">All tools</NuxtLink>
        <NuxtLink to="/links" class="text-muted hover:text-highlighted">Links & guides</NuxtLink>
        <NuxtLink to="/projects" class="text-muted hover:text-highlighted">Ecosystem projects</NuxtLink>
        <NuxtLink to="/about" class="text-muted hover:text-highlighted">About & privacy</NuxtLink>
      </nav>
      <nav aria-label="Footer: project" class="flex flex-col gap-2 text-sm">
        <a href="https://github.com/ugorur/tonutils" target="_blank" rel="noopener" class="text-muted hover:text-highlighted">Source on GitHub</a>
        <a href="https://github.com/ugorur/tonutils/issues/new" target="_blank" rel="noopener" class="text-muted hover:text-highlighted">Suggest a tool</a>
        <a href="https://docs.ton.org" target="_blank" rel="noopener" class="text-muted hover:text-highlighted">TON documentation</a>
      </nav>
    </div>
    <div class="mx-auto max-w-(--ui-container) px-4 sm:px-6"><div class="chain-rule" /></div>
    <p class="mx-auto max-w-(--ui-container) px-4 py-5 text-xs text-dimmed sm:px-6">
      © {{ year }} TonUtils. Not affiliated with the TON Foundation. Always double-check addresses and amounts before you send funds.
    </p>
  </footer>
</template>
