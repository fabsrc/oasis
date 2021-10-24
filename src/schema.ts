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
}

const getSchemaKey = (
  userName: string,
  namespaceId?: string,
  schemaId?: string,
) => [userName, namespaceId, schemaId].filter(Boolean).join(':')

export const createSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
  schemaData: unknown,
): Promise<OpenAPI.Document> => {
  if (!isValidSchema(schemaData)) {
    throw new Error('Data is not a valid Swagger or OpenAPI schema')
  }

  await KV_SCHEMAS.put<Metadata>(
    getSchemaKey(user.login, namespaceId, schemaId),
    JSON.stringify(schemaData),
    {
      metadata: {
        owner: user.id,
        id: schemaId,
        namespaceId: namespaceId,
        name: schemaData.info.title,
        version: schemaData.info.version,
        storedAt: Date.now(),
      },
    },
  )

  return schemaData
}

export const getSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
): Promise<OpenAPI.Document | null> => {
  const schema = await KV_SCHEMAS.get<OpenAPI.Document>(
    getSchemaKey(user.login, namespaceId, schemaId),
    { type: 'json' },
  )

  return schema ?? null
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
