import { describe, expect, it } from 'vitest'
import { buildUrl, rateLimitedJson, TonApiError } from './api-client'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('rateLimitedJson', () => {
  it('retries on 429 then succeeds', async () => {
    const responses = [json(429, { ok: false, result: 'Ratelimit exceed' }), json(200, { ok: true })]
    let calls = 0
    const res = await rateLimitedJson('https://a.test/x', {
      provider: 'toncenter',
      minIntervalMs: 0,
      sleep: async () => {},
      fetchFn: async () => (calls++, responses.shift()!)
    })
    expect(res).toEqual({ ok: true })
    expect(calls).toBe(2)
  })

  it('throws a typed error after retries run out', async () => {
    const err: TonApiError = await rateLimitedJson<never>('https://b.test/x', {
      provider: 'tonapi',
      minIntervalMs: 0,
      retries: 1,
      sleep: async () => {},
      fetchFn: async () => json(429, { error: 'rate limit' })
    }).catch((e: TonApiError) => e)
    expect(err).toBeInstanceOf(TonApiError)
    expect(err.isRateLimit).toBe(true)
    expect(err.provider).toBe('tonapi')
  })

  it('does not retry 4xx', async () => {
    let calls = 0
    const err: TonApiError = await rateLimitedJson<never>('https://c.test/x', {
      provider: 'tonapi',
      minIntervalMs: 0,
      sleep: async () => {},
      fetchFn: async () => (calls++, json(404, { error: 'account not found' }))
    }).catch((e: TonApiError) => e)
    expect(calls).toBe(1)
    expect(err.status).toBe(404)
    expect(err.message).toContain('account not found')
  })

  it('spaces requests to the same host', async () => {
    const times: number[] = []
    const opts = { provider: 'toncenter' as const, minIntervalMs: 50, fetchFn: async () => (times.push(Date.now()), json(200, {})) }
    await Promise.all([rateLimitedJson('https://d.test/1', opts), rateLimitedJson('https://d.test/2', opts)])
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(45)
  })
})

describe('buildUrl', () => {
  it('joins and skips undefined params', () => {
    expect(buildUrl('https://toncenter.com/api/v2/', '/getAddressBalance', { address: 'EQ+/', limit: undefined }))
      .toBe('https://toncenter.com/api/v2/getAddressBalance?address=EQ%2B%2F')
  })
})
