import { KV } from 'worktop/kv'
import { User } from './user'
import type { OpenAPI } from 'openapi-types'
import { isValidSchema } from './validation'

declare const KV_SCHEMAS: KV.Namespace

interface Metadata {
  owner: string
  key: string
  id: string
  namespaceId: string
  name: string
  version: string
  storedAt: number
  path: string
  access?: 'PUBLIC' | 'PRIVATE'
}

export const SCHEMA_METADATA_HEADER_NAME = 'oasis-schema'

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
    key,
    id: schemaId,
    owner: user.id,
    namespaceId: namespaceId,
    name: schemaData.info.title,
    version: schemaData.info.version,
    storedAt: Date.now(),
    path: getSchemaPath(key),
    access: 'PRIVATE' as const,
  }

  await KV_SCHEMAS.put<Metadata>(key, JSON.stringify(schemaData), { metadata })

  return { schema: schemaData, metadata }
}

export const getSchema = async (
  userName: string,
  namespaceId: string,
  schemaId: string,
): Promise<{ schema: OpenAPI.Document | null; metadata: Metadata | null }> => {
  const key = getSchemaKey(userName, namespaceId, schemaId)
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
  const { schema } = await getSchema(user.login, namespaceId, schemaId)

  if (schema) {
    await deleteSchemaRaw(getSchemaKey(user.login, namespaceId, schemaId))
    return true
  }

  return false
}

export const modifySchemaAccess = async (
  user: User,
  namespaceId: string,
  schemaId: string,
  access: Metadata['access'],
): Promise<{ schema: OpenAPI.Document | null; metadata: Metadata | null }> => {
  const { schema, metadata } = await getSchema(
    user.login,
    namespaceId,
    schemaId,
  )

  if (schema && metadata) {
    const newMetadata = {
      ...metadata,
      access,
    }
    await KV_SCHEMAS.put<Metadata>(metadata.key, JSON.stringify(schema), {
      metadata: newMetadata,
    })
    return { schema, metadata: newMetadata }
  }

  return { schema, metadata }
}
