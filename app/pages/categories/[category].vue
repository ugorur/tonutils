<script setup lang="ts">
const route = useRoute()
const id = route.params.category as string
if (!isCategoryId(id)) throw createError({ statusCode: 404, statusMessage: 'Category not found', fatal: true })
const category = CATEGORIES[id]
const tools = toolsInCategory(id)

useSeoMeta({
  title: `${category.name} tools`,
  description: `${category.description} Free TON tools on TonUtils.`
})
</script>

<template>
  <div class="mx-auto max-w-(--ui-container) px-4 py-8 sm:px-6 sm:py-12">
    <nav aria-label="Breadcrumb" class="mb-5 text-sm text-muted">
      <ULink to="/tools" class="hover:text-highlighted">
        Tools
      </ULink>
    </nav>
    <div class="flex items-start gap-4">
      <div class="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <UIcon :name="category.icon" class="size-6" />
      </div>
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted">
          {{ category.name }}
        </h1>
        <p class="mt-2 max-w-2xl text-muted">
          {{ category.description }}
        </p>
      </div>
    </div>

    <div v-if="tools.length" class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ToolCard v-for="t in tools" :key="t.slug" :tool="t" />
    </div>
    <div v-else class="mt-8 rounded-lg border border-dashed border-default p-10 text-center">
      <p class="text-highlighted">
        Tools for this category are on the way.
      </p>
      <p class="mt-1 text-sm text-muted">
        Need one now? <a href="https://github.com/ugorur/tonutils/issues/new" target="_blank" rel="noopener" class="text-primary underline-offset-2 hover:underline">Tell us what to build</a> or browse
        <NuxtLink to="/tools" class="text-primary underline-offset-2 hover:underline">all tools</NuxtLink>.
      </p>
    </div>
  </div>
</template>
