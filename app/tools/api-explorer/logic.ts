// TON API request builder: turns the providers' own OpenAPI/Swagger specs into a form, a request and code snippets.
// Pure TS, no Vue, no @ton/*.

export type ProviderId = 'toncenter-v2' | 'toncenter-v3' | 'tonapi'
export type Net = 'mainnet' | 'testnet'

export interface Provider {
  id: ProviderId
  name: string
  /** Spec URL (CORS-enabled; checked 2026-10-23). */
  spec: string
  /** Origin the spec paths are relative to (spec paths already include /api/v2, /api/v3 or /v2). */
  origin: Record<Net, string>
  client: 'toncenter' | 'tonapi'
  docs: string
  defaultEndpoint: string
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  'toncenter-v2': {
    id: 'toncenter-v2',
    name: 'toncenter API v2',
    spec: 'https://toncenter.com/api/v2/openapi.json',
    origin: { mainnet: 'https://toncenter.com', testnet: 'https://testnet.toncenter.com' },
    client: 'toncenter',
    docs: 'https://toncenter.com/api/v2/',
    defaultEndpoint: 'GET /api/v2/getAddressInformation'
  },
  'toncenter-v3': {
    id: 'toncenter-v3',
    name: 'toncenter API v3 (indexer)',
    spec: 'https://toncenter.com/api/v3/doc.json',
    origin: { mainnet: 'https://toncenter.com', testnet: 'https://testnet.toncenter.com' },
    client: 'toncenter',
    docs: 'https://toncenter.com/api/v3/',
    defaultEndpoint: 'GET /api/v3/walletInformation'
  },
  'tonapi': {
    id: 'tonapi',
    name: 'tonapi.io v2',
    spec: 'https://raw.githubusercontent.com/tonkeeper/opentonapi/master/api/openapi.json',
    origin: { mainnet: 'https://tonapi.io', testnet: 'https://testnet.tonapi.io' },
    client: 'tonapi',
    docs: 'https://docs.tonapi.io/',
    defaultEndpoint: 'GET /v2/accounts/{account_id}'
  }
}

/** A real mainnet wallet (TON Foundation, old) used to prefill address parameters. */
export const EXAMPLE_ADDRESS = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'

export type ParamType = 'string' | 'integer' | 'number' | 'boolean' | 'array'

export interface Param {
  name: string
  in: 'path' | 'query'
  required: boolean
  type: ParamType
  description?: string
  example?: string
  default?: string
  enum?: string[]
  /** Looks like an account address (any form accepted by both APIs). */
  address: boolean
}

