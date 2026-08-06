export function normalizeOrigin(value: string) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return ''
    return url.origin
  } catch {
    return ''
  }
}

export function deriveMainSiteOrigin(guideOrigin: string) {
  const origin = normalizeOrigin(guideOrigin)
  if (!origin) return ''

  const url = new URL(origin)
  const hostname = url.hostname.toLowerCase()
  if (!hostname.startsWith('guide.')) return origin

  const mainHostname = hostname.slice('guide.'.length)
  if (!mainHostname) return origin
  return `${url.protocol}//${mainHostname}${url.port ? `:${url.port}` : ''}`
}
