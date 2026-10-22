<script setup lang="ts">
import { linkCategories } from '~/data'

useSeoMeta({
  title: 'Links & guides',
  description: 'Hand-picked TON documentation, developer tools, explorers and APIs. Every link checked.'
})
</script>

<template>
  <div class="mx-auto max-w-(--ui-container) px-4 py-8 sm:px-6 sm:py-12">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      Links & guides
    </h1>
    <p class="mt-2 max-w-2xl text-muted">
      Hand-picked places to learn TON, build on it and look things up. Know a better one? Open an issue on GitHub.
    </p>

    <div class="mt-10 space-y-12">
      <section v-for="c in linkCategories" :id="c.id" :key="c.id" :aria-labelledby="`${c.id}-h`">
        <h2 :id="`${c.id}-h`" class="flex items-center gap-2 font-display text-xl font-semibold text-highlighted">
          <UIcon :name="c.icon" class="size-5 text-primary" />{{ c.title }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ c.description }}
        </p>
        <ul class="mt-4 grid border-t border-default md:grid-cols-2">
          <li v-for="l in c.links" :key="l.url" class="border-b border-default">
            <a :href="l.url" target="_blank" rel="noopener" class="group flex items-start gap-3 px-1 py-3.5 hover:bg-elevated/60 sm:px-3">
              <span class="min-w-0 flex-1">
                <span class="font-medium text-highlighted group-hover:text-primary">{{ l.title }}</span>
                <span class="block text-sm text-muted">{{ l.description }}</span>
                <span class="mt-1 block truncate font-mono text-xs text-dimmed">{{ l.url.replace(/^https:\/\//, '') }}</span>
              </span>
              <UIcon name="i-lucide-external-link" class="mt-1 size-4 shrink-0 text-dimmed" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
