import { chartInputSchema } from '@dongxuan/dto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireUser } from '../auth/authenticate.js';
import { createChart, deleteChart, getChart, listCharts } from './chart.service.js';

const idParams = z.object({ id: z.string().uuid() });

export function registerChartRoutes(app: FastifyInstance): void {
  app.get('/api/charts', { preHandler: [authenticate] }, async (req) => {
    return listCharts(requireUser(req).id);
  });

  app.post('/api/charts', { preHandler: [authenticate] }, async (req, reply) => {
    const chart = await createChart(requireUser(req).id, chartInputSchema.parse(req.body));
    return reply.code(201).send(chart);
  });

  app.get('/api/charts/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    return getChart(requireUser(req).id, id);
  });

  app.delete('/api/charts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await deleteChart(requireUser(req).id, id);
    return reply.code(204).send();
  });
}
