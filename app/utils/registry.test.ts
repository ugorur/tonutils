import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './categories'
import { searchTools, toolFolders, toolRegistry } from './registry'

describe('tool registry', () => {
  it('discovers tools', () => {
    expect(toolRegistry.length).toBeGreaterThan(0)
  })

  it.each(toolRegistry.map(t => [t.slug, t]))('%s has a valid meta.ts', (slug, t) => {
    expect(toolFolders[slug]).toBe(slug)
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(CATEGORIES[t.category]).toBeDefined()
    expect(t.icon).toMatch(/^i-lucide-/)
    expect(t.short.length).toBeLessThanOrEqual(100)
    for (const r of t.related ?? []) expect(toolFolders[r], `related tool "${r}" does not exist`).toBeDefined()
  })

  it('has unique slugs', () => {
    const slugs = toolRegistry.map(t => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('searches by keyword', () => {
    expect(searchTools('nanoton').map(t => t.slug)).toContain('ton-units')
  })

  it('ranks name matches first', () => {
    expect(searchTools('send ton')[0]?.slug).toBe('send-ton')
    expect(searchTools('exit code')[0]?.slug).toBe('tvm-exit-codes')
  })
})
