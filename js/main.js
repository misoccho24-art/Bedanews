/* =====================================================================
   সাধারণ স্ক্রিপ্ট — হেডার, ড্রয়ার, ফুটার, ট্যাববার, থিম, কার্ড টেমপ্লেট
   ===================================================================== */

/* ---------- ছোট হেল্পার ---------------------------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* বাংলা সংখ্যা */
const bnNum = n => String(n).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);

const catName = slug => (CATEGORIES.find(c => c.slug === slug) || {}).name || slug;

/* ---------- খবরের তালিকা (স্টোর থেকে) -------------------------------- */
let POSTS = [];
function refreshPosts() { POSTS = getPosts(); return POSTS; }

const byId  = id => POSTS.find(a => String(a.id) === String(id));
const inCat = slug => POSTS.filter(a => a.cat === slug);
const recent = (n = 6) => POSTS.slice(0, n);
/* সব লিংক আসল ফাইলের দিকে (article.html, category.html) — তাই হোস্টিং, প্রিভিউ সার্ভার,
   Live Server বা ফাইল থেকে সরাসরি খুললেও কাজ করে। খবরের নম্বর (a.no) সার্ভার দেয়;
   নম্বর না থাকা (লোকাল মোডের) খবরে ?id=... চলে। */
const HOME  = "index.html";
const link  = a => a.no ? `article.html?n=${a.no}` : `article.html?id=${a.id}`;
const topicLink = slug => `category.html?cat=${slug}`;

/* HTML থেকে প্লেইন টেক্সট (সার্চ ও পড়ার সময় হিসাবের জন্য) */
function plainTextFromHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = String(html || "");
  return d.textContent || "";
}

/* সমৃদ্ধ লেখায় শুধু নির্দিষ্ট কিছু ট্যাগ ও লিংক অনুমোদিত — সার্ভারও আলাদাভাবে
   একই কাজ করে; এটি দ্বিতীয় স্তরের সুরক্ষা এবং লোকাল মোডে একমাত্র সুরক্ষা। */
const RICH_ALLOWED_TAGS = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "A", "BLOCKQUOTE", "MARK", "H3"]);
function sanitizeRichHtml(html) {
  const root = document.createElement("div");
  root.innerHTML = String(html || "");
  (function walk(node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 1) {
        const tag = child.tagName;
        if (!RICH_ALLOWED_TAGS.has(tag)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        let safeHref = null;
        if (tag === "A") {
          const href = (child.getAttribute("href") || "").trim();
          if (/^(https?:|mailto:)/i.test(href)) safeHref = href;
        }
        Array.from(child.attributes).forEach(at => child.removeAttribute(at.name));
        if (tag === "A" && safeHref) {
          child.setAttribute("href", safeHref);
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        }
        walk(child);
      } else if (child.nodeType !== 3) {
        node.removeChild(child);
      }
    });
  })(root);
  return root.innerHTML;
}

/* একটি খবরের সব লেখা এক স্ট্রিংয়ে — সার্চের জন্য, প্রতিটি খবরে একবারই বানানো হয় */
const _searchCache = new WeakMap();
const searchText = a => {
  let v = _searchCache.get(a);
  if (v === undefined) {
    v = [a.title, a.subHeadline, a.excerpt, a.author, catName(a.cat),
         a.district, a.division && divisionName(a.division),
         (a.keywords || []).join(" "),
         a.content ? plainTextFromHtml(a.content) : (a.body || []).join(" ")]
      .filter(Boolean).join(" ").toLowerCase();
    _searchCache.set(a, v);
  }
  return v;
};

/* খবরটির সঙ্গে মেলে এমন ট্যাগ + লেখকের নিজের কীওয়ার্ড */
const tagsFor = a => {
  const t = searchText(a);
  const hits = TAGS.filter(tag => t.includes(tag.toLowerCase()));
  const own = (a.keywords || []).filter(Boolean);
  const merged = [...new Set([...own, ...hits])];
  return merged.length ? merged.slice(0, 5) : [catName(a.cat)];
};

/* যেসব ট্যাগের জন্য অন্তত একটি খবর আছে */
const liveTags = () =>
  TAGS.filter(tag => POSTS.some(a => searchText(a).includes(tag.toLowerCase())));

/* ---------- ছবি: img না থাকলে নকশা করা প্লেসহোল্ডার ------------------- */
/* হালকা, উজ্জ্বল সবুজ-সায়ান-নীল — লাল, বাদামি, বেগুনি নেই */
const PALETTES = [
  ["#10b981", "#a7f3d0"], ["#06b6d4", "#a5f3fc"], ["#3b82f6", "#bfdbfe"],
  ["#14b8a6", "#99f6e4"], ["#22c55e", "#bbf7d0"], ["#0ea5e9", "#bae6fd"],
  ["#84cc16", "#d9f99d"], ["#0891b2", "#67e8f9"], ["#059669", "#6ee7b7"],
  ["#64748b", "#cbd5e1"]
];

/* id/বিভাগ থেকে একটি ছড়ানো সংখ্যা — কাছাকাছি id হলেও নকশা আলাদা হয় */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 997;
}

