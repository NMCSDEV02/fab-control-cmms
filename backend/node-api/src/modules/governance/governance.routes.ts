import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { successEnvelopeSchema } from '../auth/auth.schemas.js';
import type { GovernanceController } from './governance.controller.js';
import {
  documentListQuerySchema,
  documentParamsSchema,
  documentUpdateBodySchema,
  documentUploadBodySchema,
} from './governance.schemas.js';

const secured = {
  response: { 200: successEnvelopeSchema },
  security: [{ bearerAuth: [] }],
  tags: ['Governance'],
};

export function createGovernanceRoutes(
  controller: GovernanceController,
): FastifyPluginAsyncTypebox {
  return (app) => {
    app.get('/v1/admin/documents', {
      preHandler: (request) => app.authorize(request, 'admin.governance.read'),
      schema: { ...secured, querystring: documentListQuerySchema },
      handler: controller.listDocuments,
    });
    app.get('/v1/admin/documents/:documentId', {
      preHandler: (request) => app.authorize(request, 'admin.governance.read'),
      schema: { ...secured, params: documentParamsSchema },
      handler: controller.documentDetail,
    });
    app.post('/v1/admin/documents', {
      preHandler: (request) => app.authorize(request, 'admin.governance.manage'),
      bodyLimit: 8_700_000,
      schema: { ...secured, body: documentUploadBodySchema },
      handler: controller.uploadDocument,
    });
    app.patch('/v1/admin/documents/:documentId', {
      preHandler: (request) => app.authorize(request, 'admin.governance.manage'),
      schema: { ...secured, params: documentParamsSchema, body: documentUpdateBodySchema },
      handler: controller.updateDocument,
    });
    app.get('/v1/admin/document-files/:objectId', {
      preHandler: (request) => app.authorize(request, 'admin.governance.read'),
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ['Governance'],
        params: documentParamsSchema,
      },
      handler: controller.openDocumentFile,
    });
    return Promise.resolve();
  };
}
