type AnalyticsEngineDataset = {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void
}

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> }
  DOWNLOADS?: AnalyticsEngineDataset
}

type CfProperties = { country?: string; city?: string }

const clean = (value: string) => value.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9._-]/g, '').slice(0, 40)

function source(request: Request, url: URL) {
  const param = url.searchParams.get('src')
  if (param) return clean(param) || 'direct'
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const host = new URL(referer).hostname
      if (host !== url.hostname) return clean(host)
    } catch {}
  }
  return 'direct'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    const url = new URL(request.url)
    if (request.method === 'GET' && response.status === 200 && url.pathname.startsWith('/downloads/')) {
      const cf = (request as Request & { cf?: CfProperties }).cf ?? {}
      const agent = request.headers.get('user-agent') ?? ''
      env.DOWNLOADS?.writeDataPoint({
        indexes: [url.pathname.slice('/downloads/'.length)],
        blobs: [
          url.pathname.slice('/downloads/'.length),
          cf.country ?? 'unknown',
          cf.city ?? 'unknown',
          source(request, url),
          /Mobi|Android|iPhone|iPad/i.test(agent) ? 'mobile' : 'desktop',
        ],
        doubles: [1],
      })
    }
    return response
  },
}
