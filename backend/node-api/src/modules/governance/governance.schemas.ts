import { Type } from '@fastify/type-provider-typebox';

const uuid = Type.String({ format: 'uuid' });
const nullableUuid = Type.Union([uuid, Type.Null()]);
const nullableText = Type.Union([Type.String({ maxLength: 4_000 }), Type.Null()]);
const documentType = Type.Union([
  Type.Literal('MANUAL'),
  Type.Literal('DIAGRAMA'),
  Type.Literal('CERTIFICADO'),
  Type.Literal('LAUDO'),
  Type.Literal('PROCEDIMENTO'),
  Type.Literal('FICHA_TECNICA'),
  Type.Literal('OUTRO'),
]);
const entityType = Type.Union([
  Type.Literal('EMPRESA'),
  Type.Literal('PLANTA'),
  Type.Literal('SETOR'),
  Type.Literal('LINHA'),
  Type.Literal('ATIVO'),
  Type.Literal('COMPONENTE'),
]);
const documentStatus = Type.Union([
  Type.Literal('RASCUNHO'),
  Type.Literal('EM_REVISAO'),
  Type.Literal('VIGENTE'),
  Type.Literal('OBSOLETO'),
]);

export const documentParamsSchema = Type.Object(
  {
    documentId: Type.Optional(uuid),
    objectId: Type.Optional(uuid),
  },
  { additionalProperties: false },
);

export const documentListQuerySchema = Type.Object(
  {
    busca: Type.Optional(Type.String({ maxLength: 200 })),
    status: Type.Optional(documentStatus),
    tipo: Type.Optional(documentType),
    limite: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);

const metadata = Type.Object(
  {
    id: Type.Optional(uuid),
    documento_id: Type.Optional(uuid),
    codigo: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    titulo: Type.String({ minLength: 1, maxLength: 240 }),
    tipo: documentType,
    entidade_tipo: entityType,
    entidade_id: Type.Optional(nullableUuid),
    status: documentStatus,
    validade_em: Type.Optional(
      Type.Union([Type.String({ format: 'date' }), Type.Literal(''), Type.Null()]),
    ),
    responsavel_id: Type.Optional(nullableUuid),
    descricao: Type.Optional(nullableText),
    revisao: Type.Optional(Type.String({ maxLength: 40 })),
    observacao: Type.Optional(nullableText),
  },
  { additionalProperties: false },
);

export const documentUploadBodySchema = Type.Object(
  {
    dados: metadata,
    arquivo: Type.Object(
      {
        nome: Type.String({ minLength: 1, maxLength: 180 }),
        mime_type: Type.String({ minLength: 1, maxLength: 160 }),
        base64: Type.String({ minLength: 1, maxLength: 8_500_000 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const documentUpdateBodySchema = Type.Object(
  { dados: metadata },
  { additionalProperties: false },
);
