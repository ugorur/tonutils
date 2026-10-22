import type { LinkCategory, ProjectCategory } from './types'

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

export const linkCategories: LinkCategory[] = Object.values(
  import.meta.glob<{ default: LinkCategory }>('./links/*.ts', { eager: true })
).map(m => m.default).sort(byOrder)

export const projectCategories: ProjectCategory[] = Object.values(
  import.meta.glob<{ default: ProjectCategory }>('./projects/*.ts', { eager: true })
).map(m => m.default).sort(byOrder)
