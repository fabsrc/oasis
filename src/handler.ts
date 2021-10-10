import { uuid } from '@cfworker/uuid'
import { parse } from 'cookie'

declare const GITHUB_CLIENT_ID: string
declare const GITHUB_CLIENT_SECRET: string
declare const KV_USERS: KVNamespace
declare const KV_SESSIONS: KVNamespace

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // handle CORS pre-flight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  // redirect GET requests to the OAuth login page on github.com
  if (url.pathname === '/login' && request.method === 'GET') {
    return Response.redirect(
      `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=http://localhost:8787/callback`,
      302,
    )
  }

  if (url.pathname === '/callback' && request.method === 'GET') {
    try {
      const code = url.searchParams.get('code')

      if (!code) {
        throw new Error('code param missing')
      }

      const tokenResponse = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': 'OASIS on Cloudflare Workers',
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
          }),
        },
      )
      const tokenResult = await tokenResponse.json()
      const headers = {
        'Access-Control-Allow-Origin': '*',
      }

      if (tokenResult.error) {
        return new Response(JSON.stringify(tokenResult), {
          status: 401,
          headers,
        })
      }

      const userResponse = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
          authorization: `token ${tokenResult.access_token}`,
          'user-agent': 'OASIS on Cloudflare Workers',
        },
      })

      if (!userResponse.ok) {
        throw new Error(await userResponse.text())
      }

      const userResult = await userResponse.json()

      const { id, login } = userResult
      const sessionId = uuid()

      await KV_USERS.put(id, JSON.stringify({ id, login }))
      await KV_SESSIONS.put(sessionId, JSON.stringify({ userId: id }), {
        expirationTtl: 3600,
      })

      return new Response(JSON.stringify({ login }), {
        status: 302,
        headers: {
          ...headers,
          'set-cookie': `oasis-session=${sessionId}`,
          location: '/',
        },
      })
    } catch (error) {
      console.error(error)
      if (error instanceof Error) {
        return new Response(error.message, {
          status: 500,
        })
      }

      throw error
    }
  }

  const cookie = parse(request.headers.get('Cookie') || '')

  if (cookie['oasis-session']) {
    const session = await KV_SESSIONS.get<{ userId: string }>(
      cookie['oasis-session'],
      {
        type: 'json',
      },
    )

    if (session) {
      const user = await KV_USERS.get<{ login: string }>(session.userId, {
        type: 'json',
        cacheTtl: 3600,
      })

      if (user) {
        return new Response(JSON.stringify({ hello: user.login }), {
          status: 200,
        })
      }
    } else {
      return new Response(null, {
        status: 302,
        headers: { location: '/login' },
      })
    }
  }

  return new Response(JSON.stringify({ hello: 'world' }), {
    status: 200,
  })
}
