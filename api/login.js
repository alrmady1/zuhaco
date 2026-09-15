import { ensureSchema, getValue, createSession } from '../lib/db.js';

// نفس منطق التحقق الحالي في app.js (attemptLogin): كلمة السر اختيارية لكل مستخدم
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    await ensureSchema();
    const { id, password } = req.body || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    const users = (await getValue('users')) || [];
    const user = users.find(u => u.id === id);
    if (!user) return res.status(401).json({ error: 'invalid user' });
    if (user.password && user.password !== (password || '')) {
      return res.status(401).json({ error: 'wrong password' });
    }

    const token = await createSession(user.id);
    res.status(200).json({ token, user });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ error: 'server error' });
  }
}
