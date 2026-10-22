<script setup lang="ts">
import { linkCategories, projectCategories } from '~/data'

const searchOpen = useState('search-open', () => false)
const featured = toolRegistry.filter(t => t.featured)
const categories = CATEGORY_IDS
  .map(id => ({ id, ...CATEGORIES[id], count: toolsInCategory(id).length }))
  .sort((a, b) => b.count - a.count)
const projects = projectCategories.flatMap(c => c.projects.filter(p => p.featured).map(p => ({ ...p, category: c.title })))
const linkTeaser = linkCategories.slice(0, 3)

useSeoMeta({
  title: 'TonUtils',
  description: 'Free TON blockchain tools for everyone: convert addresses, generate wallets, convert GRAM (formerly Toncoin) amounts and read the chain. Keys stay in your browser.',
  ogTitle: 'TonUtils: free TON blockchain tools',
  ogDescription: 'Convert addresses, generate wallets, convert GRAM (formerly Toncoin) amounts and read the chain. Keys stay in your browser.'
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative overflow-hidden border-b border-default">
      <div
        class="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_80%_10%,color-mix(in_oklab,var(--color-ton-500)_22%,transparent),transparent_55%)]"
        aria-hidden="true"
      />
      <div class="relative mx-auto grid max-w-(--ui-container) items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <h1 class="font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-highlighted sm:text-6xl">
            The TON toolbox.
          </h1>
          <p class="mt-5 max-w-xl text-lg text-pretty text-muted">
            Convert addresses, create wallets, check amounts and read the chain. Free and open source, and your seed phrase never leaves this browser.
          </p>

          <button
            type="button"
            class="mt-8 flex w-full max-w-xl items-center gap-3 rounded-xl border border-accented bg-default px-4 py-3.5 text-left text-muted shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary"
            @click="searchOpen = true"
          >
            <UIcon name="i-lucide-search" class="size-5 text-primary" />
            <span class="flex-1">Search {{ toolRegistry.length }} tools</span>
            <span class="hidden items-center gap-0.5 sm:flex"><UKbd value="meta" /><UKbd value="K" /></span>
          </button>

          <ul class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <li class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-shield-check" class="size-4 text-success" />Keys stay on your device
            </li>
            <li class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-github" class="size-4" />Open source
            </li>
            <li class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-user-x" class="size-4" />No sign-up
            </li>
          </ul>
        </div>

        <AddressAnatomy />
      </div>
    </section>

    <!-- Popular -->
    <section class="mx-auto max-w-(--ui-container) px-4 pt-16 sm:px-6" aria-labelledby="popular-h">
      <div class="flex items-end justify-between gap-4">
        <h2 id="popular-h" class="font-display text-2xl font-semibold tracking-tight text-highlighted">
          Start here
        </h2>
        <ULink to="/tools" class="text-sm text-primary hover:underline">
          All tools
        </ULink>
      </div>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ToolCard v-for="t in featured" :key="t.slug" :tool="t" />
      </div>
    </section>

    <!-- Categories -->
    <section class="mx-auto max-w-(--ui-container) px-4 pt-16 sm:px-6" aria-labelledby="cat-h">
      <h2 id="cat-h" class="font-display text-2xl font-semibold tracking-tight text-highlighted">
        Browse by topic
      </h2>
      <ul class="mt-5 grid border-t border-default sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="c in categories" :key="c.id" class="border-b border-default">
          <NuxtLink
            :to="`/categories/${c.id}`"
            class="group flex items-start gap-3 px-1 py-4 transition-colors hover:bg-elevated/60 sm:px-3"
          >
            <UIcon :name="c.icon" class="mt-0.5 size-5 shrink-0" :class="c.count ? 'text-primary' : 'text-dimmed'" />
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-2">
                <span class="font-medium text-highlighted group-hover:text-primary">{{ c.name }}</span>
                <span class="font-mono text-xs tabular-nums" :class="c.count ? 'text-muted' : 'text-dimmed'">{{ c.count || 'soon' }}</span>
              </span>
              <span class="mt-0.5 block text-sm text-muted">{{ c.description }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- Projects -->
    <section class="mx-auto max-w-(--ui-container) px-4 pt-16 sm:px-6" aria-labelledby="proj-h">
      <div class="flex items-end justify-between gap-4">
        <h2 id="proj-h" class="font-display text-2xl font-semibold tracking-tight text-highlighted">
          Around the ecosystem
        </h2>
        <ULink to="/projects" class="text-sm text-primary hover:underline">
          All projects
        </ULink>
      </div>
      <ul class="-mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        <li v-for="p in projects" :key="p.url" class="w-56 shrink-0 snap-start sm:w-auto">
          <a :href="p.url" target="_blank" rel="noopener" class="block h-full rounded-lg border border-default p-4 transition-colors hover:border-primary/50">
            <span class="text-xs text-dimmed">{{ p.category }}</span>
            <span class="mt-1 flex items-center gap-1 font-medium text-highlighted">{{ p.name }}<UIcon name="i-lucide-external-link" class="size-3.5 text-dimmed" /></span>
            <span class="mt-1 block text-sm text-muted">{{ p.description }}</span>
          </a>
        </li>
      </ul>
    </section>

    <!-- Links -->
    <section class="mx-auto max-w-(--ui-container) px-4 pt-16 sm:px-6" aria-labelledby="links-h">
      <div class="flex items-end justify-between gap-4">
        <h2 id="links-h" class="font-display text-2xl font-semibold tracking-tight text-highlighted">
          Learn and build
        </h2>
        <ULink to="/links" class="text-sm text-primary hover:underline">
          All links
        </ULink>
      </div>
      <div class="mt-5 grid gap-8 md:grid-cols-3">
        <div v-for="c in linkTeaser" :key="c.id">
          <h3 class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon :name="c.icon" class="size-4 text-primary" />{{ c.title }}
          </h3>
          <ul class="mt-3 space-y-2.5">
            <li v-for="l in c.links.slice(0, 3)" :key="l.url">
              <a :href="l.url" target="_blank" rel="noopener" class="group block">
                <span class="text-sm text-default underline-offset-2 group-hover:text-primary group-hover:underline">{{ l.title }}</span>
                <span class="block text-xs text-muted">{{ l.description }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
