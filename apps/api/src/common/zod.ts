import { applyDecorators, Body, Query, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Errors } from './errors';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw Errors.badRequest('VALIDATION_FAILED', {
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}

type JsonSchemaObject = Record<string, unknown>;

export function toOpenApiSchema(schema: ZodTypeAny): JsonSchemaObject {
  // Widened signature avoids TS2589 (deep generic instantiation) on large schemas.
  const convert = zodToJsonSchema as unknown as (
    s: ZodTypeAny,
    o: Record<string, unknown>,
  ) => JsonSchemaObject;
  const json = convert(schema, { target: 'openApi3', $refStrategy: 'none' });
  delete json.$schema;
  return json;
}

/** Validated request body + OpenAPI documentation from one Zod schema. */
export function ZodBody<T extends ZodTypeAny>(schema: T): ParameterDecorator {
  return Body(new ZodPipe(schema));
}

export function ApiZodBody(schema: ZodTypeAny): MethodDecorator {
  return applyDecorators(ApiBody({ schema: toOpenApiSchema(schema) }));
}

export function ZodQuery<T extends ZodTypeAny>(schema: T): ParameterDecorator {
  return Query(new ZodPipe(schema));
}

/** Documents each top-level property of an object schema as a query parameter. */
export function ApiZodQuery(schema: ZodTypeAny): MethodDecorator {
  const json = toOpenApiSchema(schema) as { properties?: Record<string, JsonSchemaObject> };
  const decorators = Object.entries(json.properties ?? {}).map(([name, prop]) =>
    ApiQuery({ name, required: false, schema: prop }),
  );
  return applyDecorators(...decorators);
}