function imgFor(a) {
  if (a.img) return a.img;
  const seed = hashSeed(String(a.id) + "|" + String(a.cat));
  const [c1, c2] = PALETTES[seed % PALETTES.length];
  const step = 34 + (seed % 30), tilt = (seed % 50) - 25, cx = 480 + (seed % 260), cy = 120 + (seed % 200);
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<pattern id="p" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(${tilt})">
<path d="M0 0H${step}" stroke="#fff" stroke-opacity=".07" stroke-width="2"/></pattern></defs>
<rect width="800" height="500" fill="url(#g)"/><rect width="800" height="500" fill="url(#p)"/>
<circle cx="${cx}" cy="${cy}" r="${150 + (seed % 90)}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="26"/>
<circle cx="${cx}" cy="${cy}" r="${50 + (seed % 30)}" fill="#fff" fill-opacity=".1"/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ---------- সঠিক সময় -------------------------------------------------
   পাঠকের কম্পিউটার/ফোনের ঘড়ি ভুল থাকলেও তারিখ ঠিক দেখাতে সময় নেওয়া হয় সাইটের
   সার্ভার থেকে (প্রতিটি উত্তরের "Date" হেডার — হোস্টিং সার্ভারের ঘড়ি ইন্টারনেট টাইম
   সার্ভারের সঙ্গে মেলানো থাকে)। গুগল থেকে সরাসরি সময় পড়তে ব্রাউজার দেয় না, তাই এই পথ।
   তারিখ সবসময় বাংলাদেশ সময়ে (Asia/Dhaka) — কম্পিউটারের টাইম-জোন ভুল থাকলেও।     */
let clockSkew = 0;   /* সার্ভারের সময় − কম্পিউটারের সময় (মিলিসেকেন্ড) */
try { clockSkew = Number(sessionStorage.getItem("db-skew")) || 0; } catch (e) { /* স্টোরেজ বন্ধ */ }
const nowMs = () => Date.now() + clockSkew;

/* আজ বাংলাদেশে কোন তারিখ — Date হিসেবে (দিন/মাস/বছর/বার পড়ার জন্য) */
function dhakaToday() {
  const now = new Date(nowMs());
  try {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now).forEach(x => { p[x.type] = x.value; });
    return new Date(+p.year, p.month - 1, +p.day);
  } catch (e) { return now; }   /* খুব পুরোনো ব্রাউজার */
}

/* সার্ভারের ঘড়ির সঙ্গে মিলিয়ে নেওয়া — পেজ খোলার পর একবার; ভুল থাকলে তারিখ বদলে যায়।
   ফল এই ট্যাবে মনে থাকে, তাই পরের পাতায় প্রথম থেকেই ঠিক তারিখ আসে। */
function syncClock() {
  if (location.protocol === "file:") return;
  fetch(location.pathname, { method: "HEAD", cache: "no-store" }).then(r => {
    const t = Date.parse(r.headers.get("Date") || "");
    if (!t) return;
    clockSkew = t - Date.now();
    try { sessionStorage.setItem("db-skew", String(clockSkew)); } catch (e) { /* স্টোরেজ বন্ধ */ }
    $$(".js-today").forEach(el => { el.innerHTML = todayLine(); });
  }).catch(() => { /* অফলাইন — কম্পিউটারের ঘড়িই থাকে */ });
}

/* ---------- আজকের তারিখ (বাংলা) -------------------------------------- */
function bnToday(d = dhakaToday()) {
  const days = ["রোববার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];
  const months = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
  return `${days[d.getDay()]}, ${bnNum(d.getDate())} ${months[d.getMonth()]} ${bnNum(d.getFullYear())}`;
}

/* হেডারের তারিখ-লাইন: ইংরেজি মাসের তারিখ · বঙ্গাব্দ */
function todayLine() {
  const d = dhakaToday();
  return `<span>${bnToday(d)}</span><span class="dateline__bn">${bnBongabdo(d)}</span>`;
}

/* বঙ্গাব্দ — বাংলাদেশের সংশোধিত বাংলা পঞ্জিকা (২০১৯): ১ বৈশাখ = ১৪ এপ্রিল;
   বৈশাখ–আশ্বিন ৩১ দিন, কার্তিক–মাঘ ও চৈত্র ৩০ দিন, ফাল্গুন ২৯ দিন (অধিবর্ষে ৩০)।
   যেমন: "১৭ কার্তিক, ১৪৩৩ বঙ্গাব্দ" */
function bnBongabdo(d = dhakaToday()) {
  const months = ["বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন",
    "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র"];
  const day = (y, m, n) => Date.UTC(y, m, n) / 864e5;
  const today = day(d.getFullYear(), d.getMonth(), d.getDate());
  let y = d.getFullYear();
  if (today < day(y, 3, 14)) y--;               /* পহেলা বৈশাখের আগে — আগের বঙ্গাব্দ */
  const leap = (y + 1) % 4 === 0 && ((y + 1) % 100 !== 0 || (y + 1) % 400 === 0);
  const lens = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 30 : 29, 30];
  let rest = today - day(y, 3, 14), m = 0;
  while (rest >= lens[m]) rest -= lens[m++];
  return `${bnNum(rest + 1)} ${months[m]}, ${bnNum(y - 593)} বঙ্গাব্দ`;
}

