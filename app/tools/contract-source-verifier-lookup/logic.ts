// verifier.ton.org response handling. The browser reaches it through our proxy route
// /api/tools/contract-source-verifier-lookup/source?code_hash=<hex> (the upstream sends no CORS headers).

export interface VerifierFile {
  path: string
  content: string
  content_hash?: string
  is_stdlib?: boolean
  include_in_command?: boolean
}

export interface VerifierBundle {
  source_bundle_hash?: string
  verified_at?: number
  entrypoint?: string
  compiler?: { language?: string, version?: string }
  files: VerifierFile[]
}

export type VerifierResponse =
  | { code_hash: string, verified: true, bundle: VerifierBundle }
  | { code_hash: string, verified: false, error?: string }

export interface SourceView {
  verified: boolean
  codeHash: string
  /** Why there is no source (readable). */
  reason?: string
  language?: string
  version?: string
  entrypoint?: string
  verifiedAt?: Date
  bundleHash?: string
  /** Entrypoint first, then own files, then stdlib. */
  files: VerifierFile[]
}

const LANGUAGES: Record<string, string> = { func: 'FunC', tact: 'Tact', tolk: 'Tolk', fift: 'Fift' }

export const proxyUrl = (codeHashHex: string) => `/api/tools/contract-source-verifier-lookup/source?code_hash=${codeHashHex}`

/** Public verifier page; it accepts an address or a code hash in the path. */
export const verifierPageUrl = (target: string) => `https://verifier.ton.org/${encodeURIComponent(target)}`

export function toSourceView(res: VerifierResponse): SourceView {
  if (!res.verified) {
    const blocked = res.error?.startsWith('code_hash_blocked')
    return {
      verified: false,
      codeHash: res.code_hash,
      files: [],
      reason: blocked
        ? 'verifier.ton.org does not serve source for this code hash. It does this for standard wallet contracts, whose source lives in the TON monorepo.'
        : 'No verified source for this code hash. The author has not published and verified it on verifier.ton.org.'
    }
  }
  const b = res.bundle
  const rank = (f: VerifierFile) => (f.path === b.entrypoint ? 0 : f.is_stdlib ? 2 : 1)
  return {
    verified: true,
    codeHash: res.code_hash,
    language: b.compiler?.language ? (LANGUAGES[b.compiler.language] ?? b.compiler.language) : undefined,
    version: b.compiler?.version,
    entrypoint: b.entrypoint,
    verifiedAt: b.verified_at ? new Date(b.verified_at * 1000) : undefined,
    bundleHash: b.source_bundle_hash,
    files: [...b.files].sort((x, y) => rank(x) - rank(y) || x.path.localeCompare(y.path))
  }
}
