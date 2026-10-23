<script setup lang="ts">
const props = defineProps<{ tool: ToolMeta }>()
const category = computed(() => CATEGORIES[props.tool.category])
const net = computed(() => NETWORK_INFO[props.tool.network])
const privacy = computed(() => props.tool.privacyNote ?? net.value.detail)
</script>

<template>
  <article>
    <nav aria-label="Breadcrumb" class="mb-5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
      <ULink to="/tools" class="hover:text-highlighted">
        Tools
      </ULink>
      <UIcon name="i-lucide-chevron-right" class="size-3.5" />
      <ULink :to="`/categories/${tool.category}`" class="hover:text-highlighted">
        {{ category.name }}
      </ULink>
    </nav>

    <header class="flex items-start gap-4">
      <div class="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <UIcon :name="tool.icon" class="size-6" />
      </div>
      <div class="min-w-0">
        <h1 class="font-display text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          {{ tool.name }}
        </h1>
        <p class="mt-2 max-w-2xl text-pretty text-muted">
          {{ tool.description }}
        </p>
      </div>
    </header>

    <div class="mt-5 flex flex-wrap gap-2">
      <UTooltip :text="privacy" :content="{ side: 'bottom' }">
        <UBadge
          :icon="net.icon"
          :color="tool.network === 'offline' ? 'success' : tool.network === 'wallet' ? 'warning' : 'info'"
          variant="subtle"
          size="lg"
          :label="net.label"
        />
      </UTooltip>
      <UBadge color="neutral" variant="outline" size="lg" :label="AUDIENCE_LABELS[tool.audience]" />
    </div>

    <div class="mt-6 rounded-xl border border-default bg-default p-4 shadow-[0_1px_0_0_var(--ui-border)] sm:p-6 dark:bg-elevated/40">
      <slot />
    </div>

    <p class="mt-3 text-xs text-dimmed">
      {{ privacy }}
    </p>
  </article>
</template>
