<script setup lang="ts">
import { projectCategories } from '~/data'

useSeoMeta({
  title: 'Ecosystem projects',
  description: 'Wallets, DEXs, staking, domains, NFT marketplaces and infrastructure in the TON ecosystem.'
})
</script>

<template>
  <div class="mx-auto max-w-(--ui-container) px-4 py-8 sm:px-6 sm:py-12">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      Ecosystem projects
    </h1>
    <p class="mt-2 max-w-2xl text-muted">
      Well-known projects across TON. A listing here is not an endorsement or financial advice: always do your own research.
    </p>

    <div class="mt-10 space-y-12">
      <section v-for="c in projectCategories" :id="c.id" :key="c.id" :aria-labelledby="`${c.id}-h`">
        <h2 :id="`${c.id}-h`" class="flex items-center gap-2 font-display text-xl font-semibold text-highlighted">
          <UIcon :name="c.icon" class="size-5 text-primary" />{{ c.title }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ c.description }}
        </p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a
            v-for="p in c.projects"
            :key="p.url"
            :href="p.url"
            target="_blank"
            rel="noopener"
            class="group rounded-lg border border-default p-4 transition-colors hover:border-primary/50"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="font-medium text-highlighted group-hover:text-primary">{{ p.name }}</span>
              <UIcon name="i-lucide-external-link" class="size-4 text-dimmed" />
            </span>
            <span class="mt-1 block text-sm text-muted">{{ p.description }}</span>
            <span class="mt-2 block font-mono text-xs text-dimmed">{{ p.url.replace(/^https:\/\//, '') }}</span>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>
