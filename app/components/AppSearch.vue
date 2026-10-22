<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

// Global Cmd/Ctrl+K palette over the tool registry and categories.
const open = defineModel<boolean>('open', { default: false })

defineShortcuts({
  meta_k: () => (open.value = !open.value),
  '/': () => (open.value = true)
})

const go = (to: string) => () => {
  open.value = false
  navigateTo(to)
}

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
  {
    id: 'tools',
    label: 'Tools',
    items: toolRegistry.map(t => ({
      label: t.name,
      suffix: t.short,
      icon: t.icon,
      // Fuse searches these too
      keywords: t.keywords,
      onSelect: go(`/tools/${t.slug}`)
    }))
  },
  {
    id: 'categories',
    label: 'Categories',
    items: CATEGORY_IDS.map(id => ({
      label: CATEGORIES[id].name,
      icon: CATEGORIES[id].icon,
      onSelect: go(`/categories/${id}`)
    }))
  },
  {
    id: 'pages',
    label: 'Pages',
    items: [
      { label: 'All tools', icon: 'i-lucide-layout-grid', onSelect: go('/tools') },
      { label: 'Links & guides', icon: 'i-lucide-book-open', onSelect: go('/links') },
      { label: 'Ecosystem projects', icon: 'i-lucide-orbit', onSelect: go('/projects') },
      { label: 'About & privacy', icon: 'i-lucide-info', onSelect: go('/about') }
    ]
  }
])
</script>

<template>
  <UModal v-model:open="open" title="Search tools" description="Search every tool, category and page" :ui="{ content: 'sm:max-w-2xl' }">
    <template #content>
      <UCommandPalette
        :groups="groups"
        placeholder="Search tools: address, mnemonic, nanoTON…"
        :fuse="{ fuseOptions: { keys: ['label', 'suffix', 'keywords'] } }"
        class="max-h-[min(32rem,80dvh)]"
        close
        @update:open="open = $event"
      />
    </template>
  </UModal>
</template>
