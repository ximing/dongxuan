import type { AuthResponse, LoginInput, PasswordChangeInput, PublicUser, RegisterInput } from '@dongxuan/dto';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.js';
import { isUniqueViolation } from '../db/pg.js';
import { users, type UserRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, readSignedCookie, setAccessCookie, setRefreshCookie } from './cookies.js';
import { assertOidcEmailAvailable, provisionOidcRegistration } from './oidc.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { signAccessToken, signRefreshToken, verifyToken } from './token.js';

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getUserById(userId: string): Promise<UserRow> {
  const [row] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw AppError.of(401, 'INVALID_TOKEN');
  return row;
}

export function issueAuthCookies(reply: FastifyReply, userId: string, sessionVersion: number): void {
  setAccessCookie(reply, signAccessToken(userId, sessionVersion));
  setRefreshCookie(reply, signRefreshToken(userId, sessionVersion));
}

async function authResponse(reply: FastifyReply, row: UserRow): Promise<AuthResponse> {
  issueAuthCookies(reply, row.id, row.sessionVersion);
  return { user: toPublicUser(row) };
}

export async function registerUser(input: RegisterInput, reply: FastifyReply): Promise<AuthResponse> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const [existing] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw AppError.of(409, 'EMAIL_ALREADY_REGISTERED');
  await assertOidcEmailAvailable(email);
  let row: UserRow | undefined;
  try {
    const inserted = await getDb()
      .insert(users)
      .values({ email, passwordHash, displayName: input.displayName ?? null })
      .returning();
    row = inserted[0];
    if (!row) throw AppError.of(500, 'INTERNAL');
    await provisionOidcRegistration(row, passwordHash);
  } catch (err) {
    if (row) await getDb().delete(users).where(eq(users.id, row.id));
    if (err instanceof AppError) throw err;
    if (isUniqueViolation(err)) throw AppError.of(409, 'EMAIL_ALREADY_REGISTERED');
    throw err;
  }
  return authResponse(reply, row);
}

export async function loginUser(input: LoginInput, reply: FastifyReply): Promise<AuthResponse> {
  const email = input.email.trim().toLowerCase();
  const [row] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  if (!row?.passwordHash || !(await verifyPassword(input.password, row.passwordHash))) {
    throw AppError.of(401, 'INVALID_CREDENTIALS');
  }
  return authResponse(reply, row);
}

export async function changePassword(userId: string, input: PasswordChangeInput): Promise<void> {
  const row = await getUserById(userId);
  if (!row.passwordHash) throw AppError.of(400, 'NO_LOCAL_PASSWORD');
  if (!(await verifyPassword(input.currentPassword, row.passwordHash))) {
    throw AppError.of(401, 'INVALID_CREDENTIALS');
  }
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function logoutSession(req: FastifyRequest): Promise<void> {
  try {
    const refresh = readSignedCookie(req, REFRESH_COOKIE_NAME);
    const token = refresh ?? readSignedCookie(req, ACCESS_COOKIE_NAME);
    if (!token) return;
    const kind = refresh ? 'refresh' : 'access';
    const { userId, sessionVersion } = verifyToken(token, kind);
    await getDb()
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.sessionVersion, sessionVersion)));
  } catch {
    // An unreadable cookie still counts as logged out.
  }
}

export async function getMe(userId: string): Promise<PublicUser> {
  return toPublicUser(await getUserById(userId));
}
