import { ensureSchema, getValue } from '../lib/db.js';

// نقطة قراءة فقط للبيانات المحاسبية — تُستخدم حصرياً من موقع "قوائم الشركة الرئيسية"
// (تجميع الضريبة والقوائم المالية لكيان واحد من قسمي المقاولات والتنظيف). محمية بمفتاح
// سرّي ثابت (وليس بجلسة مستخدم عادية) لأن المستهلك خادم آخر لا متصفح مستخدم — تفادياً
// لانتهاء صلاحية جلسات الـ 30 يوماً المستخدمة في باقي النظام.
const REPORT_KEYS = ['accProjects', 'accGeneral', 'contracts', 'projects', 'clients', 'vehicles', 'users', 'custodies', 'employeeIncidents'];

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const provided = req.headers['x-reports-key'];
    const expected = process.env.REPORTS_API_KEY;
    if (!expected || provided !== expected) return res.status(401).json({ error: 'unauthorized' });

    await ensureSchema();
    const out = {};
    for (const key of REPORT_KEYS) {
      out[key] = (await getValue(key)) ?? [];
    }
    // لا يجوز تسريب كلمة سر تسجيل الدخول ضمن بيانات الموظفين المحاسبية
    out.users = out.users.map(u => { const { password, ...safe } = u; return safe; });
    return res.status(200).json(out);
  } catch (e) {
    console.error('reports-feed api error', e);
    res.status(500).json({ error: 'server error' });
  }
}