/* ---------- আইকন ------------------------------------------------------ */
const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h11M4 18h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 01-2-2z"/><path d="M17 9h3v8a2 2 0 01-2 2"/><path d="M7 9h7M7 13h7M7 16h4"/></svg>',
  fb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3l-6.6 7.6L21.7 21h-6l-4.7-6.1L5.6 21h-3l7-8.1L2.6 3h6.2l4.3 5.6L17.5 3zm-1 16h1.6L7.6 4.7H5.9L16.5 19z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 2.9 2.9 0 00-.9 2.2 5 5 0 001 2.7 11.5 11.5 0 004.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.2-1.2c-.1-.2-.3-.3-.5-.4z"/></svg>',
  yt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12s0-3.2-.4-4.7a2.5 2.5 0 00-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.5a2.5 2.5 0 00-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.7c.2.9.9 1.6 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.5a2.5 2.5 0 001.8-1.8C22 15.2 22 12 22 12zM10 15V9l5.2 3L10 15z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  bold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h7a3.5 3.5 0 010 7H6zM6 11h8a3.5 3.5 0 010 7H6z"/></svg>',
  italic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 4h6M6 20h6M13 4l-4 16"/></svg>',
  underline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 4v6a6 6 0 0012 0V4M5 20h14"/></svg>',
  highlight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/></svg>',
  heading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 5v14M14 5v14M5 12h9M18 10l2-1v10"/></svg>',
  ms: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.4 2 2 6.1 2 11.6c0 2.9 1.2 5.4 3.1 7.1V22l2.9-1.6c1.2.3 2.6.5 4 .5 5.6 0 10-4.1 10-9.6S17.6 2 12 2zm1 12.9l-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.4 5.8z"/></svg>',
  tg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3l-3.1 14.7c-.2 1-.8 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L6.7 12.9 2 11.4c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z"/></svg>',
  li: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.5-2.2 3V21H9z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M12 18v-6M9 14.5l3-3 3 3"/></svg>',
  device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg>',
  dropper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l4 4M17 3.5a2.1 2.1 0 013 3L18.5 8l-3-3zM15.5 5L5 15.5V19h3.5L19 8.5"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 100 18c1.1 0 1.7-.9 1.7-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 005-5C21 6.1 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
  ul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
  ol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 5v3M4 8H3M4 12.5h1.5a.7.7 0 010 1.4H4M4 14v.5h1.5v.5H4v1h2"/></svg>',
  quote2: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7a4 4 0 00-4 4v6h6v-6H6a2 2 0 012-2V7zM17 7a4 4 0 00-4 4v6h6v-6h-3a2 2 0 012-2V7z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6M10 6l1-1a4 4 0 015.7 5.7l-1.4 1.4M14 18l-1 1A4 4 0 017.3 13.3l1.4-1.4"/></svg>',
  unlink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6M10 6l1-1a4 4 0 015.7 5.7l-1.4 1.4M14 18l-1 1A4 4 0 017.3 13.3l1.4-1.4M4 4l16 16"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a5 5 0 010 10H9M4 10l4-4M4 10l4 4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.5L22 9.3l-5.2 4.8L18.2 21 12 17.3 5.8 21l1.4-6.9L2 9.3l7.1-.8z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
  hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  quoteBig: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.6 6C6.5 7.3 4.5 9.9 4.5 13.4V18h5.6v-5.4H7.3c0-1.9 1.1-3.4 3.1-4.3zM19.1 6c-3.1 1.3-5.1 3.9-5.1 7.4V18h5.6v-5.4h-2.8c0-1.9 1.1-3.4 3.1-4.3z"/></svg>'
};

ICON.chevL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

/* ---------- হেডার: ডেটলাইন, নামফলক, দুই রেখার নেভ ---------------------- */
/* থিম বোতাম — ছোট আইকন, নিচে লেখা (লাইট/ডার্ক); initTheme() আইকন ও লেখা বসায় */
const themeBtn = () =>
  `<button class="themebtn js-theme" type="button"><span class="themebtn__icon"></span><span class="themebtn__label"></span></button>`;

/* লোগোর বদলে নামের প্রথম অক্ষর দিয়ে বানানো চিহ্ন (যুক্তাক্ষর/কার ঠিক রেখে) */
const brandMark = () => {
  let first = SITE.name.charAt(0);
  try { first = new Intl.Segmenter("bn", { granularity: "grapheme" }).segment(SITE.name)[Symbol.iterator]().next().value.segment; } catch (e) { /* পুরোনো ব্রাউজার */ }
  return `<span class="mark" aria-hidden="true">${esc(first)}</span>`;
};

const isHomePage = active => active === null && /\/(index\.html)?$/.test(location.pathname);

