// Admin authentication: scrypt password hash (Worker secret), random session
// tokens stored only as SHA-256 hashes in D1, httpOnly/Secure/SameSite=Strict
// cookie, per-session CSRF token, and failed-login throttling per IP.
import { scrypt } from "@noble/hashes/scrypt";
import { HttpError, sha256Hex, timingSafeEqual, hex } from "./util.js";

export const SESSION_COOKIE = "__Host-wl_admin";
const SESSION_TTL_S = 12 * 60 * 60; // 12 hours
const FAIL_WINDOW_S = 15 * 60;
const FAIL_LIMIT_PER_IP = 5;
const FAIL_LIMIT_GLOBAL = 50;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Hash format: scrypt:N:r:p:<salt b64>:<hash b64>  (no "$", so it is safe in .env files)
export function hashPassword(password, { N = 2 ** 14, r = 8, p = 1 } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const dk = scrypt(new TextEncoder().encode(password), salt, { N, r, p, dkLen: 32 });
  return ["scrypt", N, r, p, b64(salt), b64(dk)].join(":");
}

export function verifyPassword(password, stored) {
  if (typeof stored !== "string" || typeof password !== "string") return false;
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map((x) => parseInt(x, 10));
  if (!(N >= 1024 && N <= 2 ** 17 && r >= 1 && r <= 16 && p >= 1 && p <= 4)) return false;
  let salt, expected;
  try {
    salt = unb64(parts[4]);
    expected = unb64(parts[5]);
  } catch {
    return false;
  }
  const dk = scrypt(new TextEncoder().encode(password), salt, { N, r, p, dkLen: expected.length });
  return timingSafeEqual(hex(dk), hex(expected));
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

export async function loginThrottled(env, request) {
  const now = Math.floor(Date.now() / 1000);
  const since = now - FAIL_WINDOW_S;
  const ip = clientIp(request);
  const row = await env.DB.prepare(
    "SELECT SUM(CASE WHEN ip = ?1 THEN 1 ELSE 0 END) AS mine, COUNT(*) AS total FROM login_attempts WHERE at > ?2"
  ).bind(ip, since).first();
  return (row && (row.mine >= FAIL_LIMIT_PER_IP || row.total >= FAIL_LIMIT_GLOBAL)) || false;
}

export async function recordFailedLogin(env, request) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO login_attempts (ip, at) VALUES (?1, ?2)").bind(clientIp(request), now),
    env.DB.prepare("DELETE FROM login_attempts WHERE at < ?1").bind(now - 24 * 3600),
  ]);
}

export async function clearFailedLogins(env, request) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?1").bind(clientIp(request)).run();
}

export async function createSession(env) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const csrf = hex(crypto.getRandomValues(new Uint8Array(24)));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_sessions (token_hash, csrf, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
      .bind(await sha256Hex(token), csrf, now, now + SESSION_TTL_S),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?1").bind(now),
  ]);
  return { token, csrf, cookie: sessionCookie(token, SESSION_TTL_S) };
}

export function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

export async function getSession(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare("SELECT token_hash, csrf, expires_at FROM admin_sessions WHERE token_hash = ?1")
    .bind(await sha256Hex(token)).first();
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return null;
  return row;
}

export async function destroySession(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (/^[0-9a-f]{64}$/.test(token)) {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
  }
}

// Middleware for /api/admin/*: authenticate (401), then for state-changing
// requests require the session's CSRF token (403). Runs before any handler.
export async function requireAdmin(env, request) {
  const session = await getSession(env, request);
  if (!session) throw new HttpError(401, "Please sign in");
  if (request.method !== "GET" && request.method !== "HEAD") {
    const sent = request.headers.get("X-CSRF-Token") || "";
    if (!timingSafeEqual(sent, session.csrf)) throw new HttpError(403, "Forbidden");
  }
  return session;
}

// ---------------------------------------------------------------- customer accounts
// Same design as the admin session: random token, only its SHA-256 is stored.
export const ACCOUNT_COOKIE = "__Host-wl_account";
const ACCOUNT_TTL_S = 30 * 24 * 60 * 60;

export const accountCookie = (token, maxAge) => `${ACCOUNT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function createAccountSession(env, accountId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?1, ?2, ?3)").bind(await sha256Hex(token), accountId, now + ACCOUNT_TTL_S),
    env.DB.prepare("DELETE FROM account_sessions WHERE expires_at < ?1").bind(now),
  ]);
  return accountCookie(token, ACCOUNT_TTL_S);
}

export async function getAccount(env, request) {
  const token = readCookie(request, ACCOUNT_COOKIE);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    "SELECT a.id, a.name, a.phone, a.email, s.expires_at FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?1"
  ).bind(await sha256Hex(token)).first();
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) return null;
  return { id: row.id, name: row.name, phone: row.phone, email: row.email };
}

export async function destroyAccountSession(env, request) {
  const token = readCookie(request, ACCOUNT_COOKIE);
  if (/^[0-9a-f]{64}$/.test(token)) await env.DB.prepare("DELETE FROM account_sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
}
