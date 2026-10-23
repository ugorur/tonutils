// TonConnect manifest for whichever host serves the site (tonutils.io or the workers.dev preview).
export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  return {
    url: origin,
    name: 'TonUtils',
    iconUrl: `${origin}/tonconnect-icon.png`,
    termsOfUseUrl: `${origin}/about`,
    privacyPolicyUrl: `${origin}/about`
  }
})