function buildHeader(active) {
  const home = isHomePage(active);
  const navLinks = CATEGORIES
    .map(c => `<a href="${topicLink(c.slug)}"${catAttr(c.slug)}${c.slug === active ? ' class="is-active" aria-current="page"' : ""}>${c.name}</a>`)
    .join("");
  const menuLinks = CATEGORIES.map(c =>
    `<a href="${topicLink(c.slug)}"${catAttr(c.slug)}${c.slug === active ? ' class="is-active"' : ""}>${c.name}</a>`).join("");

  return `
  <div class="mini" id="mini">
    <div class="wrap mini__in">
      <button class="iconbtn js-menu" type="button" aria-label="মেনু">${ICON.menu}</button>
      <a class="mini__name" href="${HOME}">${brandMark()}<span>${SITE.name}</span></a>
      <div class="mini__right">
        <button class="iconbtn js-search-toggle" type="button" aria-label="খুঁজুন">${ICON.search}</button>
        ${themeBtn()}
      </div>
    </div>
    <div class="progress" id="readProgress" aria-hidden="true"></div>
  </div>

  <header class="press">
    <div class="wrap">
      <div class="dateline">
        <span class="dateline__date">${ICON.cal}<span class="dateline__today js-today">${todayLine()}</span></span>
        <span class="dateline__mid">অনলাইন সংস্করণ</span>
        <span class="dateline__right">
          <button class="iconbtn js-search-toggle" type="button" aria-label="খুঁজুন">${ICON.search}</button>
          <button class="iconbtn js-menu" type="button" aria-label="সব বিভাগ">${ICON.menu}</button>
          ${themeBtn()}
        </span>
      </div>
      <div class="nameplate">
        <button class="iconbtn nameplate__tools js-menu" type="button" aria-label="মেনু">${ICON.menu}</button>
        <a class="nameplate__brand" href="${HOME}">
          ${brandMark()}
          <span class="nameplate__name">${SITE.name}</span>
        </a>
        <button class="iconbtn nameplate__tools js-search-toggle" type="button" aria-label="খুঁজুন">${ICON.search}</button>
      </div>
    </div>
    <nav class="mainnav" aria-label="বিভাগ">
      <div class="wrap mainnav__in" id="navLinks">
        <a href="${HOME}"${home ? ' class="is-active"' : ""}>প্রচ্ছদ</a>
        ${navLinks}
      </div>
    </nav>
    <div class="searchbar" id="searchbar">
      <div class="wrap">
        <form class="js-search" role="search">
          <input type="search" id="searchInput" placeholder="কী খুঁজছেন? লিখে এন্টার চাপুন..." aria-label="খবর খুঁজুন" enterkeyhint="search">
          <button class="btn btn--primary" type="submit">${ICON.search}<span>খুঁজুন</span></button>
        </form>
      </div>
    </div>
  </header>

  <div class="menu" id="menu" aria-hidden="true" role="dialog" aria-modal="true" aria-label="সব বিভাগ">
   <div class="menu__panel">
    <div class="wrap menu__top">
      <b>সব বিভাগ</b>
      <button class="iconbtn" type="button" data-close aria-label="বন্ধ করুন">${ICON.close}</button>
    </div>
    <div class="menu__body">
      <div class="wrap">
        <form class="js-search" role="search">
          <input type="search" placeholder="খবর খুঁজুন..." aria-label="খবর খুঁজুন" enterkeyhint="search">
          <button class="iconbtn" type="submit" aria-label="খুঁজুন">${ICON.search}</button>
        </form>
        <div class="menu__grid">
          <a href="${HOME}"${home ? ' class="is-active"' : ""}>প্রচ্ছদ</a>
          ${menuLinks}
          <a href="gallery.html">ফটো গ্যালারি</a>
          <a href="videos.html">ভিডিও গ্যালারি</a>
        </div>
        <div class="menu__foot">
          <span class="label label--ink">থিম</span>
          ${themeBtn()}
        </div>
      </div>
    </div>
   </div>
  </div>`;
}

