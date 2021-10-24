import { Validator, Schema } from '@cfworker/json-schema'

import SwaggerSchema from './schemas/swagger.json'
import OpenAPISchema from './schemas/openapi.json'
import Draf04Schema from './schemas/draft-04.json'
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types'

const swaggerSchemaValidator = new Validator(
  SwaggerSchema as unknown as Schema,
  '4',
)
swaggerSchemaValidator.addSchema(
  Draf04Schema as unknown as Schema,
  'http://json-schema.org/draft-04/schema',
)
const openApiSchemaValidator = new Validator(
  OpenAPISchema as unknown as Schema,
  '4',
)

export const isValidSchema = (
  data: OpenAPI.Document | unknown,
): data is OpenAPI.Document => {
  if ((data as OpenAPIV3.Document).openapi) {
    return openApiSchemaValidator.validate(data).valid
  }

  if ((data as OpenAPIV2.Document).swagger) {
    return swaggerSchemaValidator.validate(data).valid
  }
  return false
}

export const isValidGithubUsername = (username: string): boolean => {
  const re = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/iu
  return re.test(username)
}

export const isValidNamespace = (namespace: string): boolean => {
  const re = /^[\w-]{3,30}$/iu
  return re.test(namespace)
}
