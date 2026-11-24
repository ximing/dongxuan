import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerAuthRoutes } from './auth/auth.routes.js';
import { redactOidcUrl } from './auth/oidc-logic.js';
import { registerOidcRoutes } from './auth/oidc.routes.js';
import { logOidcStartup } from './auth/oidc.service.js';
import { registerChartRoutes } from './chart/chart.routes.js';
import { config } from './config.js';
import { closeDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { AppError } from './errors.js';
import {registerV2Routes} from './v2/routes.js';
import {backfillLegacy} from './v2/charts.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({
    logger: {
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactOidcUrl(request.url),
            host: request.host,
            remoteAddress: request.ip,
          };
        },
      },
    },
  });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true, methods:['GET','HEAD','POST','PATCH','PUT','DELETE','OPTIONS'] });
  app.setErrorHandler((err, req, reply) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: '提交内容过大，请缩短正文或本次填写后重试。' } });
    }
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: err.issues.map(i=>i.path.join('.')+': '+i.message).join('；') } });
    }
    if(err instanceof Error && err.name==='ZiweiError')return reply.code(400).send({error:{code:'CALCULATION',message:err.message}});
    // PostgreSQL detail/message can include the entire failing row (including prompt text).
    // Keep diagnostic categories without serializing raw errors or their causes.
    const errorCode = err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' && /^[a-z0-9_]{1,64}$/i.test(err.code) ? err.code : undefined;
    req.log.error({ errorCode, errorName: err instanceof Error ? err.name : 'UnknownError' }, 'request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL', message: '服务器出错' } });
  });
  app.get('/health', async () => ({ ok: true }));
  registerAuthRoutes(app);
  registerOidcRoutes(app);
  registerChartRoutes(app);
  registerV2Routes(app);

  const webDist = path.resolve(here, '../../web/dist');
  if (process.env.SERVE_WEB === '1' && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '没有这个接口' } });
      }
      return reply.sendFile('index.html');
    });
  }
  return app;
}

const isDirect = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isDirect) {
  const app = await buildApp();
  await migrate();
  const backfill = await backfillLegacy();
  app.log.info(backfill,'legacy snapshot backfill');
  if(backfill.failed>0){await closeDb();throw new Error('旧盘回填存在失败记录，服务暂未开放；请在维护窗口修复后重新执行回填');}
  logOidcStartup(app.log);
  await app.listen({ port: config.PORT, host: config.HOST });
  const shutdown = async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}