/* ---------- ফুটার ----------------------------------------------------- */
/* শুধু যেগুলোর ঠিকানা data.js-এ দেওয়া আছে — খালি লিংকের আইকন দেখানো হয় না */
function socialLinks() {
  const items = [["facebook", "ফেসবুক", ICON.fb], ["x", "এক্স", ICON.x], ["youtube", "ইউটিউব", ICON.yt]]
    .filter(([key]) => /^https?:\/\//.test(SITE[key] || ""));
  if (!items.length) return "";
  return `<span class="footer__social">${items.map(([key, label, icon]) =>
    `<a href="${esc(SITE[key])}" target="_blank" rel="noopener" aria-label="${label}">${icon}</a>`).join("")}</span>`;
}

function buildFooter() {
  return `
  <footer class="footer">
    <div class="wrap">
      <a class="footer__name" href="${HOME}">${brandMark()}${SITE.name}</a>
      <nav class="footer__nav" aria-label="বিভাগ">
        ${CATEGORIES.map(c => `<a href="${topicLink(c.slug)}"${catAttr(c.slug)}>${c.name}</a>`).join("")}
      </nav>
      <div class="footer__line">
        <a href="mailto:${SITE.email}">${SITE.email}</a>
        ${socialLinks()}
      </div>
      <div class="footer__copy">
        <span>© ${bnNum(dhakaToday().getFullYear())} ${SITE.name} — সর্বস্বত্ব সংরক্ষিত।</span>
        <nav class="footer__pages" aria-label="সাইটের তথ্য">
          <a href="gallery.html">ফটো গ্যালারি</a>
          <a href="videos.html">ভিডিও গ্যালারি</a>
          <a href="about.html">আমাদের সম্পর্কে</a>
          <a href="contact.html">যোগাযোগ</a>
          <a href="privacy.html">গোপনীয়তা নীতি</a>
          <a href="terms.html">ব্যবহারের শর্তাবলি</a>
          <a href="advertise.html">বিজ্ঞাপন</a>
        </nav>
      </div>
    </div>
  </footer>
  <button class="totop" id="toTop" type="button" aria-label="উপরে যান">${ICON.up}<span>উপরে</span></button>`;
}

/* ---------- খবরের টেমপ্লেট --------------------------------------------
   কার্ড নয় — পত্রিকার মতো: শিরোনামই লিংক, কলাম রেখা দিয়ে আলাদা।        */
const whenOf = a => esc(a.time || timeAgo(a.createdAt));

/* প্রতিটি বিভাগের নিজস্ব রং — data-cat দেখে CSS রং বসায় (style.css-এর "বিভাগের রং") */
const catAttr = slug => slug ? ` data-cat="${esc(slug)}"` : "";

/* খবরের ট্যাগ — ক্রম: এক্সক্লুসিভ / অনুসন্ধান আগে, তারপর বিভাগ (ঢাকা, খুলনা...)।
   বিভাগ এক্সক্লুসিভ বা অনুসন্ধান হলে অঞ্চলের "প্রশাসনিক বিভাগ" থেকে বিভাগের ট্যাগ বসে। */
const catChip = slug => `<a class="label" href="${topicLink(slug)}"${catAttr(slug)}>${catName(slug)}</a>`;
function kickTags(a) {
  const tags = [];
  if (a.exclusive && a.cat !== "exclusive") tags.push(`<span class="label ex">${ICON.star}এক্সক্লুসিভ</span>`);
  tags.push(catChip(a.cat));
  if ((a.cat === "exclusive" || a.cat === "investigation") && a.division && CATEGORIES.some(c => c.slug === a.division)) {
    tags.push(catChip(a.division));
  }
  return tags.join("");
}

const kickFor = a => `<div class="st__kick">${kickTags(a)}</div>`;

/* ছবির ওপর কোনো লেখা/ট্যাগ বসে না — এক্সক্লুসিভ চিহ্ন শিরোনামের ওপরের ট্যাগেই থাকে */
const imgBlock = (a, eager) =>
  `<a class="st__img" href="${link(a)}" tabindex="-1" aria-hidden="true"><img src="${imgFor(a)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>`;

/* পড়ার সংখ্যা — সব ডিভাইস মিলিয়ে মোট কতবার খোলা হয়েছে */
const viewsText = n => `${bnNum(n || 0)} ভিউ`;

const metaFor = (a, withRead = true) =>
  `<div class="st__meta"><span>${whenOf(a)}</span>${withRead ? `<span>${bnNum(a.read || 1)} মিনিটের পাঠ</span>` : ""}${
    a.views ? `<span>${viewsText(a.views)}</span>` : ""}</div>`;

/* size: xl | lg | md | sm ; img: ছবি দেখাবে কি না ; dek: সারাংশ দেখাবে কি না */
function story(a, { size = "md", img = true, dek = false, eager = false, center = false, cls = "" } = {}) {
  return `<article class="st st--${size}${center ? " st--center" : ""} ${cls}">
    ${img ? imgBlock(a, eager) : ""}
    ${kickFor(a)}
    <h3 class="st__h"><a href="${link(a)}">${esc(a.title)}</a></h3>
    ${dek && a.excerpt ? `<p class="st__dek">${esc(a.excerpt)}</p>` : ""}
    ${metaFor(a, size !== "sm")}
  </article>`;
}

/* আনুভূমিক ফিচার — বাঁয়ে ছবি, ডানে বড় শিরোনাম ও সারাংশ */
function feature(a, eager = false) {
  return `<article class="ft">
    ${imgBlock(a, eager)}
    <div class="ft__text">
      ${kickFor(a)}
      <h3 class="st__h" style="font-size:clamp(1.4rem,2.4vw,1.95rem);font-weight:800;line-height:1.25"><a href="${link(a)}">${esc(a.title)}</a></h3>
      ${a.excerpt ? `<p class="st__dek">${esc(a.excerpt)}</p>` : ""}
      ${metaFor(a)}
    </div>
  </article>`;
}

/* টেক্সট-শুধু ব্রিফ (সময় + শিরোনাম) */
const brief = a => `<a class="br" href="${link(a)}"><time>${whenOf(a)}</time><span>${esc(a.title)}</span></a>`;

/* আর্কাইভ সারি — বিভাগ/সার্চ পেজের নিচের তালিকা */
function indexRow(a) {
  const d = a.createdAt ? new Date(a.createdAt) : null;
  const months = ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
  return `<div class="ix">
    <div class="ix__when">${d ? `<b>${bnNum(d.getDate())}</b>${months[d.getMonth()]} ${bnNum(d.getFullYear())}` : whenOf(a)}</div>
    <div class="st">
      ${kickFor(a)}
      <h3 class="st__h"><a href="${link(a)}">${esc(a.title)}</a></h3>
      ${a.excerpt ? `<p class="st__dek">${esc(a.excerpt)}</p>` : ""}
      ${metaFor(a)}
    </div>
    ${imgBlock(a, false)}
  </div>`;
}

/* ভিডিও গ্যালারির কার্ড — থাম্বনেইল (না থাকলে রঙিন পটভূমি), প্লে চিহ্ন */
function videoCard(v) {
  const th = videoThumb(v), href = `videos.html?id=${v.id}`;
  return `<article class="st vd" data-vid="${v.id}">
    <a class="st__img gthumb" href="${href}">${th ? `<img src="${esc(th)}" alt="" loading="lazy" decoding="async">` : ""}
      <span class="vd__play"><span>${ICON.play}</span>${v.video.kind === "youtube" ? "YouTube" : "Facebook"}</span></a>
    <h3 class="st__h"><a href="${href}">${esc(v.title)}</a></h3>
    <div class="st__meta"><span>${timeAgo(v.createdAt)}</span></div>
  </article>`;
}

/* ফটো অ্যালবামের কার্ড — প্রচ্ছদ ছবি, ছবির সংখ্যা */
function albumCard(a) {
  const href = `gallery.html?id=${a.id}`;
  return `<article class="st ph" data-album="${a.id}">
    <a class="st__img gthumb" href="${href}"><img src="${esc(a.photos[0])}" alt="" loading="lazy" decoding="async">
      <span class="ph__count">${ICON.image}${bnNum(a.photos.length)}</span></a>
    <h3 class="st__h"><a href="${href}">${esc(a.title)}</a></h3>
    <div class="st__meta"><span>${timeAgo(a.createdAt)}</span></div>
  </article>`;
}

function opinionCard(a) {
  const who = String(a.author || "নিজস্ব প্রতিবেদক").trim();
  return `<article class="op">
    <span class="op__face" aria-hidden="true">${esc(who.charAt(0))}</span>
    <div class="st">
      <div class="op__who">${esc(who)}</div>
      <h3 class="st__h"><a href="${link(a)}">${esc(a.title)}</a></h3>
      ${a.excerpt ? `<p class="st__dek">${esc(a.excerpt)}</p>` : ""}
    </div>
  </article>`;
}

/* "সাম্প্রতিক খবর" — ১, ২, ৩… নম্বর দেওয়া শিরোনামের তালিকা (বিভাগের পাতার পাশে) */
function recentList(list, n = 6, title = "সাম্প্রতিক খবর") {
  const items = list.slice(0, n);
  if (!items.length) return "";
  return `<span class="label">${title}</span><ol class="rl">${items.map((a, i) => `
    <li${catAttr(a.cat)}><a class="rl__item" href="${link(a)}">
      <span class="rl__num" aria-hidden="true">${bnNum(i + 1)}</span>
      <span><span class="rl__title">${esc(a.title)}</span>
        <span class="rl__meta">${catName(a.cat)} · ${whenOf(a)}${a.views ? ` · ${viewsText(a.views)}` : ""}</span></span>
    </a></li>`).join("")}</ol>`;
}

/* আলোচিত বিষয় — স্ল্যাশ দিয়ে আলাদা শব্দের সারি */
function topicsStrip() {
  const tags = liveTags();
  if (!tags.length) return "";
  return `<div class="topics"><span class="label">আলোচিত</span>${tags.map(t =>
    `<a href="category.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>`;
}

function emptyBox(title, text, withHome = false) {
  return `<div class="empty">
    <h3>${title}</h3><p>${text}</p>
    ${withHome ? `<p style="margin-top:22px;font-style:normal"><a class="btn btn--primary" href="${HOME}">প্রচ্ছদে ফিরুন</a></p>` : ""}
  </div>`;
}

function deskHead(title, moreHref, moreText = "সব খবর") {
  return `<div class="desk"><h2>${title}</h2>
    ${moreHref ? `<a class="desk__more" href="${moreHref}">${moreText}${ICON.arrow}</a>` : ""}</div>`;
}

/* ---------- থিম এডিটর (Chrome-এর মতো) ----------------------------------
   লাইট / ডার্ক / ডিভাইস, আর সাইটের রং বাছাই (তৈরি রং বা নিজের পছন্দের রং)।
   পছন্দ শুধু এই পাঠকের ব্রাউজারে থাকে: db-theme = light|dark (না থাকলে ডিভাইস),
   db-accent = বাছাই করা রং, db-accent-css = সেই রং থেকে বানানো CSS — পেজের
   <head>-এর ছোট স্ক্রিপ্ট এটি আগেই বসিয়ে দেয়, তাই পেজ খুলতেই ঠিক রং দেখায়।  */
const THEME_COLORS = [
  { name: "Green (default)", hex: "" },          /* সাইটের নিজস্ব সবুজ-সায়ান */
  { name: "Teal",   hex: "#0d9488" },
  { name: "Cyan",   hex: "#0891b2" },
  { name: "Sky",    hex: "#0284c7" },
  { name: "Blue",   hex: "#2563eb" },
  { name: "Navy",   hex: "#1e40af" },
  { name: "Slate",  hex: "#475569" },
  { name: "Grey",   hex: "#52525b" },
  { name: "Sage",   hex: "#4d7c6f" },
  { name: "Forest", hex: "#15803d" },
  { name: "Lime",   hex: "#4d8c0a" }
];

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60 + 360) % 360;
  }
  return [h, Math.round(s * 100), Math.round(l * 100)];
}

