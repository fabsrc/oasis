import { Validator, Schema } from '@cfworker/json-schema'

import SwaggerSchema from './schemas/swagger.json'
import OpenAPISchema from './schemas/openapi.json'
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types'

const swaggerSchemaValidator = new Validator(
  SwaggerSchema as unknown as Schema,
  '4',
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
