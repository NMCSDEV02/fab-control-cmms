import fastifyPlugin from 'fastify-plugin';

import { GovernanceController } from './governance.controller.js';
import { createGovernanceRoutes } from './governance.routes.js';
import { GovernanceService } from './governance.service.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

export const governancePlugin = fastifyPlugin(
  async (app) => {
    const service = new GovernanceService(app.database, app.objectStorage);
    const controller = new GovernanceController(service);
    const importController = new ImportController(new ImportService(app.database));
    await app.register(createGovernanceRoutes(controller, importController));
  },
  {
    name: 'fab-control-governance',
    dependencies: ['fab-control-authentication'],
  },
);