/* একটি রং থেকে দুই থিমের সব দরকারি রং — লেখা পড়ার মতো গাঢ়/উজ্জ্বলতা ঠিক রেখে */
function accentCss(hex) {
  const [h, s0, l0] = hexToHsl(hex);
  const s = Math.min(s0, 90), h2 = (h + 340) % 360;   /* দ্বিতীয় রং সায়ানের দিকে — বেগুনির দিকে নয় */
  const c = (hh, ss, ll) => `hsl(${hh} ${ss}% ${ll}%)`;
  const L = Math.min(Math.max(l0, 28), 40);
  return `html[data-accent]{--accent:${c(h, s, L)};--accent-soft:${c(h, Math.min(s, 70), 93)};--on-accent:#fff;` +
    `--tint:${c(h, Math.min(s, 60), 96)};--teal:${c(h2, s, L + 2)};--teal-soft:${c(h2, Math.min(s, 70), 96)};--gold:${c(h2, s, L + 2)}}` +
    `html[data-accent][data-theme="dark"]{--accent:${c(h, Math.min(s, 75), 62)};--accent-soft:${c(h, Math.min(s, 40), 16)};` +
    `--on-accent:${c(h, 60, 8)};--tint:${c(h, 20, 13)};--teal:${c(h2, Math.min(s, 75), 60)};--teal-soft:${c(h2, Math.min(s, 40), 14)};--gold:${c(h2, Math.min(s, 75), 60)}}`;
}

