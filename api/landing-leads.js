import { sql } from '@vercel/postgres';
import { randomBytes } from 'crypto';
import { ensureSchema, getSessionUserId, getBearerToken } from '../lib/db.js';

// طلبات صفحة العرض LAND CODE
// POST  (عام)      : إنشاء طلب جديد من نموذج "اترك بياناتك"
// GET   (مصادقة)   : قائمة الطلبات للوحة التحكم
// PATCH (مصادقة)   : تحديث الحالة/الملاحظة { id, status, note }
// DELETE (مصادقة)  : حذف طلب ?id=
const STATUSES = ['جديد', 'تم التواصل', 'زيارة مجدولة', 'عرض سعر', 'تم التعاقد', 'غير مهتم'];

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.website) return res.status(200).json({ ok: true }); // حقل فخ للروبوتات
      const name = clean(b.name, 100);
      const phone = clean(b.phone, 20).replace(/[^\d+]/g, '');
      if (name.length < 2) return res.status(400).json({ error: 'invalid name' });
      if (phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'invalid phone' });
      if (!b.consent) return res.status(400).json({ error: 'consent required' });
      const data = {
        name, phone,
        city: clean(b.city, 60),
        projectType: clean(b.projectType, 60),
        need: clean(b.need, 60),
        area: clean(b.area, 30),
        location: clean(b.location, 300),
        details: clean(b.details, 2000),
        source: clean(b.source, 300),
      };
      const id = 'ld_' + Date.now().toString(36) + randomBytes(3).toString('hex');
      await sql`INSERT INTO landing_leads (id, data) VALUES (${id}, ${JSON.stringify(data)}::jsonb)`;
      return res.status(200).json({ ok: true, id });
    }

    const userId = await getSessionUserId(getBearerToken(req));
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT id, data, status, note, created_at FROM landing_leads ORDER BY created_at DESC LIMIT 1000`;
      return res.status(200).json(rows.map(r => ({ id: r.id, ...r.data, status: r.status, note: r.note, createdAt: r.created_at })));
    }

    if (req.method === 'PATCH') {
      const { id, status, note } = req.body || {};
      if (!id) return res.status(400).json({ error: 'missing id' });
      if (status !== undefined) {
        if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
        await sql`UPDATE landing_leads SET status = ${status} WHERE id = ${id}`;
      }
      if (note !== undefined) await sql`UPDATE landing_leads SET note = ${clean(note, 2000)} WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || '';
      if (!id) return res.status(400).json({ error: 'missing id' });
      await sql`DELETE FROM landing_leads WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('landing leads error', e);
    res.status(500).json({ error: 'server error' });
  }
}
