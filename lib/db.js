import { sql } from '@vercel/postgres';
import { randomBytes } from 'crypto';

let schemaReady = false;

// ينشئ الجداول إن لم تكن موجودة بعد — استدعاء آمن ورخيص التكرار من أي دالة خادم
export async function ensureSchema() {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS app_data (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  schemaReady = true;
}

export async function getValue(key) {
  const { rows } = await sql`SELECT value FROM app_data WHERE key = ${key}`;
  return rows.length ? rows[0].value : undefined;
}

export async function getAllData() {
  const { rows } = await sql`SELECT key, value FROM app_data`;
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function isDataEmpty() {
  const { rows } = await sql`SELECT 1 FROM app_data LIMIT 1`;
  return rows.length === 0;
}

export async function setValue(key, value) {
  await sql`INSERT INTO app_data (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

export async function setBulk(obj) {
  for (const [key, value] of Object.entries(obj)) {
    await setValue(key, value);
  }
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${userId})`;
  return token;
}

// صلاحية الجلسة: 30 يوماً (ثابت مضمّن مباشرة في الاستعلام — وليس قيمة مُدخلة من المستخدم)
export async function getSessionUserId(token) {
  if (!token) return null;
  const { rows } = await sql`
    SELECT user_id FROM sessions
    WHERE token = ${token} AND created_at > now() - interval '30 days'
  `;
  return rows.length ? rows[0].user_id : null;
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
