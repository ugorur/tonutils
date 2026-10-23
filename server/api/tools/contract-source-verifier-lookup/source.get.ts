// verifier.ton.org's API sends no CORS headers, so the browser cannot call it directly.
// Fixed upstream URL, one validated parameter (a 32-byte code hash); nothing else is forwarded.
export default defineEventHandler(async (event) => {
  const hash = getQuery(event).code_hash
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw createError({ statusCode: 400, statusMessage: 'code_hash must be 64 lowercase hex characters' })
  }

  let res: Response
  try {
    res = await fetch(`https://verifier.ton.org/api/v1/verification/source?code_hash=${hash}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    })
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'verifier.ton.org did not answer' })
  }

  const body = await res.json().catch(() => null) as Record<string, unknown> | null
  if (res.ok && body) {
    setResponseHeader(event, 'cache-control', 'public, max-age=600')
    return body
  }
  // 404 = not verified, or a code hash the verifier refuses to serve (standard wallets)
  if (res.status === 404) {
    setResponseHeader(event, 'cache-control', 'public, max-age=120')
    return { code_hash: hash, verified: false, error: typeof body?.error === 'string' ? body.error : 'not found' }
  }
  // res.ok with no body = the 15 s timeout hit while the answer was still downloading
  throw createError(res.ok
    ? { statusCode: 504, statusMessage: 'verifier.ton.org is slow to answer, try again' }
    : { statusCode: 502, statusMessage: `verifier.ton.org error ${res.status}` })
})
