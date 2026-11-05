/* =====================================================================
   হোমপেজ — ব্রডশিট প্রথম পাতা। সব খবর আসে অ্যাডমিন প্যানেলের পোস্ট থেকে।
   ===================================================================== */
(async () => {
await initStore();          /* সার্ভার না লোকাল — আগে ঠিক করে নেওয়া */
mountShell(null);

const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };

/* ---------- আমার এলাকার খবর (বিভাগ → জেলা → উপজেলা ক্যাসকেড) ----------- */
(function localFinder() {
  const form = document.getElementById("localFinderForm");
  if (!form) return;
  show("localFinderSection", true);
  const lfDivision = document.getElementById("lfDivision");
  const lfDistrict = document.getElementById("lfDistrict");
  const lfUpazila  = document.getElementById("lfUpazila");

  /* প্রথম লাইনটি শুধু নাম দেখায় (hidden) — খোলা তালিকায় বাছাইযোগ্য অপশন হয়ে আসে না */
  const label = text => `<option value="" hidden selected>${text}</option>`;

  lfDivision.innerHTML = label("বিভাগ") +
    BD_DIVISIONS.map(d => `<option value="${d.slug}">${d.name.replace(/ বিভাগ$/, "")}</option>`).join("");

  lfDivision.addEventListener("change", () => {
    lfUpazila.innerHTML = label("উপজেলা");
    lfUpazila.disabled = true;
    const list = BD_DISTRICTS[lfDivision.value] || [];
    lfDistrict.disabled = !list.length;
    lfDistrict.innerHTML = label("জেলা") +
      (list.length ? `<option value="*">পুরো বিভাগের খবর</option>` : "") +
      list.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  });

  /* জেলার সব উপজেলা (geo.js-এর পূর্ণ তালিকা থেকে — আগে শুধু খবরে লেখা উপজেলা দেখাত) */
  lfDistrict.addEventListener("change", () => {
    if (lfDistrict.value === "*") { lfDistrict.value = ""; go(); return; }   /* পুরো বিভাগ */
    const upazilas = upazilasOf(lfDistrict.value);
    lfUpazila.disabled = !upazilas.length;
    lfUpazila.innerHTML = label("উপজেলা") +
      (upazilas.length ? `<option value="*">পুরো জেলার খবর</option>` : "") +
      upazilas.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  });

  lfUpazila.addEventListener("change", () => {
    if (!lfUpazila.value) return;
    if (lfUpazila.value === "*") lfUpazila.value = "";   /* পুরো জেলা */
    go();
  });

  /* বোতাম নেই — শেষ ড্রপডাউন বাছাই করলেই সেই এলাকার খবর খোলে */
  function go() {
    const params = new URLSearchParams({ division: lfDivision.value });
    if (lfDistrict.value) params.set("district", lfDistrict.value);
    if (lfUpazila.value) params.set("upazila", lfUpazila.value);
    location.href = `category.html?${params.toString()}`;
  }

  form.addEventListener("submit", e => { e.preventDefault(); if (lfDivision.value) go(); });
})();

/* ---------- সর্বশেষ শিরোনাম — একটি করে ওপরে সরে আসে, আগে/পরে বোতামসহ ----
   অ্যাডমিনে "Breaking News" দেওয়া খবর থাকলে শুধু সেগুলো (সর্বোচ্চ ১০টি),
   নাম হয় "ব্রেকিং নিউজ"; না থাকলে সাম্প্রতিক ৫টি, নাম "সর্বশেষ"। */
let flashTimer = null;
function flash() {
  clearInterval(flashTimer);
  const view = document.getElementById("flashView");
  const breaking = POSTS.filter(p => p.breaking).slice(0, 10);
  const heads = breaking.length ? breaking : POSTS.slice(0, 5);
  show("flashWrap", heads.length > 0);
  if (!heads.length) return;
  const wrap = document.getElementById("flashWrap");
  wrap.classList.toggle("is-breaking", breaking.length > 0);
  $(".flash__label .label", wrap).textContent = breaking.length ? "ব্রেকিং নিউজ" : "সর্বশেষ";
  view.innerHTML = heads.map((p, i) =>
    `<a class="flash__item${i === 0 ? " is-on" : ""}" href="${link(p)}"${NEWTAB}${i ? ' tabindex="-1"' : ""}>${esc(p.title)}</a>`).join("");
  const items = Array.from(view.children);
  const count = document.getElementById("flashCount");
  let i = 0;
  const go = dir => {
    const prev = i;
    i = (i + dir + items.length) % items.length;
    items.forEach((el, k) => {
      el.classList.toggle("is-on", k === i);
      el.classList.toggle("is-out", k === prev && k !== i);
      el.tabIndex = k === i ? 0 : -1;
    });
    count.textContent = `${bnNum(i + 1)} / ${bnNum(items.length)}`;
  };
  go(0);
  document.getElementById("flashPrev").onclick = () => { go(-1); restart(); };
  document.getElementById("flashNext").onclick = () => { go(1); restart(); };
  const restart = () => {
    clearInterval(flashTimer);
    if (items.length > 1) flashTimer = setInterval(() => go(1), 5000);
  };
  restart();
}

/* ---------- পেজ আঁকা ---------------------------------------------------
   প্রথমে সংরক্ষিত কপি দিয়ে সঙ্গে সঙ্গে আঁকা হয়; পেছনে সার্ভার থেকে নতুন খবর
   এসে তালিকা বদলালে এটি আবার ডাকা হয় — তাই সবকিছু আবার চালানো নিরাপদ।   */
function render() {
  flash();

  if (!POSTS.length) {
    ["opinionSection", "deskSection"].forEach(id => show(id, false));
    document.getElementById("front").innerHTML = `<div style="grid-column:1/-1;padding:0">
      ${emptyBox("এখনো কোনো খবর প্রকাশিত হয়নি", "নতুন প্রতিবেদন প্রকাশ হলে এখানে দেখা যাবে।")}</div>`;
    document.getElementById("topics").innerHTML = "";
    return;
  }

  /* ---------- প্রথম পাতা --------------------------------------------
     ওপরে: বাঁয়ে বড় প্রধান খবর (১ নম্বর), ডানে ২×২ চারটি (২–৫) — ছবির ওপর শিরোনাম।
     তার নিচে: পরের ৪টি খবর (৬–৯) আর ডানে "সর্বশেষ" ১–৫ নম্বরের তালিকা।
     কোন খবর কোন নম্বরে: অ্যাডমিনে "Is Lead?" দিয়ে বসানো নম্বর, বাকিগুলো নতুন খবর
     দিয়ে — topNews() (main.js)।                                              */
  const [lead, ...rest] = topNews(POSTS);
  const top4 = rest.slice(0, 4), next4 = rest.slice(4, 8);
  const heroIds = new Set([lead, ...top4].map(p => String(p.id)));

  document.getElementById("front").innerHTML = `
    <div class="hero">${overCard(lead, { lead: true, eager: true })}${top4.map((a, i) => overCard(a, { eager: i < 2 })).join("")}</div>
    <div class="front__more">
      ${next4.length ? `<div class="front__grid">${next4.map(a => story(a, { size: "md" })).join("")}</div>` : ""}
      <aside class="front__latest">${recentList(POSTS, 5, "সর্বশেষ")}</aside>
    </div>`;

  document.getElementById("topics").innerHTML = topicsStrip();

  /* ---------- বিভাগভিত্তিক অংশ — প্রতিটি বিভাগের সাম্প্রতিক ৪টি খবর এক সারিতে ----
     ক্রম data.js-এর CATEGORIES অনুযায়ী; যে বিভাগে খবর নেই সেটি দেখানো হয় না।
     কলাম সবসময় ৪টি, তাই কম খবর থাকলেও কার্ডের মাপ একই থাকে।              */
  function desk(cat) {
    const list = inCat(cat.slug).slice(0, 4);
    if (!list.length) return "";
    return `<section class="section"${catAttr(cat.slug)}>${deskHead(cat.name, topicLink(cat.slug))}
      <div class="cols cols--media" style="--n:4">${list.map(a => story(a, { size: "md" })).join("")}</div></section>`;
  }

  const desks = CATEGORIES.filter(c => c.slug !== "video" && c.slug !== "opinion").map(desk).join("");
  show("deskSection", !!desks);
  document.getElementById("deskSection").innerHTML = desks;

  /* ---------- মতামত ---------------------------------------------------- */
  const opinions = [...inCat("opinion"), ...inCat("lifestyle")]
    .filter(a => !heroIds.has(String(a.id))).slice(0, 3);
  show("opinionSection", opinions.length > 0);
  if (opinions.length) {
    document.getElementById("opinionGrid").innerHTML = opinions.map(opinionCard).join("");
  }
}

render();
watchPosts(render);

/* ---------- ফটো গ্যালারি ও ভিডিও — সাম্প্রতিক ৪টি করে (একবারই আনা হয়) ---------- */
fetchGallery().then(items => {
  const fill = (section, gridId, list, card) => {
    show(section, list.length > 0);
    if (!list.length) return;
    const grid = document.getElementById(gridId);
    grid.style.setProperty("--n", 4);
    grid.innerHTML = list.map(card).join("");
  };
  fill("photoSection", "photoGrid", items.filter(i => i.type === "photo").slice(0, 4), albumCard);
  fill("videoSection", "videoGrid", items.filter(i => i.type === "video").slice(0, 4), videoCard);
});

})();
