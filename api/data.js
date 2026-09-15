import { ensureSchema, getAllData, isDataEmpty, setValue, setBulk, getSessionUserId, getBearerToken } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const userId = await getSessionUserId(getBearerToken(req));
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const data = await getAllData();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const empty = await isDataEmpty();
      if (!empty) {
        const userId = await getSessionUserId(getBearerToken(req));
        if (!userId) return res.status(401).json({ error: 'unauthorized' });
      }
      const body = req.body || {};
      if (body.bulk && typeof body.bulk === 'object') {
        await setBulk(body.bulk);
        return res.status(200).json({ ok: true });
      }
      if (body.key) {
        await setValue(body.key, body.value);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'missing key or bulk' });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error('data api error', e);
    res.status(500).json({ error: 'server error' });
  }
}
