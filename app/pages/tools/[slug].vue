<script setup lang="ts">
import type { Component } from 'vue'

const route = useRoute()
const slug = route.params.slug as string
const tool = getTool(slug)
if (!tool) throw createError({ statusCode: 404, statusMessage: 'Tool not found', fatal: true })

// Tool UIs are client-only islands: the server build never contains them (or @ton/* crypto).
const loaders = import.meta.client
  ? import.meta.glob<{ default: Component }>('../../tools/*/Tool.vue')
  : {}
const loader = loaders[`../../tools/${slug}/Tool.vue`]
const ToolComponent = loader ? defineAsyncComponent(loader) : null

const related = (tool.related ?? []).map(getTool).filter((t): t is ToolMeta => !!t)
const siblings = toolsInCategory(tool.category).filter(t => t.slug !== slug && !tool.related?.includes(t.slug)).slice(0, 4)
const more = [...related, ...siblings]

useSeoMeta({
  title: tool.name,
  description: tool.description,
  ogTitle: `${tool.name} · TonUtils`,
  ogDescription: tool.description
})
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
    <ToolShell :tool="tool!">
      <ClientOnly>
        <component :is="ToolComponent" v-if="ToolComponent" />
        <template #fallback>
          <div class="space-y-4" aria-busy="true" aria-label="Loading tool">
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-11 w-full" />
            <USkeleton class="h-24 w-full" />
          </div>
        </template>
      </ClientOnly>
    </ToolShell>

    <section v-if="more.length" class="mt-14" aria-labelledby="more-h">
      <h2 id="more-h" class="font-display text-lg font-semibold text-highlighted">
        Related tools
      </h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <ToolCard v-for="t in more" :key="t.slug" :tool="t" />
      </div>
    </section>
  </div>
</template>
