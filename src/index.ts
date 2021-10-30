import { Router } from 'worktop'
import { stringify as yamlStringify } from 'yaml'
import {
  createSchema,
  deleteSchema,
  deleteSchemaRaw,
  getSchema,
  getSchemaList,
  modifySchemaAccess,
  SCHEMA_METADATA_HEADER_NAME,
} from './schema'
import {
  createSession,
  deleteSession,
  getSession,
  SESSION_COOKIE_NAME,
} from './session'
import {
  addNamespace,
  createUser,
  deleteUser,
  getNamespace,
  getUser,
  removeNamespace,
} from './user'
import { getAssetFromKV } from '@cloudflare/kv-asset-handler'
import {
  isValidAccessValue,
  isValidGithubUsername,
  isValidId,
  isValidSchema,
} from './validation'

declare const GITHUB_CLIENT_ID: string
declare const GITHUB_CLIENT_SECRET: string

const API = new Router()

API.add('GET', '/login', (_request, response) => {
  response.send(302, null, {
    location: `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=https://oasis.fscodes.workers.dev/callback`,
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
    const tokenResult = await tokenResponse.json<{
      access_token: string
      error: unknown
    }>()

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

    const userResult = await userResponse.json<{
      id: string
      login: string
      avatar_url: string
    }>()

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

API.add('GET', '/session', async (request, response) => {
  const [sessionId, session] = await getSession(request)

  if (sessionId) {
    if (session) {
      const user = await getUser(session.userId)

      if (user) {
        return response.send(200, {
          login: user.login,
          avatarUrl: user.avatarUrl,
        })
      }
    } else {
      return response.send(401, {
        code: 'SESSION_EXPIRED',
        message: 'Session expired',
      })
    }
  }

  return response.send(401, {
    code: 'SESSION_NOT_FOUND',
    message: 'No valid session',
  })
})

API.add('GET', '/:user', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user } = request.params

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  const list = await getSchemaList(sessionUser)

  return response.send(200, {
    schemas: list.map((l) => ({
      id: l.metadata?.id,
      namespaceId: l.metadata?.namespaceId,
      name: l.metadata?.name,
      version: l.metadata?.version,
      access: l.metadata?.access,
      path: l.name.replaceAll(':', '/'),
    })),
    namespaces: sessionUser.namespaces?.map((ns) => ({
      id: ns.id,
      name: ns.name,
    })),
  })
})

API.add('DELETE', '/:user', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user } = request.params

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  const list = await getSchemaList(sessionUser)
  await Promise.all(list.map((l) => deleteSchemaRaw(l.name)))
  await deleteUser(sessionUser.id)

  return response.send(204, null, {
    'set-cookie': `${SESSION_COOKIE_NAME}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  })
})

API.add('PUT', '/:user/:namespace', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user, namespace } = request.params
  const body = await request.body<{ name: string }>()

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  if (!isValidId(namespace)) {
    return response.send(400, { message: 'Invalid namespace' })
  }

  const result = await addNamespace(sessionUser.id, namespace, body?.name)

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

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  if (!isValidId(namespace)) {
    return response.send(400, { message: 'Invalid namespace' })
  }

  const result = await removeNamespace(sessionUser.id, namespace)

  if (result) {
    return response.send(204)
  }

  return response.send(400, { message: 'Invalid namespace' })
})

API.add('PUT', '/:user/:namespace/:schema', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user, namespace, schema } = request.params

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  if (!isValidId(namespace)) {
    return response.send(400, { message: 'Invalid namespace' })
  }

  if (!isValidId(schema)) {
    return response.send(400, { message: 'Invalid schema id' })
  }

  const userNamespace = await getNamespace(sessionUser.id, namespace)

  if (!userNamespace) {
    return response.send(400, { message: 'Invalid namespace' })
  }

  try {
    const schemaData = await request.body.json()
    if (!schemaData || !isValidSchema(schemaData)) {
      return response.send(400, { message: 'Invalid schema' })
    }

    const { schema: newSchema, metadata } = await createSchema(
      sessionUser,
      namespace,
      schema,
      schemaData,
    )

    return response.send(201, newSchema, {
      'content-type': 'application/json',
      ...(metadata && {
        [SCHEMA_METADATA_HEADER_NAME]: JSON.stringify(metadata),
      }),
    })
  } catch (error) {
    console.error((error as Error).message)
    return response.send(500, { message: (error as Error).message })
  }
})

API.add('GET', '/:user/:namespace/:schema', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user, namespace, schema } = request.params

  const [schemaId, extension = 'html'] = schema.split('.')

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  if (!isValidId(namespace)) {
    return response.send(400, { message: 'Invalid namespace' })
  }

  const { schema: schemaData, metadata } = await getSchema(
    user,
    namespace,
    schemaId,
  )

  if (metadata?.access !== 'PUBLIC' && sessionUser?.login !== user) {
    return response.send(401, { message: 'Access denied' })
  }

  if (!schemaData) {
    return response.send(404, { message: 'Not found' })
  }

  if (extension === 'json') {
    return response.send(200, schemaData, {
      'content-type': 'application/json',
      ...(metadata && {
        [SCHEMA_METADATA_HEADER_NAME]: JSON.stringify(metadata),
      }),
    })
  }

  if (extension === 'yaml' || extension === 'yml') {
    return response.send(200, yamlStringify(schemaData), {
      'content-type': 'text/yaml',
      ...(metadata && {
        [SCHEMA_METADATA_HEADER_NAME]: JSON.stringify(metadata),
      }),
    })
  }

  if (extension === 'html' || extension === 'htm') {
    return response.send(
      200,
      `
    <html>
    <head>
    <title>Schema</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.52.3/swagger-ui.min.css" integrity="sha512-dFuohqVso7kItN2ft/glXFWpU3ZKdGsmV6HL3l7Vxu39syv/mfnp+HKoGwMUtmrlOapINWzSlIHiiC3q0CZ/GA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.52.3/swagger-ui-bundle.min.js" integrity="sha512-ijA62nAx0v8vVbWF4Zx+robHQOdvN+PbArQBvCAciDS3k4sHtefbL8flGVurIkKLu/HucFqskP+dXDe6+I1GTg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
      <script>
        const ui = SwaggerUIBundle({
          url: \`\${window.location.protocol}//\${window.location.host}/${user}/${namespace}/${schemaId}.json\`,
          dom_id: '#swagger-ui',
          deepLinking: true,
        })
      </script>
    </body>
    </html>
    `,
      {
        'content-type': 'text/html',
        ...(metadata && {
          [SCHEMA_METADATA_HEADER_NAME]: JSON.stringify(metadata),
        }),
      },
    )
  }

  return response.send(400, { message: 'Invalid request' })
})

API.add('DELETE', '/:user/:namespace/:schema', async (request, response) => {
  const [, session] = await getSession(request)
  const sessionUser = await getUser(session?.userId)
  const { user, namespace, schema } = request.params

  if (!sessionUser || sessionUser.login !== user) {
    return response.send(400, { message: 'Invalid request' })
  }

  if (!isValidGithubUsername(user)) {
    return response.send(400, { message: 'Invalid username' })
  }

  if (!isValidId(namespace)) {
    return response.send(400, { message: 'Invalid namespace' })
  }

  const result = await deleteSchema(sessionUser, namespace, schema)

  if (result) {
    return response.send(204)
  }

  return response.send(400, { message: 'Invalid schema' })
})

API.add(
  'PUT',
  '/:user/:namespace/:schema/access',
  async (request, response) => {
    const [, session] = await getSession(request)
    const sessionUser = await getUser(session?.userId)
    const { user, namespace, schema } = request.params
    const { access } = await request.body.json<{ access: string }>()

    if (!sessionUser || sessionUser.login !== user) {
      return response.send(400, { message: 'Invalid request' })
    }

    if (!isValidGithubUsername(user)) {
      return response.send(400, { message: 'Invalid username' })
    }

    if (!isValidId(namespace)) {
      return response.send(400, { message: 'Invalid namespace' })
    }

    if (!isValidAccessValue(access)) {
      return response.send(400, { message: 'Invalid access value' })
    }

    const { metadata } = await modifySchemaAccess(
      sessionUser,
      namespace,
      schema,
      access,
    )

    if (metadata) {
      return response.send(204, null, {
        [SCHEMA_METADATA_HEADER_NAME]: JSON.stringify(metadata),
      })
    }

    return response.send(404, { message: 'Schema not found' })
  },
)

const serverResponse = async (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (url.pathname === '/') {
    return await getAssetFromKV(event)
  }
  return API.run(event)
}

addEventListener('fetch', (event) => {
  event.respondWith(serverResponse(event))
})
