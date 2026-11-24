import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { getUserById, issueAuthCookies } from './auth.service.js';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, readSignedCookie } from './cookies.js';
import { verifyToken } from './token.js';

async function userFromToken(token: string, type: 'access' | 'refresh'): Promise<UserRow | undefined> {
  try {
    const { userId, sessionVersion } = verifyToken(token, type);
    const user = await getUserById(userId);
    if (user.sessionVersion !== sessionVersion) return undefined;
    return user;
  } catch {
    return undefined;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const access = readSignedCookie(req, ACCESS_COOKIE_NAME);
  if (access) {
    const user = await userFromToken(access, 'access');
    if (user) {
      req.user = { id: user.id };
      return;
    }
  }
  const refresh = readSignedCookie(req, REFRESH_COOKIE_NAME);
  if (refresh) {
    const user = await userFromToken(refresh, 'refresh');
    if (user) {
      issueAuthCookies(reply, user.id, user.sessionVersion);
      req.user = { id: user.id };
      return;
    }
  }
  throw AppError.of(401, 'INVALID_TOKEN');
}

export async function readSessionUser(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | undefined> {
  const access = readSignedCookie(req, ACCESS_COOKIE_NAME);
  if (access) {
    const user = await userFromToken(access, 'access');
    if (user) return user;
  }
  const refresh = readSignedCookie(req, REFRESH_COOKIE_NAME);
  if (refresh) {
    const user = await userFromToken(refresh, 'refresh');
    if (user) {
      issueAuthCookies(reply, user.id, user.sessionVersion);
      return user;
    }
  }
  return undefined;
}

export function requireUser(req: FastifyRequest): { id: string } {
  if (!req.user) throw AppError.of(401, 'INVALID_TOKEN');
  return req.user;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string };
  }
}
