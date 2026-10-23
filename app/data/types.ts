export interface LinkItem {
  title: string
  /** Real, verified URL. No placeholders. */
  url: string
  description: string
  /** Lowercase keywords for search and the tag filter. */
  tags?: string[]
}

/** One file per category in app/data/links/<id>.ts, default-exported. */
export interface LinkCategory {
  id: string
  title: string
  description: string
  icon: string
  /** Lower comes first. */
  order: number
  links: LinkItem[]
}

export interface Project {
  name: string
  /** Real, verified URL. */
  url: string
  description: string
  /** Lowercase kebab-case labels for filtering on /projects. */
  tags?: string[]
  /** Shown on the home page strip. */
  featured?: boolean
}

/** One file per category in app/data/projects/<id>.ts, default-exported. */
export interface ProjectCategory {
  id: string
  title: string
  description: string
  icon: string
  order: number
  projects: Project[]
}

export const defineLinkCategory = (c: LinkCategory) => c
export const defineProjectCategory = (c: ProjectCategory) => c
