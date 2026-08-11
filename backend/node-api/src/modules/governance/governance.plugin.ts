import fastifyPlugin from 'fastify-plugin';

import { GovernanceController } from './governance.controller.js';
import { createGovernanceRoutes } from './governance.routes.js';
import { GovernanceService } from './governance.service.js';

export const governancePlugin = fastifyPlugin(
  async (app) => {
    const service = new GovernanceService(app.database, app.objectStorage);
    const controller = new GovernanceController(service);
    await app.register(createGovernanceRoutes(controller));
  },
  {
    name: 'fab-control-governance',
    dependencies: ['fab-control-authentication'],
  },
);