function applyAccent(hex) {
  const root = document.documentElement;
  let tag = document.getElementById("accentVars");
  if (!hex) {
    if (tag) tag.remove();
    root.removeAttribute("data-accent");
    safeStore.del("db-accent"); safeStore.del("db-accent-css");
    return;
  }
  const css = accentCss(hex);
  if (!tag) { tag = document.createElement("style"); tag.id = "accentVars"; document.head.appendChild(tag); }
  tag.textContent = css;
  root.setAttribute("data-accent", "");
  safeStore.set("db-accent", hex); safeStore.set("db-accent-css", css);
}

/* রঙের গোল নমুনা — Chrome-এর মতো: ওপরে মূল রং, নিচে বাঁয়ে হালকা, ডানে মাঝারি */
function swatchStyle(hex) {
  if (!hex) return "--s1:#059669;--s2:#d1fae5;--s3:#0891b2";
  const [h, s0, l0] = hexToHsl(hex), s = Math.min(s0, 90);
  return `--s1:hsl(${h} ${s}% ${Math.min(Math.max(l0, 28), 40)}%);--s2:hsl(${h} ${Math.min(s, 70)}% 85%);--s3:hsl(${(h + 340) % 360} ${Math.min(s, 40)}% 55%)`;
}

function buildThemePanel() {
  const saved = (safeStore.get("db-accent") || "").toLowerCase();
  const known = THEME_COLORS.some(t => t.hex === saved);
  const tile = t => `<button type="button" class="tsw${t.hex === saved ? " is-on" : ""}" data-hex="${t.hex}" style="${swatchStyle(t.hex)}" aria-label="${t.name}" title="${t.name}"><span class="tsw__dot"></span></button>`;
  const panel = document.createElement("div");
  panel.className = "tpanel";
  panel.id = "themePanel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "থিম ও রং");
  panel.innerHTML = `
    <div class="tpanel__head"><b>থিম ও রং</b><button type="button" class="iconbtn" data-tclose aria-label="বন্ধ করুন">${ICON.close}</button></div>
    <div class="tmode" role="radiogroup" aria-label="আলো">
      <button type="button" data-mode="light" role="radio">${ICON.sun}<span>লাইট</span></button>
      <button type="button" data-mode="dark" role="radio">${ICON.moon}<span>ডার্ক</span></button>
      <button type="button" data-mode="device" role="radio">${ICON.device}<span>ডিভাইস</span></button>
    </div>
    <div class="tgrid">
      ${THEME_COLORS.map(tile).join("")}
      <label class="tsw tsw--custom${saved && !known ? " is-on" : ""}" title="নিজের রং বাছাই"${saved && !known ? ` style="${swatchStyle(saved)}"` : ""}>
        ${ICON.dropper}<input type="color" value="${saved && !known ? saved : "#059669"}" aria-label="নিজের রং বাছাই">
      </label>
    </div>`;
  document.body.appendChild(panel);
  return panel;
}

