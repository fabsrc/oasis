import { KV } from 'worktop/kv'

declare const KV_USERS: KV.Namespace

interface GitHubUser {
  id: string
  login: string
  avatar_url: string
}

export interface User {
  id: string
  login: string
  avatarUrl: string
  namespaces?: Namespace[]
}

interface Namespace {
  id: string
  name: string
}

export const createUser = async (gitHubUser: GitHubUser): Promise<User> => {
  const { id, login, avatar_url } = gitHubUser
  const existingUser = await getUser(id)

  if (!existingUser) {
    await KV_USERS.put(id, JSON.stringify({ id, login, avatarUrl: avatar_url }))
    return { id, login, avatarUrl: avatar_url }
  }

  return existingUser
}

export const getUser = async (userId?: string): Promise<User | null> => {
  if (!userId) {
    return null
  }

  const user = await KV_USERS.get<User>(userId, {
    type: 'json',
    cacheTtl: 3600,
  })
  return user ?? null
}

export const addNamespace = async (
  userId: string,
  id: string,
  name?: string,
): Promise<Namespace | null> => {
  const user = await getUser(userId)

  if (user) {
    const namespace = { id, name: name ?? id }

    user.namespaces = [
      ...(user.namespaces?.filter((ns) => ns.id !== id) ?? []),
      namespace,
    ]
    await KV_USERS.put(userId, JSON.stringify(user))
    return namespace
  }

  return null
}

export const getNamespace = async (
  userId: string,
  namespaceId: string,
): Promise<Namespace | null> => {
  const user = await getUser(userId)

  if (user && user.namespaces && user.namespaces.length !== 0) {
    return user.namespaces.find((ns) => ns.id === namespaceId) ?? null
  }

  return null
}

export const removeNamespace = async (
  userId: string,
  namespaceId: string,
): Promise<boolean> => {
  const user = await getUser(userId)
  const hasNamespace =
    user?.namespaces?.some((ns) => ns.id === namespaceId) ?? false

  if (user && user.namespaces && hasNamespace) {
    user.namespaces = user.namespaces.filter((ns) => ns.id !== namespaceId)
    await KV_USERS.put(userId, JSON.stringify(user))
    return true
  }

  return false
}
