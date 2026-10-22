<script setup lang="ts">
const searchOpen = useState('search-open', () => false)
const route = useRoute()
const nav = [
  { label: 'Tools', to: '/tools' },
  { label: 'Links', to: '/links' },
  { label: 'Projects', to: '/projects' },
  { label: 'About', to: '/about' }
]
const mobileOpen = ref(false)
watch(() => route.path, () => (mobileOpen.value = false))
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-default bg-default/85 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-(--ui-container) items-center gap-3 px-4 sm:px-6">
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2" aria-label="TonUtils home">
        <AppLogo class="size-7" />
        <span class="font-display text-lg font-semibold tracking-tight text-highlighted">ton<span class="text-primary">utils</span></span>
      </NuxtLink>

      <nav class="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
        <ULink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-highlighted"
          active-class="text-highlighted bg-elevated"
        >
          {{ item.label }}
        </ULink>
      </nav>

      <button
        type="button"
        class="ml-auto flex h-9 items-center gap-2 rounded-md border border-default bg-muted/60 px-2.5 text-sm text-muted transition-colors hover:border-accented hover:text-highlighted sm:w-64 lg:w-72"
        aria-label="Search tools"
        @click="searchOpen = true"
      >
        <UIcon name="i-lucide-search" class="size-4" />
        <span class="hidden sm:inline">Search tools</span>
        <span class="ml-auto hidden items-center gap-0.5 sm:flex">
          <UKbd value="meta" size="sm" /><UKbd value="K" size="sm" />
        </span>
      </button>

      <ClientOnly>
        <NetworkSwitch class="hidden sm:inline-flex" />
        <template #fallback>
          <div class="hidden h-8 w-24 sm:block" />
        </template>
      </ClientOnly>

      <ClientOnly>
        <WalletButton />
        <template #fallback>
          <div class="h-8 w-22 sm:w-36" />
        </template>
      </ClientOnly>

      <UColorModeButton size="sm" />
      <UButton
        to="https://github.com/ugorur/tonutils"
        target="_blank"
        icon="i-lucide-github"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Source code on GitHub"
        class="hidden sm:inline-flex"
      />
      <UButton
        icon="i-lucide-menu"
        color="neutral"
        variant="ghost"
        size="sm"
        class="md:hidden"
        aria-label="Open menu"
        @click="mobileOpen = true"
      />
    </div>

    <USlideover v-model:open="mobileOpen" title="Menu" side="right" :ui="{ content: 'max-w-xs' }">
      <template #body>
        <nav class="flex flex-col gap-1" aria-label="Mobile">
          <ULink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="rounded-md px-3 py-2.5 text-base text-default hover:bg-elevated"
            active-class="bg-elevated text-highlighted"
          >
            {{ item.label }}
          </ULink>
        </nav>
        <div class="mt-6 flex items-center gap-3 border-t border-default pt-6">
          <ClientOnly><NetworkSwitch /></ClientOnly>
          <UButton
            to="https://github.com/ugorur/tonutils"
            target="_blank"
            icon="i-lucide-github"
            label="GitHub"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </div>
      </template>
    </USlideover>
    <AppSearch v-model:open="searchOpen" />
  </header>
</template>