export interface Endpoint {
  /** `${method} ${path}` */
  id: string
  method: 'GET' | 'POST'
  path: string
  summary: string
  description?: string
  tag: string
  params: Param[]
  /** JSON body (POST): an example generated from the schema. */
  body?: { example: string, required: boolean }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Resolves a local $ref (`#/components/...` or `#/definitions/...`); sibling keys override the target. */
function deref(spec: Obj, node: unknown, depth = 0): Obj {
  if (!isObj(node)) return {}
  const ref = node.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/') || depth > 20) return node
  let target: unknown = spec
  for (const part of ref.slice(2).split('/')) target = isObj(target) ? target[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined
  const { $ref: _, ...siblings } = node
  return { ...deref(spec, target, depth + 1), ...siblings }
}

const show = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : Array.isArray(v) ? v.map(String).join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v)

const ADDRESS_NAMES = /^(address|account|account_id|owner_address|jetton_address|collection_address|wallet_address|source|destination)$/

function toParam(spec: Obj, raw: unknown): Param | null {
  const p = deref(spec, raw)
  const where = p.in
  if ((where !== 'path' && where !== 'query') || typeof p.name !== 'string') return null
  // OpenAPI 3 keeps type info in `schema`; Swagger 2 inlines it.
  const s = p.schema ? deref(spec, p.schema) : p
  const t = s.type
  const type: ParamType = t === 'integer' || t === 'number' || t === 'boolean' || t === 'array' ? t : 'string'
  const schemaRef = isObj(p.schema) ? String(p.schema.$ref ?? '') : ''
  return {
    name: p.name,
    in: where,
    required: p.required === true || where === 'path',
    type,
    description: typeof p.description === 'string' ? p.description : typeof s.description === 'string' ? s.description : undefined,
    example: show(p.example ?? s.example ?? (isObj(s.items) ? deref(spec, s.items).example : undefined)),
    default: show(s.default ?? p.default),
    enum: Array.isArray(s.enum) ? s.enum.map(String) : undefined,
    address: s.format === 'address' || /TonAddr$/.test(schemaRef) || ADDRESS_NAMES.test(p.name)
  }
}

/** Example JSON value for a schema: example → default → a typed placeholder. Required properties only when listed. */
export function exampleFromSchema(spec: Obj, schema: unknown, depth = 0, key = ''): unknown {
  const s = deref(spec, schema)
  if (s.example !== undefined) return s.example
  if (s.default !== undefined) return s.default
  if (depth > 5) return null
  const alt = (s.oneOf ?? s.anyOf) as unknown[] | undefined
  if (Array.isArray(alt) && alt.length) return exampleFromSchema(spec, alt[0], depth + 1)
  if (Array.isArray(s.allOf)) return Object.assign({}, ...s.allOf.map(x => exampleFromSchema(spec, x, depth + 1)).filter(isObj))
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0]
  switch (s.type) {
    case 'object': {
      const props = isObj(s.properties) ? s.properties : {}
      const req = Array.isArray(s.required) ? s.required as string[] : Object.keys(props)
      return Object.fromEntries(req.filter(k => k in props).map(k => [k, exampleFromSchema(spec, props[k], depth + 1, k)]))
    }
    // Only items with a real example: placeholder items ([""]) are invalid more often than an empty list.
    case 'array': return isObj(s.items) && deref(spec, s.items).example !== undefined ? [deref(spec, s.items).example] : []
    case 'integer':
    case 'number': return 0
    case 'boolean': return false
    case 'string': return s.format === 'address' || ADDRESS_NAMES.test(key) ? EXAMPLE_ADDRESS : ''
    default: return isObj(s.properties) ? exampleFromSchema(spec, { ...s, type: 'object' }, depth) : null
  }
}

/** Parses an OpenAPI 3 or Swagger 2 spec into endpoints (GET/POST only, header params skipped). */
export function parseSpec(spec: unknown): Endpoint[] {
  if (!isObj(spec) || !isObj(spec.paths)) throw new Error('Not an OpenAPI/Swagger document.')
  const out: Endpoint[] = []
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!isObj(item)) continue
    const shared = Array.isArray(item.parameters) ? item.parameters : []
    for (const m of ['get', 'post'] as const) {
      const op = item[m]
      if (!isObj(op)) continue
      const tags = Array.isArray(op.tags) ? op.tags.map(String) : []
      // toncenter v2 repeats most GET methods as a POST "rpc" twin with the same params in a body: keep the GET.
      if (m === 'post' && isObj(item.get) && tags.includes('rpc')) continue
      const rawParams = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]
      const params = rawParams.map(p => toParam(spec, p)).filter((p): p is Param => !!p)
      let body: Endpoint['body']
      const rb = op.requestBody ? deref(spec, op.requestBody) : null
      const rbSchema = rb && isObj(rb.content) && isObj(rb.content['application/json']) ? (rb.content['application/json'] as Obj).schema : undefined
      const swaggerBody = rawParams.map(p => deref(spec, p)).find(p => p.in === 'body')
      const schema = rbSchema ?? swaggerBody?.schema
      if (schema) body = { example: JSON.stringify(exampleFromSchema(spec, schema), null, 2), required: (rb?.required ?? swaggerBody?.required) === true }
      const description = typeof op.description === 'string' ? op.description : undefined
      out.push({
        id: `${m.toUpperCase()} ${path}`,
        method: m === 'get' ? 'GET' : 'POST',
        path,
        summary: typeof op.summary === 'string' ? op.summary : description?.split('\n')[0] ?? (typeof op.operationId === 'string' ? op.operationId : path),
        description,
        tag: tags[0] ?? 'other',
        params,
        body
      })
    }
  }
  return out
}

