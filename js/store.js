/* =====================================================================
   পোস্ট স্টোর
   ---------------------------------------------------------------------
   দুইভাবে কাজ করে, নিজে থেকেই ঠিক করে নেয় কোনটি ব্যবহার করবে:

   ১) সার্ভার মোড  — হোস্টিংয়ে api/posts.php থাকলে পোস্ট সার্ভারে জমা হয়।
      পোস্ট স্থায়ী, সব ভিজিটর দেখতে পায়, কেউ ব্রাউজার ডেটা মুছলেও থাকে।

   ২) লোকাল মোড   — শুধু ফাইল থেকে খুললে বা PHP না থাকলে। পোস্ট ওই
      ব্রাউজারেই জমা থাকে (ডেমো দেখানোর জন্য)।

   অ্যাডমিন প্যানেলে কোন মোড চলছে তা দেখানো হয়।
   ===================================================================== */

const API_URL   = "api/posts.php";
const LOCAL_KEY = "db-posts";
const TOKEN_KEY = "db-token";
const AUTH_KEY  = "db-admin";

let STORE_MODE = "local";   // "server" | "local"
let STORE_REASON = "";      // লোকাল মোডে কেন — অ্যাডমিন প্যানেলে দেখানো হয়
let CACHE = [];             // পাবলিক তালিকা — শুধু প্রকাশিত (draft বাদে)
let ADMIN_CACHE = [];       // অ্যাডমিনের "ম্যানেজ" তালিকা — draft + প্রকাশিত সবই

/* ---------- নিরাপদ localStorage (file:// থেকে খুললে বন্ধ থাকতে পারে) --- */
const safeStore = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* উপেক্ষা */ } }
};

