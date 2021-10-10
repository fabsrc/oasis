import { KV } from 'worktop/kv'

declare const KV_USERS: KV.Namespace

interface GitHubUser {
  id: string
  login: string
}

interface User {
  id: string
  login: string
  namespaces?: Namespace[]
}

interface Namespace {
  id: string
}

export const createUser = async (gitHubUser: GitHubUser): Promise<User> => {
  const { id, login } = gitHubUser
  await KV_USERS.put(id, JSON.stringify({ id, login }))

  return { id, login }
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
  namespaceId: string,
): Promise<Namespace | null> => {
  const user = await getUser(userId)

  if (user) {
    const namespace = { id: namespaceId }

    if (
      !user.namespaces ||
      user.namespaces.length === 0 ||
      user.namespaces?.some((ns) => ns.id !== namespace.id)
    ) {
      user.namespaces = [...(user?.namespaces ?? []), namespace]
      await KV_USERS.put(userId, JSON.stringify(user))
      return namespace
    }
  }

  return null
}

export const removeNamespace = async (
  userId: string,
  namespaceId: string,
): Promise<boolean> => {
  const user = await getUser(userId)
  const hasNamespace = user?.namespaces?.some((ns) => ns.id === namespaceId) ?? false

  if (user && user.namespaces && hasNamespace) {
    user.namespaces = user.namespaces.filter((ns) => ns.id !== namespaceId)
    await KV_USERS.put(userId, JSON.stringify(user))
    return true
  }

  return false
}
