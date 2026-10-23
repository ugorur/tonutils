// Multi-file source projects shared by tolk-func-playground and func-to-tolk-converter. Pure TS, no Vue.

export type Lang = 'tolk' | 'func'

export interface SourceFile {
  path: string
  content: string
}

export interface Project {
  lang: Lang
  /** The first file is the entrypoint. */
  files: SourceFile[]
  /** Playground only: initial data BOC for the deploy address and get methods. */
  data?: string
}

/** POSIX-style normalization: drops `.`, resolves `..`, strips a leading `./`. */
export function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/** `#include "x"` targets of a FunC file, resolved relative to that file (as FunC does). */
export function funcIncludes(file: SourceFile): string[] {
  const dir = dirname(normalizePath(file.path))
  return [...file.content.matchAll(/^\s*#include\s+"([^"]+)"/gm)].map(m => normalizePath(dir ? `${dir}/${m[1]}` : m[1]!))
}

const isStdlib = (path: string) => /(^|\/)stdlib\.(fc|func)$/.test(path)

/**
 * FunC sources map for func-js. Every `#include "…stdlib.fc"` that is not one of the user's files gets the
 * official stdlib.fc, so a contract copied from a repo compiles without pasting the 36 KB stdlib.
 */
export function funcSources(files: SourceFile[], stdlib: string): { sources: Record<string, string>, addedStdlib: string[] } {
  const sources: Record<string, string> = {}
  for (const f of files) sources[normalizePath(f.path)] = f.content
  const addedStdlib: string[] = []
  for (const f of files) {
    for (const inc of funcIncludes(f)) {
      if (!(inc in sources) && isStdlib(inc)) {
        sources[inc] = stdlib
        addedStdlib.push(inc)
      }
    }
  }
  return { sources, addedStdlib }
}

/** Tolk files map: paths normalized so `../imports/x.tolk` style imports resolve. */
export function tolkSources(files: SourceFile[]): Record<string, string> {
  return Object.fromEntries(files.map(f => [normalizePath(f.path), f.content]))
}

/** A file name that is not taken yet: main.tolk, main-2.tolk, … */
export function freeName(files: SourceFile[], base: string): string {
  const taken = new Set(files.map(f => normalizePath(f.path)))
  if (!taken.has(base)) return base
  const dot = base.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, '']
  for (let i = 2; ; i++) if (!taken.has(`${stem}-${i}${ext}`)) return `${stem}-${i}${ext}`
}

// ---------------------------------------------------------------- share links

const toB64Url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** URL fragment (`#p=…`) holding the whole project, deflate-compressed. Nothing reaches a server. */
export async function encodeProject(p: Project): Promise<string> {
  const json = JSON.stringify({ l: p.lang, f: p.files.map(f => [f.path, f.content]), ...(p.data ? { d: p.data } : {}) })
  return `p=${toB64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))}`
}

/** Inverse of encodeProject; null for anything malformed. */
export async function decodeProject(hash: string): Promise<Project | null> {
  const m = /(?:^#?|&)p=([\w-]+)/.exec(hash)
  if (!m) return null
  try {
    const json = new TextDecoder().decode(await pipe(fromB64Url(m[1]!), new DecompressionStream('deflate-raw')))
    const raw = JSON.parse(json) as { l: unknown, f: unknown, d?: unknown }
    if ((raw.l !== 'tolk' && raw.l !== 'func') || !Array.isArray(raw.f) || !raw.f.length) return null
    const files = raw.f.map((x: unknown) => {
      if (!Array.isArray(x) || typeof x[0] !== 'string' || typeof x[1] !== 'string') throw new Error('bad file')
      return { path: x[0], content: x[1] }
    })
    return typeof raw.d === 'string' && raw.d ? { lang: raw.l, files, data: raw.d } : { lang: raw.l, files }
  }
  catch {
    return null
  }
}
