import type { CategoryId } from './categories'
import type { ToolMeta } from './tool'

// Auto-discovery: every app/tools/<slug>/meta.ts registers itself. No central list.
const modules = import.meta.glob<{ default: ToolMeta }>('../tools/*/meta.ts', { eager: true })

export const toolRegistry: ToolMeta[] = Object.values(modules)
  .map(m => m.default)
  .sort((a, b) => a.name.localeCompare(b.name))

/** Folder name for each registered tool, used to check slug === folder. */
export const toolFolders: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, m]) => [m.default.slug, path.split('/').at(-2)!])
)

export function getTool(slug: string): ToolMeta | undefined {
  return toolRegistry.find(t => t.slug === slug)
}

export function toolsInCategory(category: CategoryId): ToolMeta[] {
  return toolRegistry.filter(t => t.category === category)
}

export function searchTools(query: string, list: ToolMeta[] = toolRegistry): ToolMeta[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return list
  return list.filter((t) => {
    const hay = [t.name, t.short, t.description, t.slug, t.category, ...t.keywords].join(' ').toLowerCase()
    return terms.every(term => hay.includes(term))
  })
}
