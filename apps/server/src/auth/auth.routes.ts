import { loginInputSchema, passwordChangeSchema, registerInputSchema } from '@dongxuan/dto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { changePassword, getMe, loginUser, logoutSession, registerUser } from './auth.service.js';
import { authenticate, requireUser } from './authenticate.js';
import { clearAuthCookies } from './cookies.js';
import { consumeLoginIp } from './rate-limit.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/register', async (req, reply) => {
    if (config.NODE_ENV !== 'test' && !consumeLoginIp(req.ip)) {
      throw AppError.of(429, 'RATE_LIMITED', '尝试次数太多，请稍后再试');
    }
    const input = registerInputSchema.parse(req.body);
    const response = await registerUser(input, reply);
    return reply.code(201).send(response);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = loginInputSchema.parse(req.body);
    if (config.NODE_ENV !== 'test' && !consumeLoginIp(req.ip)) {
      throw AppError.of(429, 'RATE_LIMITED', '尝试次数太多，请稍后再试');
    }
    return loginUser(input, reply);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await logoutSession(req);
    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req) => {
    return getMe(requireUser(req).id);
  });

  app.post('/api/me/password', { preHandler: [authenticate] }, async (req, reply) => {
    await changePassword(requireUser(req).id, passwordChangeSchema.parse(req.body));
    return reply.code(204).send();
  });
}
