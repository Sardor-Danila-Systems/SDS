import "server-only";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role, User } from "@/types/crm";
import { can } from "./crm/rbac";
import { readCrm, mutateCrm } from "./crm/store";

const COOKIE_NAME = "admin_session";
const secret = new TextEncoder().encode(
  process.env.ADMIN_SESSION_SECRET ?? "dev-only-insecure-secret-change-me",
);

/*
  Sessions carry who you are and what you may do, so every server-side check
  can be made without another round trip to storage.

  Two ways in:
  - the bootstrap admin from ADMIN_LOGIN / ADMIN_PASSWORD, which always works
    and cannot be locked out;
  - CRM users stored in the document, with PBKDF2-hashed passwords.
*/

export interface SessionUser {
  id: string;
  name: string;
  login: string;
  role: Role;
}

const BOOTSTRAP_ID = "bootstrap-admin";

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Who is signed in. Verified once per request — the layout, the page and every
 * repository call ask for it, and re-verifying the JWT each time is pure cost.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.role) return null;
    const session: SessionUser = {
      id: String(payload.sub),
      name: String(payload.name ?? payload.login ?? "—"),
      login: String(payload.login ?? ""),
      role: payload.role as Role,
    };
    if (session.id === BOOTSTRAP_ID) return session;

    // A deactivated account must stop working now, not when its cookie
    // expires, and a changed role applies on the next request.
    const { users } = await readCrm();
    const stored = users.find((u) => u.id === session.id);
    if (!stored?.active) return null;
    return { ...session, name: stored.name, role: stored.role };
  } catch {
    return null;
  }
});

/** Editing the public site's content is the admin's job, not the sales team's. */
export async function canEditContent() {
  const user = await getSessionUser();
  return user !== null && can(user.role, "content.write");
}

export async function isAuthed() {
  return (await getSessionUser()) !== null;
}

/* ------------------------------------------------------------------ */
/* Password hashing — Web Crypto, so no extra dependency and it also   */
/* runs on the Edge runtime.                                           */
/* ------------------------------------------------------------------ */

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 120_000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toHex(bits);
}

/** Constant-time-ish compare, so a wrong password leaks nothing by timing. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ */

export function bootstrapAdmin(): SessionUser {
  return {
    id: BOOTSTRAP_ID,
    name: "Администратор",
    login: process.env.ADMIN_LOGIN ?? "admin",
    role: "ADMIN",
  };
}

/** Verify credentials against the bootstrap admin, then the CRM users. */
export async function authenticate(
  login: string,
  password: string,
): Promise<SessionUser | null> {
  const envLogin = process.env.ADMIN_LOGIN;
  const envPassword = process.env.ADMIN_PASSWORD;

  if (envLogin && envPassword && login === envLogin && password === envPassword) {
    return bootstrapAdmin();
  }

  const { users } = await readCrm();
  const wanted = login.trim().toLowerCase();
  const user = users.find((u) => u.login.toLowerCase() === wanted && u.active);
  if (!user?.passwordHash || !user.passwordSalt) return null;

  const hash = await hashPassword(password, user.passwordSalt);
  if (!safeEqual(hash, user.passwordHash)) return null;

  return { id: user.id, name: user.name, login: user.login, role: user.role };
}

/** Everyone who can own a record — the bootstrap admin included. */
export async function listAssignableUsers(): Promise<SessionUser[]> {
  const { users } = await readCrm();
  return [
    bootstrapAdmin(),
    ...users
      .filter((u) => u.active)
      .map((u) => ({ id: u.id, name: u.name, login: u.login, role: u.role })),
  ];
}

export async function createUser(input: {
  name: string;
  login: string;
  password: string;
  role: Role;
}): Promise<User> {
  const salt = createSalt();
  const passwordHash = await hashPassword(input.password, salt);

  return mutateCrm((data) => {
    const user: User = {
      id: crypto.randomUUID(),
      name: input.name,
      login: input.login,
      role: input.role,
      passwordHash,
      passwordSalt: salt,
      active: true,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    return user;
  });
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
