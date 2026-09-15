import { ensureSchema, getValue } from '../lib/db.js';

// قائمة عامة (بدون كلمات سر) لعرضها في شاشة تسجيل الدخول قبل أي مصادقة
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    await ensureSchema();
    const users = (await getValue('users')) || [];
    const publicUsers = users.map(u => ({ id: u.id, name: u.name, role: u.role, username: u.username }));
    res.status(200).json(publicUsers);
  } catch (e) {
    console.error('public-users error', e);
    res.status(500).json({ error: 'server error' });
  }
}
