import { parse } from 'worktop/cookie'
import { KV } from 'worktop/kv'
import { ServerRequest } from 'worktop/request'
import { uuid } from 'worktop/utils'

declare const KV_SESSIONS: KV.Namespace

interface SessionData {
  userId: string
}

export const SESSION_COOKIE_NAME = 'oasis-session'

export const createSession = async (data: SessionData): Promise<string> => {
  const sessionId = uuid()

  await KV_SESSIONS.put(sessionId, JSON.stringify(data), {
    expirationTtl: 3600,
  })

  return sessionId
}

export const getSession = async (
  request: ServerRequest,
): Promise<[string | null, SessionData | null]> => {
  const cookie = parse(request.headers.get('Cookie') || '')
  const sessionId = cookie[SESSION_COOKIE_NAME]

  if (sessionId) {
    const session = await KV_SESSIONS.get<SessionData>(sessionId, {
      type: 'json',
    })
    if (session) {
      return [sessionId, session]
    }

    return [sessionId, null]
  }

  return [null, null]
}

export const deleteSession = async (request: ServerRequest): Promise<void> => {
  const [sessionId] = await getSession(request)

  if (sessionId) {
    await KV_SESSIONS.delete(sessionId)
  }
}