/** Prefill values: a real address for address params, else the spec example, then the default. */
export function exampleValues(ep: Endpoint): Record<string, string> {
  // Address examples in the specs are often empty accounts; a real active wallet gives a useful first response.
  return Object.fromEntries(ep.params.map(p => [p.name, p.address ? EXAMPLE_ADDRESS : p.example ?? p.default ?? '']))
}

export interface BuiltRequest { method: 'GET' | 'POST', url: string, body?: string }

/** Builds the request. Throws on missing required params or invalid JSON body. Array params repeat the key. */
export function buildRequest(ep: Endpoint, values: Record<string, string>, body: string | undefined, origin: string): BuiltRequest {
  const missing = ep.params.filter(p => p.required && !values[p.name]?.trim()).map(p => p.name)
  if (missing.length) throw new Error(`Fill in: ${missing.join(', ')}`)
  let path = ep.path
  for (const p of ep.params.filter(x => x.in === 'path')) path = path.replace(`{${p.name}}`, encodeURIComponent(values[p.name]!.trim()))
  const url = new URL(origin.replace(/\/$/, '') + path)
  for (const p of ep.params.filter(x => x.in === 'query')) {
    const v = values[p.name]?.trim()
    if (!v) continue
    if (p.type === 'array') for (const part of v.split(/[\s,]+/).filter(Boolean)) url.searchParams.append(p.name, part)
    else url.searchParams.set(p.name, v)
  }
  if (ep.method === 'GET') return { method: 'GET', url: url.toString() }
  const text = body?.trim() ?? ''
  if (text) {
    try {
      JSON.parse(text)
    }
    catch (e) {
      throw new Error(`Body is not valid JSON: ${(e as Error).message}`)
    }
  }
  else if (ep.body?.required) {
    throw new Error('This endpoint needs a JSON body.')
  }
  return { method: 'POST', url: url.toString(), body: text || undefined }
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export function curlSnippet(r: BuiltRequest): string {
  if (r.method === 'GET') return `curl ${sq(r.url)}`
  return `curl -X POST ${sq(r.url)} \\\n  -H 'Content-Type: application/json'${r.body ? ` \\\n  -d ${sq(JSON.stringify(JSON.parse(r.body)))}` : ''}`
}

export function fetchSnippet(r: BuiltRequest): string {
  if (r.method === 'GET') return `const res = await fetch(${JSON.stringify(r.url)})\nconst data = await res.json()`
  return `const res = await fetch(${JSON.stringify(r.url)}, {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },${r.body ? `\n  body: JSON.stringify(${JSON.stringify(JSON.parse(r.body), null, 2).replace(/\n/g, '\n  ')}),` : ''}\n})\nconst data = await res.json()`
}

/** @ton/ton TonClient equivalent for the common v2 methods (TonClient talks to /api/v2/jsonRPC). null when there is none. */
export function tonClientSnippet(ep: Endpoint, values: Record<string, string>, origin: string): string | null {
  const name = ep.path.replace(/^\/api\/v2\//, '')
  const a = `Address.parse(${JSON.stringify(values.address?.trim() || EXAMPLE_ADDRESS)})`
  const calls: Record<string, string> = {
    getAddressInformation: `await client.getContractState(${a})`,
    getAddressBalance: `await client.getBalance(${a})`,
    getTransactions: `await client.getTransactions(${a}, { limit: ${Number(values.limit) || 10} })`,
    getMasterchainInfo: 'await client.getMasterchainInfo()'
  }
  const call = ep.path.startsWith('/api/v2/') ? calls[name] : undefined
  if (!call) return null
  const imports = call.includes('Address.') ? `import { Address } from '@ton/core'\nimport { TonClient } from '@ton/ton'` : `import { TonClient } from '@ton/ton'`
  return `${imports}\n\nconst client = new TonClient({ endpoint: '${origin}/api/v2/jsonRPC' })\nconst result = ${call}`
}

/** Search text for the endpoint picker. */
export const searchText = (e: Endpoint) => `${e.id} ${e.summary} ${e.tag}`.toLowerCase()
