import { KV } from 'worktop/kv'
import { User } from './user'

declare const KV_SCHEMAS: KV.Namespace

// TODO: Use OAS types?
type Schema = Record<string, unknown>

const getSchemaKey = (
  userName: string,
  namespaceId: string,
  schemaId: string,
) => `${userName}:${namespaceId}:${schemaId}`

export const createSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
  schemaData: Schema,
): Promise<Schema> => {
  await KV_SCHEMAS.put(
    getSchemaKey(user.login, namespaceId, schemaId),
    JSON.stringify(schemaData),
    { metadata: { owner: user.id } },
  )

  return schemaData
}

export const getSchema = async (
  user: User,
  namespaceId: string,
  schemaId: string,
): Promise<Schema | null> => {
  const schema = await KV_SCHEMAS.get<Schema>(
    getSchemaKey(user.login, namespaceId, schemaId),
    { type: 'json' },
  )

  return schema ?? null
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
