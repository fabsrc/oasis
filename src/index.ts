import { Router, listen } from 'worktop'
import type { KV } from 'worktop/kv'
import {
  createSession,
  deleteSession,
  getSession,
  SESSION_COOKIE_NAME,
} from './session'
import { addNamespace, createUser, getUser, removeNamespace } from './user'

declare const GITHUB_CLIENT_ID: string
declare const GITHUB_CLIENT_SECRET: string
declare const KV_USERS: KV.Namespace

const API = new Router()

API.add('GET', '/login', (_request, response) => {
  response.send(302, null, {
    location: `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=http://localhost:8787/callback`,
  })
})

API.add('GET', '/logout', async (request, response) => {
  await deleteSession(request)
  return response.send(302, null, {
    location: '/',
    'set-cookie': `${SESSION_COOKIE_NAME}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  })
})

API.add('GET', '/callback', async (request, response) => {
  try {
    const code = request.query.get('code')

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

    if (tokenResult.error) {
      response.send(401, JSON.stringify(tokenResult))
      return
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

    const { id: userId } = await createUser(userResult)
    const sessionId = await createSession({ userId })

    response.send(302, null, {
      'set-cookie': `${SESSION_COOKIE_NAME}=${sessionId}`,
      location: '/',
    })
    return
  } catch (error) {
    console.error(error)
    response.send(500, (error as Error).message)
  }
})

API.add('GET', '/', async (request, response) => {
  const [sessionId, session] = await getSession(request)

  if (sessionId) {
    if (session) {
      const user = await getUser(session.userId)

      if (user) {
        return response.send(200, { hello: user.login })
      }
    } else {
      return response.send(302, null, { location: '/login' })
    }
  }

  return response.send(200, { hello: 'world' })
})

API.add('PUT', '/:user/:namespace', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user, namespace } = request.params

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  const result = await addNamespace(sessionUser.id, namespace)

  if (result) {
    return response.send(201)
  }

  return response.send(400, { message: 'Invalid namespace' })
})

API.add('DELETE', '/:user/:namespace', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user, namespace } = request.params

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  const result = await removeNamespace(sessionUser.id, namespace)

  if (result) {
    return response.send(204)
  }

  return response.send(400, { message: 'Invalid namespace' })
})

listen(API.run)
