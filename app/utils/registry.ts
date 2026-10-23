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

/** Tools matching every term, best first: whole-word name hits, name hits, keyword hits, the rest (stable within a rank). */
export function searchTools(query: string, list: ToolMeta[] = toolRegistry): ToolMeta[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return list
  const scored: { t: ToolMeta, score: number }[] = []
  for (const t of list) {
    const name = t.name.toLowerCase()
    const keys = t.keywords.join(' ').toLowerCase()
    const hay = [name, t.short, t.description, t.slug, t.category, keys].join(' ').toLowerCase()
    if (!terms.every(term => hay.includes(term))) continue
    const atWord = (text: string, term: string) => text.startsWith(term) || text.includes(` ${term}`)
    const phrase = terms.length > 1 && (name.includes(terms.join(' ')) || keys.includes(terms.join(' '))) ? 3 : 0
    scored.push({ t, score: phrase + terms.reduce((n, term) => n + (atWord(name, term) ? 4 : name.includes(term) ? 3 : atWord(keys, term) ? 2 : 1), 0) })
  }
  return scored.sort((a, b) => b.score - a.score).map(x => x.t)
}
