import { describe, expect, it } from 'vitest'
import { buildRequest, curlSnippet, EXAMPLE_ADDRESS, exampleValues, fetchSnippet, parseSpec, PROVIDERS, tonClientSnippet } from './logic'
// Trimmed copies of the live specs (downloaded 2026-10-23 from the PROVIDERS spec URLs): a few paths plus every
// component they reference, responses removed.
import tonapi from './fixtures/tonapi.trimmed.json'
import v2 from './fixtures/toncenter-v2.trimmed.json'
import v3 from './fixtures/toncenter-v3.trimmed.json'

const find = (eps: ReturnType<typeof parseSpec>, id: string) => {
  const e = eps.find(x => x.id === id)
  if (!e) throw new Error(`missing ${id}: ${eps.map(x => x.id).join(', ')}`)
  return e
}

describe('parseSpec: toncenter v2 (OpenAPI 3)', () => {
  const eps = parseSpec(v2)

  it('keeps GET methods and drops their POST "rpc" twins, keeps POST-only runGetMethod', () => {
    expect(eps.map(e => e.id).sort()).toEqual([
      'GET /api/v2/getAddressInformation',
      'GET /api/v2/getMasterchainInfo',
      'GET /api/v2/getTransactions',
      'POST /api/v2/runGetMethod'
    ])
  })

  it('resolves $ref parameters with sibling overrides', () => {
    const e = find(eps, 'GET /api/v2/getTransactions')
    expect(e.params.map(p => p.name)).toEqual(['address', 'limit', 'lt', 'hash', 'to_lt', 'archival'])
    const addr = e.params[0]!
    expect(addr).toMatchObject({ in: 'query', required: true, type: 'string', address: true })
    expect(e.params.find(p => p.name === 'limit')).toMatchObject({ type: 'integer', default: '10', required: false })
    expect(e.params.find(p => p.name === 'hash')?.description).toBe('SHA-256 transaction hash to start pagination from')
  })

  it('builds a JSON body example for runGetMethod (address/method/stack required)', () => {
    const e = find(eps, 'POST /api/v2/runGetMethod')
    expect(e.body?.required).toBe(true)
    expect(JSON.parse(e.body!.example)).toEqual({ address: EXAMPLE_ADDRESS, method: '', stack: [] })
  })
})

describe('parseSpec: toncenter v3 (Swagger 2)', () => {
  const eps = parseSpec(v3)
  it('reads inline query params, arrays and the body parameter', () => {
    const states = find(eps, 'GET /api/v3/accountStates')
    expect(states.params[0]).toMatchObject({ name: 'address', type: 'array', required: true, address: true })
    expect(states.params[1]).toMatchObject({ name: 'include_boc', type: 'boolean', default: 'true' })
    const run = find(eps, 'POST /api/v3/runGetMethod')
    expect(run.params).toEqual([])
    expect(JSON.parse(run.body!.example)).toEqual({ address: EXAMPLE_ADDRESS, method: '', stack: [] })
  })
})

describe('parseSpec: tonapi (OpenAPI 3)', () => {
  const eps = parseSpec(tonapi)
  it('path params with examples, bulk POST body from requestBodies', () => {
    const acc = find(eps, 'GET /v2/accounts/{account_id}')
    expect(acc.params).toHaveLength(1)
    expect(acc.params[0]).toMatchObject({ name: 'account_id', in: 'path', required: true, address: true, example: '0:97264395BD65A255A429B11326C84128B7D70FFED7949ABAE3036D506BA38621' })
    const bulk = find(eps, 'POST /v2/accounts/_bulk')
    expect(JSON.parse(bulk.body!.example)).toEqual({ account_ids: ['0:97264395BD65A255A429B11326C84128B7D70FFED7949ABAE3036D506BA38621'] })
    const ev = find(eps, 'GET /v2/accounts/{account_id}/events')
    expect(ev.params.find(p => p.name === 'sort_order')).toMatchObject({ enum: ['desc', 'asc'], default: 'desc' })
    expect(ev.params.find(p => p.name === 'limit')).toMatchObject({ required: true, example: '20' })
    // header params (Accept-Language) are skipped
    expect(ev.params.some(p => p.name === 'Accept-Language')).toBe(false)
  })
  it('rejects non-specs', () => {
    expect(() => parseSpec({})).toThrow()
  })
})

describe('buildRequest + snippets', () => {
  // These exact URLs returned HTTP 200 with curl on 2026-10-23.
  it('toncenter v2 getAddressInformation', () => {
    const e = find(parseSpec(v2), 'GET /api/v2/getAddressInformation')
    const r = buildRequest(e, exampleValues(e), undefined, PROVIDERS['toncenter-v2'].origin.mainnet)
    expect(r).toEqual({ method: 'GET', url: `https://toncenter.com/api/v2/getAddressInformation?address=${EXAMPLE_ADDRESS}` })
    expect(curlSnippet(r)).toBe(`curl 'https://toncenter.com/api/v2/getAddressInformation?address=${EXAMPLE_ADDRESS}'`)
    expect(tonClientSnippet(e, exampleValues(e), 'https://toncenter.com')).toContain(`await client.getContractState(Address.parse("${EXAMPLE_ADDRESS}"))`)
  })

  it('tonapi account on testnet substitutes the path param', () => {
    const e = find(parseSpec(tonapi), 'GET /v2/accounts/{account_id}')
    const r = buildRequest(e, { account_id: '0:97264395BD65A255A429B11326C84128B7D70FFED7949ABAE3036D506BA38621' }, undefined, PROVIDERS.tonapi.origin.testnet)
    expect(r.url).toBe('https://testnet.tonapi.io/v2/accounts/0%3A97264395BD65A255A429B11326C84128B7D70FFED7949ABAE3036D506BA38621')
    expect(tonClientSnippet(e, {}, 'https://tonapi.io')).toBeNull()
  })

  it('repeats array params (accountStates?address=a&address=b) and skips empty optionals', () => {
    const e = find(parseSpec(v3), 'GET /api/v3/accountStates')
    const r = buildRequest(e, { address: `${EXAMPLE_ADDRESS}, EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`, include_boc: '' }, undefined, 'https://toncenter.com')
    expect(r.url).toBe(`https://toncenter.com/api/v3/accountStates?address=${EXAMPLE_ADDRESS}&address=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`)
  })

  it('POST body: validated, compacted in curl, pretty in fetch', () => {
    const e = find(parseSpec(v3), 'POST /api/v3/runGetMethod')
    const body = JSON.stringify({ address: EXAMPLE_ADDRESS, method: 'seqno', stack: [] })
    const r = buildRequest(e, {}, body, 'https://toncenter.com')
    expect(r).toEqual({ method: 'POST', url: 'https://toncenter.com/api/v3/runGetMethod', body })
    expect(curlSnippet(r)).toBe(`curl -X POST 'https://toncenter.com/api/v3/runGetMethod' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`)
    expect(fetchSnippet(r)).toContain(`method: 'POST'`)
    expect(fetchSnippet(r)).toContain(`"method": "seqno"`)
    expect(() => buildRequest(e, {}, '{oops', 'https://toncenter.com')).toThrow(/not valid JSON/)
    expect(() => buildRequest(e, {}, '', 'https://toncenter.com')).toThrow(/needs a JSON body/)
  })

  it('lists missing required params', () => {
    const e = find(parseSpec(tonapi), 'GET /v2/accounts/{account_id}/events')
    expect(() => buildRequest(e, { account_id: 'x' }, undefined, 'https://tonapi.io')).toThrow('Fill in: limit')
  })
})
