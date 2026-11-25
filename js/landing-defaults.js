/* =========================================================
   صفحة العرض LAND CODE — المحتوى الافتراضي المشترك
   يُستخدم في صفحة العرض العامة (/landcode/) وفي تبويب
   الإعدادات ← صفحة العرض داخل نظام الإدارة. أي قيمة يحفظها
   المسؤول في "landingSettings" تطغى على القيمة الافتراضية هنا.
   ========================================================= */

/* شعار LAND CODE (مكعب متساوي القياس بسقف ومدخنة) بصيغة SVG — يأخذ لونه من currentColor */
const LANDCODE_LOGO_SVG = `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="miter" stroke-linecap="square" aria-hidden="true">
  <polyline points="30,51 60,33 90,51"/>
  <line x1="81" y1="27" x2="81" y2="45"/>
  <polyline points="44,58 60,67 76,58"/>
  <rect x="55" y="45" width="10" height="10" transform="rotate(45 60 50)" fill="currentColor" stroke="none"/>
  <polyline points="24,61 60,82 96,61"/>
  <polyline points="24,61 24,103 60,124 96,103 96,61"/>
  <line x1="60" y1="82" x2="60" y2="124"/>
</svg>`;

const LANDING_DEFAULTS = {
  enabled: true,
  brandName: "LAND CODE",
  tagline: "DESIGN IDEAS AND SOLUTIONS",
  legalName: "شركة زهى الأعمال للمقاولات",
  logo: "",                 // صورة مرفوعة (اختياري) — إن تُركت فارغة يُستخدم شعار SVG أعلاه
  accent: "#b08d57",        // اللون المميز (ذهبي رملي)
  dark: "#121212",          // لون الخلفيات الداكنة
  city: "الرياض",
  whatsapp: "966582464181", // رقم واتساب (0582464181) بالصيغة الدولية — يقبل أيضاً الصيغة المحلية 05XXXXXXXX
  whatsappMessage: "السلام عليكم، أرغب في الاستفسار عن خدمات التصميم والتشطيب لدى LAND CODE",
  phone: "0582464181",
  email: "",
  website: "",
  address: "",
  crNumber: "",
  vatNumber: "",
  social: { instagram: "", x: "", tiktok: "", snapchat: "" },

  seo: {
    title: "LAND CODE | ابدأ مشروعك — تصميم وتشطيب داخلي في الرياض",
    description: "LAND CODE — العلامة التجارية لشركة زهى الأعمال للمقاولات: تصميم وتنفيذ أعمال الديكور والتشطيبات للفلل والشقق والمكاتب والمطاعم في الرياض.",
  },

  hero: {
    eyebrow: "Begin Your Project",
    title: "ابدأ مشروعك مع LAND CODE",
    subtitle: "تصميم وتنفيذ أعمال الديكور والتشطيبات الداخلية — فلل، شقق، مكاتب، مطاعم ومقاهي.",
    tagline: "كل تفصيلة مدروسة… من الفكرة حتى التسليم",
    image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1920&q=75",
    ctaWhatsapp: "تواصل معنا واتساب",
    ctaForm: "اترك بياناتك ونتصل فيك",
  },

  sections: { services: true, gallery: true, execution: true, stats: false, form: true, process: true, clients: false, faq: true },

  servicesTitle: "وش نسوي لك",
  servicesEyebrow: "What We Do",
  services: [
    { title: "التشطيبات السكنية", en: "Residential", desc: "فلل وشقق — من التصميم حتى التسليم مفتاح." },
    { title: "المكاتب والمساحات التجارية", en: "Offices", desc: "بيئات عمل عملية تعكس هوية علامتك." },
    { title: "المطاعم والمقاهي", en: "Food & Beverage", desc: "تجربة ضيف متكاملة في كل زاوية." },
    { title: "الديكورات الداخلية", en: "Interior Decor", desc: "جبس، بديل خشب، ورق جدران وإضاءة مخفية." },
    { title: "الأرضيات والرخام", en: "Flooring & Marble", desc: "رخام، بورسلان، باركيه وتركيب دقيق." },
    { title: "الدهانات والواجهات", en: "Paint & Facades", desc: "دهانات ديكورية وواجهات بتشطيب نهائي." },
  ],

  galleryTitle: "من أعمالنا",
  galleryEyebrow: "Selected Work",
  gallery: [
    { title: "مجلس", en: "Majlis", image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=70" },
    { title: "غرفة نوم", en: "Bedroom", image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=70" },
    { title: "مطبخ", en: "Kitchen", image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=70" },
    { title: "صالة معيشة", en: "Living Room", image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=70" },
    { title: "استقبال", en: "Lobby", image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=70" },
    { title: "واجهة فيلا", en: "Villa Facade", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70" },
  ],

  // صور مصغرة لأعمال قسم التنفيذ — تُكبَّر عند الضغط عليها (لا يظهر القسم إلا بعد إضافة صور)
  executionTitle: "أعمالنا — قسم التنفيذ",
  executionEyebrow: "Execution Work",
  execution: [],            // [{ title, image }]

  stats: [
    { value: "+100", label: "مشروع منجز" },
    { value: "+10", label: "سنوات خبرة" },
    { value: "+50", label: "فني ومهندس" },
    { value: "24", label: "ساعة للرد" },
  ],

  form: {
    eyebrow: "Request a Consultation",
    title: "اترك بياناتك",
    intro: "يتواصل معك أحد أعضاء فريقنا خلال يوم عمل لتحديد موعد الاستشارة.",
    cities: ["الرياض", "الدرعية", "الخرج", "المزاحمية", "أخرى"],
    projectTypes: ["سكني", "مكاتب", "مطاعم ومقاهي", "تجاري / ضيافة"],
    needs: ["تصميم وتنفيذ", "تصميم فقط", "تنفيذ وتشطيب", "استشارة"],
    consent: "أوافق على التواصل معي عبر الهاتف أو واتساب",
    submit: "إرسال الطلب",
    success: "تم استلام طلبك بنجاح ✓ سيتواصل معك فريق LAND CODE قريباً.",
  },

  processTitle: "كيف نشتغل",
  processEyebrow: "How It Works",
  process: [
    { title: "التواصل", desc: "نفهم المساحة واحتياجك وميزانيتك." },
    { title: "الزيارة والقياس", desc: "نقدّم التصميم وعرض سعر تفصيلي لكل بند." },
    { title: "التنفيذ والتسليم", desc: "إشراف هندسي كامل حتى تسليم المفتاح." },
  ],

  clientsTitle: "عملاء نعتز بهم",
  clients: [],              // [{ name, logo }]

  faqTitle: "أسئلة شائعة",
  faq: [
    { q: "كم تستغرق مدة التنفيذ؟", a: "تختلف حسب المساحة ونطاق الأعمال، ونوضح جدولاً زمنياً مفصلاً مع عرض السعر قبل البدء." },
    { q: "هل تقدمون التصميم فقط بدون تنفيذ؟", a: "نعم، يمكنك طلب التصميم فقط أو التنفيذ فقط أو الخدمة المتكاملة من التصميم حتى التسليم." },
    { q: "كيف تتم آلية الدفع؟", a: "على دفعات مرتبطة بمراحل التنفيذ، وتكون موضحة في العقد وعرض السعر." },
    { q: "ما المناطق التي تغطونها؟", a: "نعمل في الرياض والمناطق المحيطة بها." },
  ],

  privacyText: "نستخدم البيانات التي تدخلها في نموذج الطلب (الاسم، الجوال، المدينة، الموقع وتفاصيل المشروع) فقط للتواصل معك بخصوص طلبك وتقديم عرض السعر، ولا نشاركها مع أي طرف ثالث. يمكنك طلب حذف بياناتك في أي وقت عبر التواصل معنا.",
};

/* دمج عميق: يأخذ القيم المحفوظة ويكمل الناقص من الافتراضي (المصفوفات تُستبدل كاملة) */
function mergeLandingSettings(saved, defaults) {
  defaults = defaults || LANDING_DEFAULTS;
  if (!saved || typeof saved !== "object") return JSON.parse(JSON.stringify(defaults));
  const out = Array.isArray(defaults) ? [] : {};
  for (const k of Object.keys(defaults)) {
    const d = defaults[k], s = saved[k];
    if (s === undefined || s === null) out[k] = JSON.parse(JSON.stringify(d));
    else if (d && typeof d === "object" && !Array.isArray(d)) out[k] = mergeLandingSettings(s, d);
    else out[k] = JSON.parse(JSON.stringify(s));
  }
  return out;
}

/* حالات طلبات صفحة العرض */
const LANDING_LEAD_STATUSES = ["جديد", "تم التواصل", "زيارة مجدولة", "عرض سعر", "تم التعاقد", "غير مهتم"];
