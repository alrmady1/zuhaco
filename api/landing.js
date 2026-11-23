import { ensureSchema, getValue } from '../lib/db.js';

// إعدادات صفحة العرض LAND CODE — قراءة عامة بلا مصادقة (لا تحتوي أي بيانات حساسة)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    await ensureSchema();
    const settings = (await getValue('landingSettings')) || null;
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    res.status(200).json({ settings });
  } catch (e) {
    console.error('landing settings error', e);
    res.status(500).json({ error: 'server error' });
  }
}