/* ---------- লোকাল স্টোরেজ --------------------------------------------- */
function loadLocal() {
  try {
    const list = JSON.parse(safeStore.get(LOCAL_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function saveLocal(list) {
  if (!safeStore.set(LOCAL_KEY, JSON.stringify(list)))
    throw new Error("সংরক্ষণ করা যায়নি — ব্রাউজারের জায়গা ফুরিয়ে গেছে। কিছু পুরোনো পোস্ট মুছে আবার চেষ্টা করুন।");
}

/* ---------- সার্ভার কল ------------------------------------------------- */
async function apiSend(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* JSON নয় */ }
  if (!data) throw new Error("সার্ভার থেকে সাড়া পাওয়া যায়নি।");
  if (!data.ok) throw new Error(data.error || "কাজটি সম্পন্ন হয়নি।");
  return data;
}

/* ---------- খবরের তালিকার দ্রুত কপি (শুধু সার্ভার মোডে) -----------------
   আগের বার সার্ভার থেকে পাওয়া প্রকাশিত খবর ব্রাউজারে রাখা থাকে। পরের
   পেজ খোলার সময় সেটি দিয়ে সঙ্গে সঙ্গে পেজ আঁকা হয় (সার্ভারের উত্তরের
   জন্য অপেক্ষা না করে), আর পেছনে সার্ভার থেকে নতুন তালিকা এনে মিলিয়ে
   দেখা হয় — বদলে থাকলে পেজ নিজে থেকে হালনাগাদ হয়।                    */
const SAVED_KEY = "db-cache";
const POSTS_LISTENERS = [];
const onPostsChanged = fn => { POSTS_LISTENERS.push(fn); };

function readSaved() {
  try {
    const o = JSON.parse(safeStore.get(SAVED_KEY) || "null");
    return o && Array.isArray(o.posts) ? o.posts : null;
  } catch (e) { return null; }
}

function writeSaved() {
  if (STORE_MODE !== "server") return;
  if (!safeStore.set(SAVED_KEY, JSON.stringify({ t: Date.now(), posts: CACHE }))) safeStore.del(SAVED_KEY);
}

/* সার্ভার থেকে প্রকাশিত খবরের তালিকা আনা — কখনো throw করে না।
   পেজের <head>-এ ইনলাইন স্ক্রিপ্ট আগেই অনুরোধটি শুরু করে রাখলে (window.__postsReq)
   সেটিই ব্যবহার হয়, ফলে JS ডাউনলোডের সঙ্গে সমান্তরালে চলে।                  */
function requestPosts() {
  const started = window.__postsReq;
  window.__postsReq = null;
  const req = started || fetch(API_URL, { cache: "no-cache", headers: { Accept: "application/json" } });
  return req
    .then(async res => {
      if (!res.ok) {
        return { reason: `api/posts.php সাড়া দিয়েছে ${res.status} কোড দিয়ে। ` +
          (res.status === 404
            ? "ফাইলটি আপলোড হয়নি — api ফোল্ডারটি সার্ভারে আছে কি না দেখুন।"
            : "হোস্টিং সাপোর্টকে জানান।") };
      }
      let data = null;
      try { data = await res.json(); }
      catch (e) {
        return { reason: "api/posts.php পাওয়া গেছে, কিন্তু PHP হিসেবে চলছে না — " +
                         "হোস্টিংয়ে PHP চালু আছে কি না দেখুন।" };
      }
      if (data && data.ok && Array.isArray(data.posts)) return { posts: data.posts };
      return { reason: (data && data.error) || "সার্ভার থেকে খবর আনা যায়নি।" };
    })
    .catch(e => ({ reason: "api/posts.php-এ পৌঁছানো যায়নি (" + (e.message || "সংযোগ ব্যর্থ") + ")।" }));
}

/* ---------- শুরুতে একবার: কোন মোড, এবং খবরগুলো আনা -------------------
   opts.fresh = true হলে সংরক্ষিত কপি ব্যবহার না করে সার্ভার থেকেই আনা হয়
   (অ্যাডমিন প্যানেল এভাবে চলে, যাতে মোড/তালিকা সবসময় সঠিক থাকে)।         */
async function initStore(opts) {
  if (location.protocol === "file:") {
    STORE_REASON = "সাইটটি ফাইল থেকে খোলা হয়েছে (file://), কোনো সার্ভার নেই। " +
                   "অন্য ডিভাইসে দেখাতে হলে সাইটটি হোস্টিংয়ে আপলোড করতে হবে।";
  } else {
    const saved = opts && opts.fresh ? null : readSaved();
    const req = requestPosts();   // টোকেন ছাড়া — draft বাদে শুধু প্রকাশিত খবর ফেরত আসে

    if (saved) {
      STORE_MODE = "server";
      STORE_REASON = "";
      CACHE = saved;
      req.then(out => {
        if (!out.posts) return;                                   // নেটওয়ার্ক সমস্যা — আগের কপিই থাকুক
        if (JSON.stringify(out.posts) === JSON.stringify(CACHE)) return;   // কিছু বদলায়নি
        CACHE = out.posts;
        writeSaved();
        POSTS_LISTENERS.forEach(fn => fn());
      });
      return STORE_MODE;
    }

    const out = await req;
    if (out.posts) {
      STORE_MODE = "server";
      STORE_REASON = "";
      CACHE = out.posts;
      writeSaved();
      return STORE_MODE;
    }
    STORE_REASON = out.reason;
  }

  STORE_MODE = "local";
  CACHE = loadLocal();
  return STORE_MODE;
}

const storeMode   = () => STORE_MODE;
const storeReason = () => STORE_REASON;

/* ---------- সব খবর: সংরক্ষিত পোস্ট + data.js-এর স্থায়ী খবর ------------
   পাবলিক পেজে (index/category/article) সবসময় শুধু প্রকাশিত খবর দেখানো
   হয় — status:"draft" থাকা পোস্ট এখানে কখনো আসে না।                   */
function getPosts() {
  return [...CACHE, ...ARTICLES]
    .filter(p => p.status !== "draft")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/* অ্যাডমিন প্যানেলের "ম্যানেজ" তালিকা — draft + প্রকাশিত সবই, শুধু
   লগইন করা থাকলে কাজ করে। loadManaged() আগে একবার কল করতে হয়।       */
const managedPosts = () =>
  (STORE_MODE === "server" ? ADMIN_CACHE : CACHE).slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

/* draft-সহ সব পোস্ট আনা — শুধু অ্যাডমিন প্যানেল থেকে ডাকা হয় */
async function loadManaged() {
  if (STORE_MODE === "server") {
    const token = safeStore.get(TOKEN_KEY) || "";
    const res = await fetch(`${API_URL}?t=${Date.now()}&token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } });
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.posts)) ADMIN_CACHE = data.posts;
  }
  // লোকাল মোডে CACHE-এ এমনিতেই সব আছে (draft-সহ), আলাদা কিছু করার নেই
  return managedPosts();
}

/* ---------- পোস্ট যোগ, মুছে ফেলা, প্রকাশ করা ---------------------------- */
async function createPost(post) {
  if (STORE_MODE === "server") {
    const data = await apiSend({ action: "create", token: safeStore.get(TOKEN_KEY), post });
    if (data.post.status !== "draft") CACHE.unshift(data.post);
    ADMIN_CACHE.unshift(data.post);
    writeSaved();
    return data.post;
  }
  const list = loadLocal();
  list.unshift(post);
  saveLocal(list);
  CACHE = list;
  return post;
}

/* বিদ্যমান পোস্ট সম্পাদনা (এডিট) — id ও createdAt অপরিবর্তিত থাকে */
async function updatePost(id, post) {
  if (STORE_MODE === "server") {
    const data = await apiSend({ action: "update", token: safeStore.get(TOKEN_KEY), id: String(id), post });
    CACHE = CACHE.filter(p => String(p.id) !== String(id));
    if (data.post.status !== "draft") CACHE.unshift(data.post);
    writeSaved();
    return data.post;
  }
  const list = loadLocal();
  const i = list.findIndex(p => String(p.id) === String(id));
  if (i === -1) throw new Error("খবরটি পাওয়া যায়নি।");
  const merged = { ...post, id: String(id), createdAt: list[i].createdAt, updatedAt: Date.now() };
  list[i] = merged;
  saveLocal(list);
  CACHE = list;
  return merged;
}

async function removePost(id) {
  if (STORE_MODE === "server") {
    await apiSend({ action: "delete", token: safeStore.get(TOKEN_KEY), id: String(id) });
    CACHE = CACHE.filter(p => String(p.id) !== String(id));
    ADMIN_CACHE = ADMIN_CACHE.filter(p => String(p.id) !== String(id));
    writeSaved();
    return;
  }
  const list = loadLocal().filter(p => String(p.id) !== String(id));
  saveLocal(list);
  CACHE = list;
}

/* খসড়া (draft) থেকে প্রকাশিত করা */
async function publishPost(id) {
  if (STORE_MODE === "server") {
    await apiSend({ action: "publish", token: safeStore.get(TOKEN_KEY), id: String(id) });
    const p = ADMIN_CACHE.find(x => String(x.id) === String(id));
    if (p) {
      p.status = "published";
      if (!CACHE.some(x => String(x.id) === String(id))) CACHE.unshift(p);
    }
    writeSaved();
    return;
  }
  const list = loadLocal();
  const p = list.find(x => String(x.id) === String(id));
  if (p) p.status = "published";
  saveLocal(list);
  CACHE = list;
}

/* ---------- গ্যালারি (ফটো অ্যালবাম ও ভিডিও) ------------------------------
   সার্ভারে data/gallery.json; লোকাল মোডে এই ব্রাউজারে (ছবি data URL হিসেবে)।
   অ্যালবাম: { id, type:"photo", title, caption, photos:[...], createdAt }
   ভিডিও:    { id, type:"video", title, caption, video:{kind,id|url}, thumb, createdAt } */
const GALLERY_KEY = "db-gallery";
const loadLocalGallery = () => { try { return JSON.parse(safeStore.get(GALLERY_KEY) || "[]"); } catch (e) { return []; } };
function saveLocalGallery(list) {
  if (!safeStore.set(GALLERY_KEY, JSON.stringify(list)))
    throw new Error("ব্রাউজারের জায়গা ফুরিয়েছে — লোকাল মোডে বেশি ছবি রাখা যায় না।");
}

async function fetchGallery() {
  if (STORE_MODE !== "server") return loadLocalGallery();
  try {
    const res = await fetch(`${API_URL}?gallery=1`, { cache: "no-cache", headers: { Accept: "application/json" } });
    const data = await res.json();
    return data && data.ok && Array.isArray(data.items) ? data.items : [];
  } catch (e) { return []; }
}

/* লোকাল মোডে ভিডিও লিংক চেনা — সার্ভারের parse_video()-এর মতো */
function parseVideoLink(url) {
  url = String(url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  if (yt) return { kind: "youtube", id: yt[1] };
  try { if (/(^|\.)(facebook\.com|fb\.watch)$/i.test(new URL(url).hostname)) return { kind: "facebook", url }; } catch (e) { /* ভুল লিংক */ }
  return null;
}

/* item: { type, title, caption, img (প্রথম ছবি) | url, thumb } */
async function addGalleryItem(item) {
  if (STORE_MODE === "server") {
    return (await apiSend({ action: "gallery_add", token: safeStore.get(TOKEN_KEY), item })).item;
  }
  const id = String(Date.now());
  const it = { id, type: item.type === "video" ? "video" : "photo", title: item.title, caption: item.caption || "", createdAt: Date.now() };
  if (it.type === "photo") it.photos = [item.img];
  else {
    it.video = parseVideoLink(item.url);
    if (!it.video) throw new Error("শুধু YouTube বা Facebook ভিডিওর লিংক দেওয়া যাবে।");
    it.thumb = item.thumb || "";
  }
  const list = loadLocalGallery();
  list.unshift(it);
  saveLocalGallery(list);
  return it;
}

async function addGalleryPhoto(id, img) {
  if (STORE_MODE === "server") {
    return (await apiSend({ action: "gallery_photo", token: safeStore.get(TOKEN_KEY), id: String(id), img })).item;
  }
  const list = loadLocalGallery();
  const it = list.find(x => String(x.id) === String(id));
  if (!it) throw new Error("অ্যালবামটি পাওয়া যায়নি।");
  it.photos.push(img);
  saveLocalGallery(list);
  return it;
}

async function deleteGalleryItem(id) {
  if (STORE_MODE === "server") {
    await apiSend({ action: "gallery_delete", token: safeStore.get(TOKEN_KEY), id: String(id) });
    return;
  }
  saveLocalGallery(loadLocalGallery().filter(x => String(x.id) !== String(id)));
}

/* ভিডিওর ছবি ও চালানোর ঠিকানা */
const videoThumb = v => v.thumb || (v.video && v.video.kind === "youtube" ? `https://i.ytimg.com/vi/${v.video.id}/hqdefault.jpg` : "");
const videoEmbed = v => v.video.kind === "youtube"
  ? `https://www.youtube-nocookie.com/embed/${v.video.id}?autoplay=1&rel=0`
  : `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.video.url)}&show_text=false&autoplay=true`;

/* ---------- খবর পড়া হলো: পড়ার সংখ্যা ১ বাড়ানো --------------------------
   সার্ভার মোডে সব ডিভাইস মিলিয়ে একটাই মোট সংখ্যা; লোকাল মোডে শুধু এই ব্রাউজারে।
   ফেরত: নতুন মোট সংখ্যা (না পারলে null)।                                  */
async function recordView(id) {
  const bump = n => {
    const p = CACHE.find(x => String(x.id) === String(id));
    if (p) p.views = n;
    return n;
  };
  if (STORE_MODE === "server") {
    try {
      const data = await apiSend({ action: "view", id: String(id) });
      bump(data.views);
      writeSaved();
      return data.views;
    } catch (e) { return null; }
  }
  const list = loadLocal();
  const p = list.find(x => String(x.id) === String(id));
  if (!p) return null;
  p.views = (p.views || 0) + 1;
  saveLocal(list);
  CACHE = list;
  return p.views;
}

/* ---------- অ্যাডমিন লগইন ---------------------------------------------- */
/* পাসওয়ার্ড ব্রাউজারের কোডে নেই। সার্ভার থাকলে সেখানে যাচাই হয়; লোকাল মোডে
   (Live Server / ফাইল থেকে খোলা, PHP নেই) শুধু এর SHA-256 ছাপ মেলানো হয় — ছাপ থেকে
   পাসওয়ার্ড দেখা যায় না। পাসওয়ার্ড বদলালে api/posts.php-এর সঙ্গে নিচের ছাপও বদলান।
   ফেরত: "" মানে সফল, নইলে দেখানোর মতো ভুলের বার্তা। */
const LOCAL_PASS_SHA256 = "e33bbc86cb26357cdbffc2d4ab0dfe5c7f634c06b5708a766fb69b8e3d2df1cc";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

async function logIn(password) {
  if (STORE_MODE !== "server") {
    if (!(window.crypto && crypto.subtle)) return "এই ব্রাউজারে লোকাল লগইন চলে না — সাইটের সার্ভার দিয়ে খুলুন।";
    if (await sha256Hex(password) !== LOCAL_PASS_SHA256) return "পাসওয়ার্ড ঠিক নয়।";
    safeStore.set(AUTH_KEY, "1");
    return "";
  }
  try {
    const data = await apiSend({ action: "login", password });
    if (data.token) { safeStore.set(TOKEN_KEY, data.token); return ""; }
    return "পাসওয়ার্ড ঠিক নয়।";
  } catch (e) { return e.message || "পাসওয়ার্ড ঠিক নয়।"; }
}

const isAdmin = () => STORE_MODE === "server"
  ? !!safeStore.get(TOKEN_KEY)
  : safeStore.get(AUTH_KEY) === "1";

function logOut() { safeStore.del(TOKEN_KEY); safeStore.del(AUTH_KEY); }

/* ---------- সময় → "৩ ঘণ্টা আগে" --------------------------------------- */
function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "এইমাত্র";
  const m = Math.floor(s / 60);
  if (m < 60) return `${bnNum(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${bnNum(h)} ঘণ্টা আগে`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${bnNum(d)} দিন আগে`;
  return `${bnNum(Math.floor(d / 30))} মাস আগে`;
}

/* ---------- পড়ার আনুমানিক সময় (মিনিট) -------------------------------- */
function readTime(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

/* ---------- ছবি ছোট করে data URL বানানো ------------------------------
   বড় ছবি সরাসরি রাখলে জায়গা ভরে যায়, তাই সর্বোচ্চ ১২০০px চওড়া করে
   JPEG-এ রূপান্তর করা হয়। সার্ভার মোডে PHP এটিকে ফাইল হিসেবে সেভ করে। */
function fileToImage(file, maxW = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!file.type.startsWith("image/")) return reject(new Error("এটি ছবির ফাইল নয়।"));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ছবিটি পড়া যায়নি।"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ছবিটি খোলা যায়নি।"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL("image/jpeg", quality)); }
        catch (e) { reject(new Error("ছবিটি রূপান্তর করা যায়নি।")); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
