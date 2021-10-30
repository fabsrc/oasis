import { KV } from 'worktop/kv'
import { User } from './user'
import type { OpenAPI } from 'openapi-types'
import { isValidSchema } from './validation'

declare const KV_SCHEMAS: KV.Namespace

interface Metadata {
  owner: string
  id: string
  namespaceId: string
  name: string
  version: string
  storedAt: number
  path: string
}

const getSchemaKey = (
  userName: string,
  namespaceId?: string,
  schemaId?: string,
) => [userName, namespaceId, schemaId].filter(Boolean).join(':')

const getSchemaPath = (key: string) => key.replaceAll(':', '/')

export const createSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
  schemaData: unknown,
): Promise<{ schema: OpenAPI.Document; metadata: Metadata }> => {
  if (!isValidSchema(schemaData)) {
    throw new Error('Data is not a valid Swagger or OpenAPI schema')
  }

  const key = getSchemaKey(user.login, namespaceId, schemaId)

  const metadata = {
    id: schemaId,
    owner: user.id,
    namespaceId: namespaceId,
    name: schemaData.info.title,
    version: schemaData.info.version,
    storedAt: Date.now(),
    path: getSchemaPath(key),
  }

  await KV_SCHEMAS.put<Metadata>(key, JSON.stringify(schemaData), { metadata })

  return { schema: schemaData, metadata }
}

export const getSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
): Promise<{ schema: OpenAPI.Document | null; metadata: Metadata | null }> => {
  const key = getSchemaKey(user.login, namespaceId, schemaId)
  const data = await KV_SCHEMAS.getWithMetadata<OpenAPI.Document, Metadata>(
    key,
    { type: 'json' },
  )

  return { schema: data?.value ?? null, metadata: data?.metadata ?? null }
}

export const getSchemaList = async (
  user: User,
  namespaceId?: string,
): Promise<KV.KeyInfo<Metadata>[]> => {
  const schemaList = await KV_SCHEMAS.list<Metadata>({
    prefix: getSchemaKey(user.login, namespaceId) + ':',
  })
  return schemaList.keys
}

export const deleteSchemaRaw = (key: string): Promise<void> =>
  KV_SCHEMAS.delete(key)

export const deleteSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
): Promise<boolean> => {
  const schema = await getSchema(user, namespaceId, schemaId)

  if (schema) {
    await deleteSchemaRaw(getSchemaKey(user.login, namespaceId, schemaId))
    return true
  }

  return false
}
