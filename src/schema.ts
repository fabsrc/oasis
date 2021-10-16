import { KV } from 'worktop/kv'
import { User } from './user'
import type { OpenAPI } from 'openapi-types'

declare const KV_SCHEMAS: KV.Namespace

const getSchemaKey = (
  userName: string,
  namespaceId?: string,
  schemaId?: string,
) => [userName, namespaceId, schemaId].filter(Boolean).join(':')

export const createSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
  schemaData: OpenAPI.Document,
): Promise<OpenAPI.Document> => {
  await KV_SCHEMAS.put(
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
): Promise<KV.KeyInfo[]> => {
  const schemaList = await KV_SCHEMAS.list({
    prefix: getSchemaKey(user.login, namespaceId) + ':',
  })
  return schemaList.keys
}

export const deleteSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
): Promise<boolean> => {
  const schema = await getSchema(user, namespaceId, schemaId)

  if (schema) {
    await KV_SCHEMAS.delete(getSchemaKey(user.login, namespaceId, schemaId))
    return true
  }

  return false
}