function initTheme() {
  const mql = matchMedia("(prefers-color-scheme: dark)");
  const modeNow = () => safeStore.get("db-theme") || "device";
  function apply() {
    const pick = safeStore.get("db-theme");
    const mode = pick || (mql.matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", mode);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = mode === "dark" ? "#0f1115" : "#ffffff";
    $$("#themePanel [data-mode]").forEach(b => {
      const on = b.dataset.mode === modeNow();
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  $$(".js-theme").forEach(b => {
    $(".themebtn__icon", b).innerHTML = ICON.palette;
    $(".themebtn__label", b).textContent = "থিম";
    b.setAttribute("aria-label", "থিম ও রং বদলান");
    b.setAttribute("aria-haspopup", "dialog");
  });

  const panel = buildThemePanel();
  apply();

  const close = () => { panel.hidden = true; };
  $$(".js-theme").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  }));
  panel.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", close);
  addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  $("[data-tclose]", panel).addEventListener("click", close);

  /* লাইট / ডার্ক / ডিভাইস */
  $$("[data-mode]", panel).forEach(b => b.addEventListener("click", () => {
    if (b.dataset.mode === "device") safeStore.del("db-theme");
    else safeStore.set("db-theme", b.dataset.mode);
    apply();
  }));

  /* রং */
  const mark = el => { $$(".tsw", panel).forEach(t => t.classList.toggle("is-on", t === el)); };
  $$(".tsw[data-hex]", panel).forEach(t => t.addEventListener("click", () => { applyAccent(t.dataset.hex); mark(t); }));
  const custom = $(".tsw--custom", panel), picker = $("input", custom);
  picker.addEventListener("input", () => {
    applyAccent(picker.value);
    custom.setAttribute("style", swatchStyle(picker.value));
    mark(custom);
  });

  /* "ডিভাইস" বাছা থাকলে অপারেটিং সিস্টেমের থিম বদলালে সাথে বদলায় */
  mql.addEventListener?.("change", () => { if (!safeStore.get("db-theme")) apply(); });
}

function initNav() {
  /* পূর্ণ পর্দার মেনু */
  const menu = $("#menu");
  let lastFocus = null;
  const openMenu = () => {
    lastFocus = document.activeElement;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    setTimeout(() => $("input", menu).focus({ preventScroll: true }), 80);
  };
  const closeMenu = () => {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  $$(".js-menu").forEach(b => b.addEventListener("click", openMenu));
  $$("[data-close]", menu).forEach(b => b.addEventListener("click", closeMenu));
  menu.addEventListener("click", e => { if (e.target === menu) closeMenu(); });   // প্যানেলের বাইরে চাপলে বন্ধ
  addEventListener("keydown", e => { if (e.key === "Escape" && menu.classList.contains("is-open")) closeMenu(); });

  /* নেভের নিচে সার্চ বার — ছোট হেডার থেকে খুললে ওপরে স্ক্রল করে যায় */
  const bar = $("#searchbar");
  $$(".js-search-toggle").forEach(b => b.addEventListener("click", () => {
    const open = !bar.classList.contains("is-open") || b.closest(".mini");
    bar.classList.toggle("is-open", open);
    if (open) {
      if (b.closest(".mini")) scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => $("#searchInput").focus({ preventScroll: true }), 60);
    }
  }));

  /* সক্রিয় বিভাগটি ছোট পর্দায় স্ক্রল করে দৃশ্যমান রাখা */
  const links = $("#navLinks"), act = links && $(".is-active", links);
  if (act && links.scrollWidth > links.clientWidth) {
    links.scrollLeft = act.offsetLeft - links.clientWidth / 2 + act.offsetWidth / 2;
  }

  /* নামফলক পেরিয়ে গেলে ওপরে ছোট হেডার */
  const mini = $("#mini"), nav = $(".mainnav");
  if (mini && nav) {
    const check = () => mini.classList.toggle("is-on", nav.getBoundingClientRect().bottom < 0);
    addEventListener("scroll", check, { passive: true });
    check();
  }
}

function initSearch() {
  $$(".js-search").forEach(form => form.addEventListener("submit", e => {
    e.preventDefault();
    const input = $("input", form);
    const q = input.value.trim();
    if (q) location.href = `category.html?q=${encodeURIComponent(q)}`;
    else input.focus();
  }));
}

function initToTop() {
  const b = $("#toTop");
  if (!b) return;
  addEventListener("scroll", () => b.classList.toggle("is-on", scrollY > 900), { passive: true });
  b.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
}

/* পেছনে সার্ভার থেকে নতুন তালিকা এলে পেজ নিজে থেকে আবার আঁকে */
function watchPosts(renderFn) {
  onPostsChanged(() => { refreshPosts(); renderFn(); });
}

/* পেজ বদলের গতি: Chrome/Edge-এ লিংকের ওপর মাউস নিলে পরের পেজ আগেই তৈরি হয়
   (prerender)। যে ব্রাউজার এটি জানে না সেখানে কিছুই ঘটে না। অ্যাডমিনে চালু হয় না। */
const onAdminPage = () => /\/admin(71)?(\.html)?\/?$/.test(location.pathname);

function enableInstantNav() {
  if (onAdminPage()) return;
  if (!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules"))) return;
  const s = document.createElement("script");
  s.type = "speculationrules";
  /* সব লিংকের HTML আগেভাগে নামিয়ে রাখা (হালকা), আর মাউস রাখলে/চাপ দিলে পুরো পেজ
     আগেই তৈরি — ক্লিকের পর পরের পেজ ০.৩–০.৫ সেকেন্ডের মধ্যে খোলে */
  const where = { and: [{ href_matches: "/*" }, { not: { selector_matches: "[href*='admin']" } }] };
  s.textContent = JSON.stringify({
    prefetch:  [{ where, eagerness: "eager" }],
    prerender: [{ where, eagerness: "moderate" }]
  });
  document.head.appendChild(s);
}

/* পেজ প্রস্তুত */
function mountShell(activeCat) {
  refreshPosts();
  const h = $("#siteHeader"), f = $("#siteFooter");
  if (h) h.innerHTML = buildHeader(activeCat);
  if (f) f.innerHTML = buildFooter();
  /* যে তথ্য-পাতায় আছি, ফুটারে তার লিংকের নিচে দাগ থাকে */
  const here = location.pathname.split("/").pop();
  $$(".footer__pages a").forEach(a => { if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page"); });
  initTheme(); initNav(); initSearch(); initToTop(); syncClock();
  enableInstantNav();

  /* লোকাল মোডে (PHP সার্ভার নেই) সতর্ক করা — অ্যাডমিন পাতায় সবসময়, অন্য পাতায়
     শুধু লগইন করা অ্যাডমিনকে; সাধারণ পাঠক এটি দেখেন না */
  if (h && storeMode() === "local" && (onAdminPage() || isAdmin())) {
    $(".mainnav", h).insertAdjacentHTML("afterend", `
      <div class="localbar"><div class="wrap">
        <span><strong>লোকাল মোড:</strong> এই খবরগুলো শুধু এই ব্রাউজারে আছে — মোবাইল বা অন্য ডিভাইসে দেখা যাবে না।</span>
        <button type="button" aria-expanded="false" aria-controls="localHelp">কীভাবে ঠিক করবেন</button>
      </div>
      <div class="wrap localbar__help" id="localHelp" hidden>
        ${storeReason() ? `<p>কারণ: ${esc(storeReason())}</p>` : ""}
        <ol>
          <li>এই পিসিতে: VS Code-এ <code>Ctrl+Shift+B</code> চাপুন — সাইটের নিজস্ব সার্ভার চালু হয়ে ব্রাউজারে খুলবে। সেখানে পোস্ট করলে সব ডিভাইসে দেখা যাবে।</li>
          <li>আসল সাইটে: পুরো ফোল্ডার PHP চালু থাকা হোস্টিংয়ে আপলোড করুন; <code>data/</code> ও <code>uploads/</code> ফোল্ডারে লেখার অনুমতি দিন।</li>
        </ol>
      </div></div>`);
    const tog = $(".localbar button", h), help = $("#localHelp", h);
    tog.addEventListener("click", () => {
      help.hidden = !help.hidden;
      tog.setAttribute("aria-expanded", String(!help.hidden));
    });
  }
}
