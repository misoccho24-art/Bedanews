/* =====================================================================
   একক সংবাদ পেজ — /বিভাগ/article/১৫  অথবা  article.html?id=...
   মাঝখানে এক কলামের পড়ার পাতা, বড় পর্দায় বাঁ পাশে শেয়ার রেল।
   ===================================================================== */
(async () => {
await initStore();
refreshPosts();
/* খবর চেনা: article.html?n=১৫ (নম্বর দিয়ে), পুরোনো /বিভাগ/article/১৫, অথবা article.html?id=... */
const qs = new URLSearchParams(location.search);
const pathNum = location.pathname.match(/\/article\/(\d+)\/?$/);
const num = qs.get("n") || (pathNum ? pathNum[1] : "");
const id = qs.get("id");
const find = () => num ? POSTS.find(p => String(p.no) === String(num)) : byId(id);
let post = find();

/* ?id=... দিয়ে এলে ঠিকানার ঘরে নম্বরের লিংকটি দেখানো (পেজ রিলোড হয় না) */
function tidyUrl() {
  if (post && post.no && !qs.get("n") && !pathNum) history.replaceState(null, "", link(post));
}
tidyUrl();

mountShell(post ? post.cat : null);

/* ---------- পড়ার অগ্রগতি (ছোট হেডারের নিচের রেখা) --------------------- */
const bar = document.getElementById("readProgress");
function updateProgress() {
  const art = document.getElementById("article");
  if (!bar || !art) return;
  const start = art.offsetTop, end = start + art.offsetHeight - innerHeight;
  const p = end > start ? Math.min(1, Math.max(0, (scrollY - start) / (end - start))) : 0;
  bar.style.transform = `scaleX(${p})`;
}
addEventListener("scroll", updateProgress, { passive: true });
addEventListener("resize", updateProgress);

/* ---------- লেখার আকার (পাঠকের পছন্দ মনে থাকে) ------------------------- */
const SIZES = [1, 1.08, 1.15, 1.25, 1.38];
let sizeIdx = Math.min(SIZES.length - 1, Math.max(0, parseInt(safeStore.get("beda-read-size") || "2", 10) || 2));
const applySize = () => document.documentElement.style.setProperty("--read-size", `${SIZES[sizeIdx]}rem`);
applySize();

/* পেজ আঁকা — সংরক্ষিত কপি দিয়ে সঙ্গে সঙ্গে; পেছনে এই খবরটি বদলে বা মুছে গেলে আবার */
function render() {
const relatedWrap = document.getElementById("relatedWrap");
const moreWrap = document.getElementById("moreWrap");

/* ---------- খবরটি না পাওয়া গেলে --------------------------------------- */
if (!post) {
  document.title = `খবরটি পাওয়া যায়নি — ${SITE.name}`;
  document.getElementById("article").innerHTML =
    emptyBox("খবরটি পাওয়া যায়নি", "খবরটি মুছে ফেলা হয়েছে, অথবা লিংকটি ঠিক নয়।", true);
  relatedWrap.hidden = true;
  const latest = recent(6);
  moreWrap.hidden = !latest.length;
  document.getElementById("more").innerHTML = latest.map(brief).join("");
  return;
}

document.title = `${post.title} — ${SITE.name}`;

/* মূল লেখা — নতুন পোস্টে rich HTML (post.content), পুরোনোতে অনুচ্ছেদের অ্যারে (post.body) */
let bodyHtml;
if (post.content) {
  bodyHtml = sanitizeRichHtml(post.content);           // রেন্ডারের আগে আবার ছেঁকে নেওয়া (দ্বিতীয় স্তরের সুরক্ষা)
} else {
  const paras = post.body && post.body.length ? post.body : [post.excerpt];
  const quoteAt = post.quote && paras.length > 2 ? 1 : -1;   // পুরোনো "quote" ফিল্ড থাকলে
  bodyHtml = paras.map((p, i) => {
    const html = `<p>${esc(p)}</p>`;
    return i === quoteAt ? `${html}<blockquote class="pullquote">${esc(post.quote)}</blockquote>` : html;
  }).join("");
}

const when = post.time || timeAgo(post.createdAt);
/* প্রকাশের তারিখ ও সময়; সম্পাদনা হলে হালনাগাদের তারিখ ও সময়ও */
/* যেমন: ৩০ অক্টোবর ২০২৬, রাত ১০:৩৮ (দিনের অংশ বাংলায়, পত্রিকার মতো) */
function stamp(ms) {
  const d = new Date(ms), h = d.getHours();
  const part = h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
  const date = d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" });
  return `${date}, ${part} ${bnNum(h % 12 || 12)}:${bnNum(String(d.getMinutes()).padStart(2, "0"))}`;
}
const published = post.createdAt ? stamp(post.createdAt) : "";
const edited = post.updatedAt && post.createdAt && post.updatedAt - post.createdAt > 60000 ? stamp(post.updatedAt) : "";

/* অঞ্চল (বিভাগ/জেলা/উপজেলা) থাকলে একটি লাইনে দেখানো */
const regionParts = [post.division && divisionName(post.division), post.district, post.upazila].filter(Boolean);
const author = String(post.author || "নিজস্ব প্রতিবেদক").trim();

/* শেয়ার — ফেসবুক, মেসেঞ্জার, হোয়াটসঅ্যাপ, এক্স, টেলিগ্রাম, লিংকডইন, ইমেইল, লিংক কপি।
   মেসেঞ্জারের ওয়েব-শেয়ার লিংক নেই: ফোনে মেসেঞ্জার অ্যাপ খোলে, কম্পিউটারে
   নিজস্ব শেয়ার মেনু (থাকলে) নয়তো লিংক কপি করে messenger.com খোলে।       */
const u = encodeURIComponent(location.href), t = encodeURIComponent(post.title);
const SHARES = [
  { key: "fb", name: "ফেসবুক",      href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { key: "ms", name: "মেসেঞ্জার",   href: `fb-messenger://share/?link=${u}`, messenger: true },
  { key: "wa", name: "হোয়াটসঅ্যাপ", href: `https://wa.me/?text=${t}%20${u}` },
  { key: "x",  name: "এক্স",        href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
  { key: "tg", name: "টেলিগ্রাম",   href: `https://t.me/share/url?url=${u}&text=${t}` },
  { key: "li", name: "লিংকডইন",    href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  { key: "mail", name: "ইমেইল",     href: `mailto:?subject=${t}&body=${u}` }
];
/* খবর শেষে "আরও পড়ুন" — অ্যাডমিনে বাছাই করা ২টি খবর (Read More); না থাকলে বা
   কম পড়লে একই বিভাগের খবর, তারপর সাম্প্রতিক খবর দিয়ে পূরণ */
const others = POSTS.filter(a => String(a.id) !== String(post.id));
const chosen = (post.readMore || []).map(rid => others.find(a => String(a.id) === String(rid))).filter(Boolean);
const sameCat = others.filter(a => a.cat === post.cat && !chosen.includes(a));
const readMore = [...chosen, ...sameCat, ...others.filter(a => a.cat !== post.cat && !chosen.includes(a))].slice(0, 2);
const readMoreIds = new Set(readMore.map(a => String(a.id)));

const shareLink = s =>
  `<a class="sh sh--${s.key}${s.messenger ? " js-ms" : ""}" href="${s.href}"${s.key === "mail" || s.messenger ? "" : ' target="_blank" rel="noopener"'} aria-label="${s.name}-এ শেয়ার" title="${s.name}">${ICON[s.key]}</a>`;

document.getElementById("article").innerHTML = `
  <header class="story__head">
    <nav class="crumbs" aria-label="অবস্থান"><a href="index.html">প্রচ্ছদ</a>${ICON.chev}<a href="${topicLink(post.cat)}"${catAttr(post.cat)}>${catName(post.cat)}</a></nav>
    <h1 class="story__title">${esc(post.title)}</h1>
    ${post.subHeadline ? `<p class="story__sub">${esc(post.subHeadline)}</p>` : ""}
    <div class="story__by">
      <span>লিখেছেন <b>${esc(author)}</b></span>
      ${published ? `<span title="${esc(when)}">${ICON.clock}প্রকাশ: ${esc(published)}</span>` : `<span>${ICON.clock}${esc(when)}</span>`}
      ${edited ? `<span class="story__upd">${ICON.clock}আপডেট: ${esc(edited)}</span>` : ""}
      <span>${ICON.book}${bnNum(post.read || 1)} মিনিটের পাঠ</span>
      <span class="js-views">${ICON.eye}${viewsText(post.views || 0)}</span>
      ${regionParts.length ? `<span>${ICON.pin}${esc(regionParts.join(", "))}</span>` : ""}
    </div>
    <div class="story__tools">
      <button type="button" id="fontDown" aria-label="লেখা ছোট করুন">অ−</button>
      <button type="button" id="fontUp" aria-label="লেখা বড় করুন">অ+</button>
      <button type="button" id="shareTop">${ICON.share}শেয়ার</button>
    </div>
  </header>

  <!-- ছবির ঠিক ওপরে ছোট শেয়ার আইকনের সারি (আগের ভাসমান খাড়া সারির বদলে) -->
  <div class="sharebar" id="share" aria-label="শেয়ার">
    ${SHARES.map(shareLink).join("")}
    <button type="button" class="js-copy" aria-label="লিংক কপি">${ICON.copy}</button>
  </div>

  <figure class="story__fig">
    <div class="st__img"><img src="${imgFor(post)}" alt="${esc(post.title)}" fetchpriority="high" decoding="async"></div>
    ${post.imgCaption ? `<figcaption>${esc(post.imgCaption)}</figcaption>` : ""}
  </figure>

  <div class="story__body">
    <div class="story__text">${bodyHtml}</div>
    ${readMore.length ? `<aside class="readmore" aria-label="আরও পড়ুন">
      <span class="readmore__label">আরও পড়ুন</span>
      ${readMore.map(a => `<a class="readmore__item" href="${link(a)}"${NEWTAB}>${ICON.arrow}<span>${esc(a.title)}</span></a>`).join("")}
    </aside>` : ""}
  </div>

  <footer class="story__end">
    <div class="story__tags"><span class="label">বিষয়</span>${tagsFor(post).map(tg =>
      `<a href="category.html?q=${encodeURIComponent(tg)}">${esc(tg)}</a>`).join("")}</div>
  </footer>`;

/* লিংক কপি — ছবির ওপরের আইকন সারিতে */
$$(".js-copy").forEach(btn => btn.addEventListener("click", () => {
  navigator.clipboard?.writeText(location.href).then(() => {
    const label = $("span", btn);
    if (label) {
      label.textContent = "কপি হয়েছে ✓";
      setTimeout(() => (label.textContent = "লিংক কপি"), 1800);
    } else {
      btn.innerHTML = ICON.check;
      setTimeout(() => (btn.innerHTML = ICON.copy), 1800);
    }
  });
}));

/* মেসেঞ্জার: ফোনে অ্যাপের লিংক নিজেই কাজ করে; কম্পিউটারে শেয়ার মেনু, নয়তো
   লিংক কপি করে messenger.com খোলা — সেখানে পেস্ট করে পাঠানো যায় */
const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
$$(".js-ms").forEach(a => a.addEventListener("click", e => {
  if (isPhone) return;
  e.preventDefault();
  if (navigator.share) { navigator.share({ title: post.title, url: location.href }).catch(() => {}); return; }
  navigator.clipboard?.writeText(location.href).catch(() => {});
  window.open("https://www.messenger.com/", "_blank", "noopener");
}));

/* ওপরের শেয়ার বোতাম: ফোনে নিজস্ব শেয়ার মেনু, না থাকলে ছবির ওপরের আইকন সারিতে যাওয়া */
document.getElementById("shareTop").addEventListener("click", () => {
  if (navigator.share) navigator.share({ title: post.title, url: location.href }).catch(() => {});
  else document.getElementById("share").scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("fontDown").addEventListener("click", () => {
  sizeIdx = Math.max(0, sizeIdx - 1); applySize(); safeStore.set("beda-read-size", String(sizeIdx));
});
document.getElementById("fontUp").addEventListener("click", () => {
  sizeIdx = Math.min(SIZES.length - 1, sizeIdx + 1); applySize(); safeStore.set("beda-read-size", String(sizeIdx));
});

/* সম্পর্কিত — একই বিভাগ আগে, কম পড়লে সাম্প্রতিক খবর দিয়ে পূরণ ("আরও পড়ুন"-এর ২টি বাদে) */
const pool = others.filter(a => !readMoreIds.has(String(a.id)));
let related = pool.filter(a => a.cat === post.cat).slice(0, 3);
if (related.length < 3) {
  const have = new Set(related.map(a => String(a.id)));
  related = related.concat(pool.filter(a => !have.has(String(a.id))).slice(0, 3 - related.length));
}
relatedWrap.hidden = !related.length;
if (related.length) {
  const grid = document.getElementById("related");
  grid.style.setProperty("--n", 3);
  grid.innerHTML = related.map(a => story(a, { dek: true })).join("");
}

/* সর্বশেষ — সময়সহ শিরোনাম, তিন কলামে */
const relIds = new Set(related.map(a => String(a.id)));
const latest = pool.filter(a => !relIds.has(String(a.id))).slice(0, 6);
moreWrap.hidden = !latest.length;
document.getElementById("more").innerHTML = latest.map(brief).join("");

updateProgress();
}

render();

/* পড়ার সংখ্যা: প্রতিবার খবরটি খুললে ১ বাড়ে। লিংকে মাউস রাখলে ব্রাউজার পেজটি আগেই
   তৈরি করে রাখে (prerender) — তখন গোনা হয় না, পাঠক সত্যিই খুললে তবেই গোনা হয়। */
function showViews(n) {
  if (n == null) return;
  $$(".js-views").forEach(el => { el.innerHTML = ICON.eye + viewsText(n); });
}
if (post) {
  const count = () => recordView(post.id).then(showViews);
  if (document.prerendering) document.addEventListener("prerenderingchange", count, { once: true });
  else count();
}

/* পেছনে নতুন তালিকা এলে শুধু তখনই আবার আঁকা হয় যখন এই খবরটি নিজেই বদলেছে বা
   মুছে গেছে — নইলে পাঠক পড়তে পড়তে পেজ নড়ে যেত। শুধু পড়ার সংখ্যা বদলালে
   পুরো পেজ নয়, শুধু সংখ্যাটি হালনাগাদ হয়।                                  */
const sigOf = p => p ? JSON.stringify({ ...p, views: 0 }) : null;
let shown = sigOf(post);
watchPosts(() => {
  const now = find();
  const sig = sigOf(now);
  if (sig === shown) { if (now) showViews(now.views || 0); return; }
  shown = sig;
  post = now;
  tidyUrl();
  render();
});

})();
