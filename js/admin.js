/* =====================================================================
   অ্যাডমিন প্যানেল — খবর পোস্ট, ড্রাফট, সম্পাদনা, প্রকাশ ও মুছে ফেলা
   ===================================================================== */
(async () => {
await initStore({ fresh: true });   /* অ্যাডমিনে সবসময় সার্ভার থেকে সরাসরি — সংরক্ষিত কপি নয় */
mountShell(null);

const main = document.getElementById("adminMain");

if (isAdmin()) {
  renderPanel();
} else {
  renderGate();
}

/* ---------- পাসওয়ার্ড গেট (যাচাই শুধু সার্ভারে) ------------------------------ */
function renderGate() {
  main.innerHTML = `
    <div class="gate">
      <div class="pass">
        <div class="pass__band"><span>প্রেস পাস · সম্পাদকীয় ডেস্ক</span>${ICON.lock}</div>
        <div class="pass__body">
          <h1>অ্যাডমিন প্রবেশ</h1>
          <p>${SITE.name} — চালিয়ে যেতে পাসওয়ার্ড দিন।</p>
          <form id="gateForm" novalidate>
            <label class="field"><span class="field__label">পাসওয়ার্ড</span>
              <input type="password" id="gatePass" inputmode="numeric" autocomplete="current-password"></label>
            <p class="gate__err" id="gateErr" role="alert"></p>
            <button class="btn btn--primary" type="submit" style="width:100%" id="gateBtn">${ICON.lock}প্রবেশ করুন</button>
          </form>
        </div>
      </div>
    </div>`;

  const form = document.getElementById("gateForm");
  const pass = document.getElementById("gatePass");
  const err = document.getElementById("gateErr");
  const btn = document.getElementById("gateBtn");
  setTimeout(() => pass.focus(), 50);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    err.textContent = "";
    if (!pass.value.trim()) { pass.focus(); return; }
    btn.disabled = true;

    const problem = await logIn(pass.value.trim());

    if (problem) {
      btn.disabled = false;
      err.textContent = problem;
      pass.value = "";
      pass.focus();
      return;
    }

    await runUnlockSequence();
    renderPanel();
  });
}

/* ---------- লগইন সফল হলে ৫ সেকেন্ডের আনলক অ্যানিমেশন ---------------------
   ছাপাখানার মতো লাইনগুলো একে একে ভরে ওঠে, শেষে "APPROVED" সিল পড়ে।     */
function runUnlockSequence() {
  return new Promise(resolve => {
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "unlock";
    overlay.innerHTML = `
      <div class="unlock__box">
        <div class="unlock__name">${SITE.name}</div>
        <div class="unlock__lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <p class="unlock__text" id="unlockText">PROCESSING ACCESS</p>
        <span class="unlock__stamp">APPROVED</span>
      </div>`;
    document.body.appendChild(overlay);

    const text = overlay.querySelector("#unlockText");

    requestAnimationFrame(() => {
      overlay.classList.add("is-in");
      requestAnimationFrame(() => overlay.classList.add("is-run"));
    });

    const setStep = msg => {
      text.classList.add("is-out");
      setTimeout(() => { text.textContent = msg; text.classList.remove("is-out"); }, 150);
    };

    setTimeout(() => setStep("CHECKING PASSKEY"), 1600);
    setTimeout(() => { setStep("ACCESS GRANTED"); overlay.classList.add("is-done"); }, 3100);
    setTimeout(() => overlay.classList.add("is-leaving"), 4600);
    setTimeout(() => {
      document.body.style.overflow = "";
      overlay.remove();
      resolve();
    }, 5000);
  });
}

/* ---------- সাইটের নিজস্ব পপআপ (ব্রাউজারের confirm/alert-এর বদলে) ---------------
   askDialog({ title, message, okText, cancelText, danger }) → Promise<true|false>
   cancelText না দিলে শুধু একটি বোতাম (জানানোর জন্য)। ফোকাস শুরুতে "বাতিল"-এ থাকে,
   তাই ভুল করে Enter চাপলে কিছু মুছে যায় না; Esc বা বাইরে চাপলে বাতিল।          */
function askDialog({ title, message = "", okText = "ঠিক আছে", cancelText = "", danger = false }) {
  return new Promise(resolve => {
    const before = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "adlg";
    wrap.innerHTML = `
      <div class="adlg__box${danger ? " is-danger" : ""}" role="alertdialog" aria-modal="true" aria-labelledby="adlgT" aria-describedby="adlgM">
        <span class="adlg__icon">${danger ? ICON.trash : ICON.check}</span>
        <h3 id="adlgT">${esc(title)}</h3>
        ${message ? `<p id="adlgM">${esc(message)}</p>` : ""}
        <div class="adlg__act">
          ${cancelText ? `<button type="button" class="adlg__btn" data-r="0">${esc(cancelText)}</button>` : ""}
          <button type="button" class="adlg__btn adlg__btn--ok" data-r="1">${danger ? ICON.trash : ""}${esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add("no-scroll");
    const done = val => {
      removeEventListener("keydown", onKey, true);
      wrap.classList.add("is-out");
      setTimeout(() => wrap.remove(), 160);
      document.body.classList.remove("no-scroll");
      if (before && before.focus) before.focus();
      resolve(val);
    };
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); done(false); }
      if (e.key === "Tab") {                       /* ফোকাস পপআপের ভেতরেই ঘোরে */
        const btns = $$(".adlg__btn", wrap), i = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length].focus();
      }
    };
    addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-r]");
      if (b) done(b.dataset.r === "1");
      else if (e.target === wrap) done(false);
    });
    $(cancelText ? '[data-r="0"]' : '[data-r="1"]', wrap).focus();
  });
}

/* ---------- অ্যাডমিন প্যানেল --------------------------------------------- */
function renderPanel() {

/* ---------- কোন মোডে চলছে ----------------------------------------------- */
const onServer = storeMode() === "server";
const modeNote = onServer
  ? `<div class="mode mode--server">
       <strong>✓ সার্ভার মোড — সব ডিভাইসে দেখা যাবে</strong>
       খবর সার্ভারে জমা হচ্ছে। এখান থেকে পোস্ট করলে মোবাইল, অন্য কম্পিউটার — সব
       ডিভাইসেই একই খবর দেখা যাবে, এবং আপনি নিজে না মুছলে কখনো হারাবে না।
     </div>`
  : `<div class="mode mode--local">
       <strong>⚠ লোকাল মোড — খবর অন্য ডিভাইসে যাবে না</strong>
       এখন খবর শুধু <em>এই ব্রাউজারে</em> জমা হচ্ছে। এই অবস্থায় পিসিতে পোস্ট করলে
       তা মোবাইলে দেখা যাবে না।
       <span class="mode__why">কারণ: ${esc(storeReason())}</span>
       <span class="mode__fix">সমাধান: সাইটটি PHP সমর্থিত হোস্টিংয়ে আপলোড করুন, অথবা
       পরীক্ষার জন্য <code>preview-server.ps1</code> ফাইলটি "Run as Administrator"
       দিয়ে চালিয়ে ফোনে সেই নেটওয়ার্ক ঠিকানা খুলুন। বিস্তারিত README-তে।</span>
     </div>`;

/* ---------- প্যানেল: বাঁয়ে সাইডবার, ওপরে বার, মাঝে পাতা (ড্যাশবোর্ড/ফর্ম/তালিকা/বিভাগ) ---
   সাইটের হেডার-ফুটার লুকিয়ে অ্যাপের মতো পূর্ণ পর্দার নকশা।                  */
document.body.classList.add("admin-app");
const wave = `<svg class="dcard__wave" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 40 C60 0 90 80 160 55 S300 10 400 50 V90 H0Z" opacity=".22"/>
  <path d="M0 62 C70 30 120 90 200 66 S330 40 400 70 V90 H0Z" opacity=".3"/></svg>`;
main.innerHTML = `
<div class="app" id="app" data-page="dash">
  <aside class="app__side" id="appSide" aria-label="অ্যাডমিন মেনু">
    <a class="app__brand" href="index.html" target="_blank" rel="noopener">${brandMark()}<span><b>${esc(SITE.name)}</b><small>সম্পাদকীয় ডেস্ক</small></span></a>
    <nav class="app__nav">
      <button type="button" data-page="dash">${ICON.home}<span>ড্যাশবোর্ড</span></button>
      <button type="button" data-page="form">${ICON.plus}<span>নতুন খবর</span></button>
      <button type="button" data-page="list">${ICON.list}<span>সব খবর</span><em class="app__count" id="navCount"></em></button>
      <button type="button" data-page="cats">${ICON.grid}<span>সব বিভাগ</span></button>
      <button type="button" data-page="photos">${ICON.image}<span>ফটো গ্যালারি</span><em class="app__count" id="navPhotos"></em></button>
      <button type="button" data-page="videos">${ICON.play}<span>ভিডিও গ্যালারি</span><em class="app__count" id="navVideos"></em></button>
      <a href="index.html" target="_blank" rel="noopener">${ICON.ext}<span>সাইট দেখুন</span></a>
    </nav>
    <div class="app__sidefoot">
      <span class="app__mode ${onServer ? "is-server" : "is-local"}"><i></i>${onServer ? "সার্ভার মোড" : "লোকাল মোড"}</span>
      <button type="button" id="logoutBtn">${ICON.logout}<span>লগআউট</span></button>
    </div>
  </aside>
  <div class="app__scrim" id="appScrim"></div>

  <div class="app__main">
    <header class="app__top">
      <button type="button" class="iconbtn app__burger" id="appBurger" aria-label="মেনু খুলুন">${ICON.menu}</button>
      <span class="app__title" id="appTitle">ড্যাশবোর্ড</span>
      <div class="app__actions">
        <button type="button" class="app__act app__act--main" data-go="form">${ICON.plus}<span>নতুন খবর</span></button>
        <button type="button" class="app__act" data-go="list">${ICON.list}<span>সব খবর</span></button>
        <button type="button" class="themebtn" id="appTheme" aria-label="থিম ও রং বদলান"><span class="themebtn__icon">${ICON.palette}</span><span class="themebtn__label">থিম</span></button>
        <span class="app__user" title="অ্যাডমিন"><span class="app__avatar">${brandMark()}</span><span>অ্যাডমিন</span></span>
      </div>
    </header>

    <div class="app__content">

    <!-- ড্যাশবোর্ড -->
    <section class="app__page" data-page="dash">
      <h1 class="app__h1">ড্যাশবোর্ড</h1>
      <div class="app__alert" id="welcome"><span><b>স্বাগতম!</b> সম্পাদকীয় ডেস্কে আপনাকে স্বাগত — এখান থেকে খবর লিখুন, এডিট করুন আর সাইটের হিসাব দেখুন।</span>
        <button type="button" aria-label="বন্ধ করুন" id="welcomeX">${ICON.close}</button></div>
      ${modeNote}
      <div class="dcards">
        <div class="dcard dcard--a">
          <span class="dcard__label">মোট খবর</span><b class="dcard__num" id="stTotal">–</b>
          <span class="dcard__sub">প্রকাশিত <b id="stLive">–</b> · ড্রাফট <b id="stDraft">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="list" data-f="all">সব খবর</button><button type="button" data-go="list" data-f="draft">ড্রাফট</button><button type="button" data-go="form">নতুন খবর</button></div>
        </div>
        <div class="dcard dcard--b">
          <span class="dcard__label">বিভাগ</span><b class="dcard__num">${bnNum(CATEGORIES.length)}</b>
          <span class="dcard__sub">খবর আছে <b id="stCatsUsed">–</b>টিতে</span>${wave}
          <div class="dcard__links"><button type="button" data-go="cats">সব বিভাগ</button><a href="index.html" target="_blank" rel="noopener">সাইট দেখুন</a></div>
        </div>
        <div class="dcard dcard--c">
          <span class="dcard__label">মোট ভিউ</span><b class="dcard__num" id="stViews">–</b>
          <span class="dcard__sub">সবচেয়ে বেশি: <b id="stTopViews">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-scroll="dashTopWrap">সবচেয়ে বেশি ভিউ</button></div>
        </div>
        <div class="dcard dcard--d">
          <span class="dcard__label">এক্সক্লুসিভ</span><b class="dcard__num" id="stEx">–</b>
          <span class="dcard__sub">প্রধান খবর <b id="stLead">–</b>টি</span>${wave}
          <div class="dcard__links"><a href="category.html?cat=exclusive" target="_blank" rel="noopener">এক্সক্লুসিভ পাতা</a><a href="category.html?cat=investigation" target="_blank" rel="noopener">অনুসন্ধান</a></div>
        </div>
        <div class="dcard dcard--e">
          <span class="dcard__label">ফটো গ্যালারি</span><b class="dcard__num" id="stAlbums">–</b>
          <span class="dcard__sub">অ্যালবাম · মোট ছবি <b id="stPhotos">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="photos">অ্যালবাম যোগ করুন</button><a href="gallery.html" target="_blank" rel="noopener">সাইটে দেখুন</a></div>
        </div>
        <div class="dcard dcard--f">
          <span class="dcard__label">ভিডিও</span><b class="dcard__num" id="stVideos">–</b>
          <span class="dcard__sub">YouTube <b id="stYt">–</b> · Facebook <b id="stFb">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="videos">ভিডিও যোগ করুন</button><a href="videos.html" target="_blank" rel="noopener">সাইটে দেখুন</a></div>
        </div>
      </div>
      <div class="dash2">
        <section class="apanel"><div class="apanel__head">${ICON.clock}সাম্প্রতিক খবর<button type="button" data-go="list">সব দেখুন${ICON.arrow}</button></div><div id="dashRecent"></div></section>
        <section class="apanel" id="dashTopWrap"><div class="apanel__head">${ICON.eye}সবচেয়ে বেশি ভিউ</div><div id="dashTop"></div></section>
      </div>
    </section>

    <!-- নতুন পোস্ট -->
    <section class="app__page panel" data-page="form">
      <div class="panel__head">${ICON.plus}<span id="formHeading">নতুন খবর পোস্ট করুন</span></div>
      <div class="panel__body admin__form">

        <div class="toast" id="toast" hidden></div>

        <div class="editing-banner" id="editingBanner" hidden>
          <span>✎ এডিট করছেন: <strong id="editingTitle"></strong></span>
          <button type="button" id="cancelEdit">বাতিল করুন</button>
        </div>

        <!-- ফাইল থেকে ফর্ম পূরণ: Google Docs/Word (.docx), .odt, .txt, .md, বা টেনে আনা/পেস্ট করা লেখা -->
        <div class="importbox" id="importBox" tabindex="0" role="button"
             aria-label="ফাইল বা লেখা এখানে টেনে আনুন, অথবা চেপে ফাইল বাছুন">
          ${ICON.upload}
          <b>ফাইল থেকে ফর্ম পূরণ করুন</b>
          <span>Google Docs / Word (.docx), .odt, .txt বা .md ফাইল এখানে টেনে আনুন — অথবা চেপে ফাইল বাছুন, কিংবা লেখা কপি করে এখানে পেস্ট (Ctrl+V) করুন</span>
          <small>ফাইলে প্রথম অংশ = শিরোনাম, এক লাইন ফাঁকা রেখে পরের অংশ = উপশিরোনাম, তারপর ইন্ট্রো, বাকি সব = পোস্ট কনটেন্ট। কোনো ঘর খালি রাখতে সেই অংশে শুধু "-" লিখুন।</small>
          <input type="file" id="importFile" accept=".docx,.odt,.txt,.md,.markdown,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" hidden>
        </div>
        <div class="importprev" id="importPrev" hidden></div>

        <form id="postForm" novalidate>

          <label class="field">
            <span class="field__label">শিরোনাম (Headline) <i>*</i></span>
            <input type="text" id="fTitle" placeholder="যেমন: অক্সিজেন উৎপাদন ০.৪ শতাংশ কমেছে" maxlength="160">
            <span class="field__err" id="eTitle"></span>
          </label>

          <label class="field">
            <span class="field__label">উপশিরোনাম (Sub Headline)</span>
            <input type="text" id="fSub" placeholder="ঐচ্ছিক — শিরোনামের নিচে ছোট করে দেখাবে" maxlength="220">
          </label>

          <label class="field">
            <span class="field__label">ইন্ট্রো (Intro)</span>
            <textarea id="fIntro" rows="2" placeholder="ঐচ্ছিক — খালি রাখলে মূল লেখার শুরু থেকেই নেওয়া হবে"></textarea>
          </label>

          <div class="field">
            <span class="field__label">পোস্ট কনটেন্ট (Post Content) <i>*</i></span>
            <div class="rte" id="rte">
              <div class="rte__bar">
                <button type="button" class="rte__btn" data-cmd="bold" title="বোল্ড" aria-label="বোল্ড">${ICON.bold}</button>
                <button type="button" class="rte__btn" data-cmd="italic" title="ইটালিক" aria-label="ইটালিক">${ICON.italic}</button>
                <button type="button" class="rte__btn" data-cmd="underline" title="আন্ডারলাইন" aria-label="আন্ডারলাইন">${ICON.underline}</button>
                <button type="button" class="rte__btn" data-cmd="highlight" title="হাইলাইট" aria-label="হাইলাইট">${ICON.highlight}</button>
                <button type="button" class="rte__btn" data-cmd="heading" title="উপশিরোনাম" aria-label="উপশিরোনাম">${ICON.heading}</button>
                <span class="rte__sep"></span>
                <button type="button" class="rte__btn" data-cmd="insertUnorderedList" title="বুলেট তালিকা" aria-label="বুলেট তালিকা">${ICON.ul}</button>
                <button type="button" class="rte__btn" data-cmd="insertOrderedList" title="ক্রমিক তালিকা" aria-label="ক্রমিক তালিকা">${ICON.ol}</button>
                <button type="button" class="rte__btn" data-cmd="blockquote" title="উদ্ধৃতি" aria-label="উদ্ধৃতি">${ICON.quote2}</button>
                <span class="rte__sep"></span>
                <button type="button" class="rte__btn" data-cmd="createLink" title="লিংক যোগ করুন" aria-label="লিংক">${ICON.link}</button>
                <button type="button" class="rte__btn" data-cmd="unlink" title="লিংক সরান" aria-label="লিংক সরান">${ICON.unlink}</button>
                <span class="rte__sep"></span>
                <button type="button" class="rte__btn" data-cmd="undo" title="আনডু" aria-label="আনডু">${ICON.undo}</button>
                <span class="rte__count" id="rteCount">০ শব্দ</span>
              </div>
              <div class="rte__box" id="fBody" contenteditable="true"
                   data-placeholder="খবরের বিস্তারিত লিখুন। এন্টার চাপলে নতুন অনুচ্ছেদ হবে।"></div>
            </div>
            <span class="field__err" id="eBody"></span>
          </div>

          <div class="field">
            <span class="field__label">ছবি (Featured Image)</span>
            <label class="drop" id="drop">
              <input type="file" id="fImage" accept="image/*">
              ${ICON.image}
              <b>ছবি বাছাই করুন বা এখানে টেনে আনুন</b>
              <span class="field__hint">প্রস্তাবিত মাপ: প্রস্থ ৬৪০px, উচ্চতা ৩৬০px — না দিলে স্বয়ংক্রিয়ভাবে একটি ব্যাকগ্রাউন্ড বসবে</span>
            </label>
            <span class="field__err" id="eImage"></span>
          </div>

          <div class="preview" id="preview" hidden>
            <img id="previewImg" alt="নির্বাচিত ছবির প্রিভিউ">
            <button class="preview__x" type="button" id="clearImg">ছবি সরান</button>
          </div>

          <div class="field-row">
            <label class="field">
              <span class="field__label">ছবির ক্যাপশন (Featured Image Caption)</span>
              <input type="text" id="fCaption" placeholder="ঐচ্ছিক" maxlength="200">
            </label>
            <label class="field">
              <span class="field__label">রিপোর্টারের নাম (Reporter Name)</span>
              <input type="text" id="fAuthor" placeholder="নিজস্ব প্রতিবেদক" maxlength="80">
            </label>
          </div>

          <label class="field">
            <span class="field__label">কীওয়ার্ড (Keywords)</span>
            <input type="text" id="fKeywords" placeholder="কমা দিয়ে আলাদা করুন, যেমন: বাজেট, অর্থনীতি">
            <span class="field__hint">এই শব্দগুলো দিয়ে খবরটি সার্চে পাওয়া যাবে</span>
          </label>

          <div class="field-row">
            <label class="field">
              <span class="field__label">বিভাগ (Category) <i>*</i></span>
              <select id="fCat">
                <option value="" hidden selected>— বিভাগ বাছাই করুন —</option>
                ${CATEGORIES.map(c => `<option value="${c.slug}">${c.name}</option>`).join("")}
              </select>
              <span class="field__err" id="eCat"></span>
            </label>
            <label class="field">
              <span class="field__label">সাব-ক্যাটাগরি (Sub Category)</span>
              <select id="fSubcat" disabled>
                <option value="" hidden selected>— প্রথমে বিভাগ বাছাই করুন —</option>
              </select>
            </label>
          </div>

          <div class="fgroup">
            <div class="fgroup__title">${ICON.pin}অঞ্চল <span class="field__hint">(ঐচ্ছিক — খবরটি কোন এলাকার)</span></div>
            <div class="field-row field-row--3">
              <label class="field">
                <span class="field__label">প্রশাসনিক বিভাগ</span>
                <select id="fDivision">
                  <option value="" hidden selected>— বাছাই করুন —</option>
                  <option value="">নেই</option>
                  ${BD_DIVISIONS.map(d => `<option value="${d.slug}">${d.name}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span class="field__label">জেলা</span>
                <select id="fDistrict" disabled>
                  <option value="" hidden selected>— বাছাই করুন —</option>
                </select>
              </label>
              <label class="field">
                <span class="field__label">উপজেলা</span>
                <select id="fUpazila" disabled>
                  <option value="" hidden selected>— আগে জেলা বাছাই করুন —</option>
                </select>
              </label>
            </div>
          </div>

          <div class="checks">
            <label class="check">
              <input type="checkbox" id="fLead">
              <span>প্রধান খবর হিসেবে দেখান (হোমপেজের ওপরে)</span>
            </label>
            <label class="check">
              <input type="checkbox" id="fExclusive">
              <span>${ICON.star} এক্সক্লুসিভ হিসেবে চিহ্নিত করুন</span>
            </label>
          </div>

          <div class="admin__actions">
            <button class="btn btn--ghost" type="submit" id="draftBtn" data-status="draft">ড্রাফট হিসেবে রাখুন</button>
            <button class="btn btn--primary" type="submit" id="postBtn" data-status="published">প্রকাশ করুন</button>
          </div>
        </form>
      </div>
    </section>

    <!-- পোস্ট ব্যবস্থাপনা -->
    <section class="app__page panel" data-page="list">
      <div class="panel__head">${ICON.list} সব খবর</div>
      <div class="panel__body">
        <div class="mtools">
          <input class="input" type="search" id="mSearch" placeholder="শিরোনাম দিয়ে খুঁজুন..." aria-label="খবর খুঁজুন">
          <div class="chips" id="mChips">
            <button type="button" class="chip is-on" data-f="all">সব</button>
            <button type="button" class="chip" data-f="draft">ড্রাফট</button>
            <button type="button" class="chip" data-f="live">প্রকাশিত</button>
          </div>
        </div>
        <div id="manageList"><p class="field__hint">লোড হচ্ছে...</p></div>
      </div>
    </section>

    <!-- সব বিভাগ -->
    <section class="app__page" data-page="cats">
      <h1 class="app__h1">সব বিভাগ</h1>
      <div class="apanel"><div id="catTable"></div></div>
    </section>

    <!-- ফটো গ্যালারি -->
    <section class="app__page" data-page="photos">
      <h1 class="app__h1">ফটো গ্যালারি</h1>
      <div class="apanel gform">
        <div class="apanel__head">${ICON.plus}নতুন অ্যালবাম</div>
        <div class="toast" id="gpToast" hidden></div>
        <label class="field"><span class="field__label">শিরোনাম <i>*</i></span>
          <input type="text" id="gpTitle" maxlength="200" placeholder="যেমন: বিজয় দিবসের কুচকাওয়াজ"></label>
        <label class="field"><span class="field__label">ক্যাপশন</span>
          <textarea id="gpCaption" rows="2" maxlength="500" placeholder="ঐচ্ছিক — অ্যালবামের ছোট বিবরণ"></textarea></label>
        <div class="field"><span class="field__label">ছবি <i>*</i></span>
          <label class="drop">${ICON.image}<b>ছবি এখানে টেনে আনুন, অথবা চেপে বাছাই করুন</b>
            <span class="field__hint">একসাথে অনেকগুলো বাছাই করা যায় (সর্বোচ্চ ৪০টি)। বড় ছবি নিজে থেকেই ছোট হয়ে যায়।</span>
            <input type="file" id="gpFiles" accept="image/*" multiple></label>
          <div class="gpicked" id="gpPicked"></div>
        </div>
        <div class="admin__actions"><button type="button" class="btn btn--primary" id="gpSave">${ICON.check}অ্যালবাম প্রকাশ করুন</button></div>
      </div>
      <div class="ggrid" id="gpList"></div>
    </section>

    <!-- ভিডিও গ্যালারি -->
    <section class="app__page" data-page="videos">
      <h1 class="app__h1">ভিডিও গ্যালারি</h1>
      <div class="apanel gform">
        <div class="apanel__head">${ICON.plus}নতুন ভিডিও</div>
        <div class="toast" id="gvToast" hidden></div>
        <label class="field"><span class="field__label">ভিডিওর লিংক <i>*</i></span>
          <input type="url" id="gvUrl" placeholder="https://www.youtube.com/watch?v=... অথবা Facebook ভিডিওর লিংক">
          <span class="field__hint" id="gvCheck">YouTube (Shorts-সহ) বা Facebook ভিডিওর লিংক কপি করে এখানে দিন।</span></label>
        <div class="gvprev" id="gvPrev" hidden></div>
        <label class="field"><span class="field__label">শিরোনাম <i>*</i></span>
          <input type="text" id="gvTitle" maxlength="200" placeholder="ভিডিওর শিরোনাম"></label>
        <label class="field"><span class="field__label">ক্যাপশন</span>
          <textarea id="gvCaption" rows="2" maxlength="500" placeholder="ঐচ্ছিক"></textarea></label>
        <label class="field"><span class="field__label">নিজের থাম্বনেইল ছবি</span>
          <input type="file" id="gvThumb" accept="image/*">
          <span class="field__hint">ঐচ্ছিক — YouTube ভিডিওর ছবি নিজে থেকেই আসে; Facebook ভিডিওর জন্য একটি ছবি দিলে ভালো দেখায়।</span></label>
        <div class="admin__actions"><button type="button" class="btn btn--primary" id="gvSave">${ICON.check}ভিডিও প্রকাশ করুন</button></div>
      </div>
      <div class="ggrid" id="gvList"></div>
    </section>

    </div>
    <footer class="app__foot"><span>© ${bnNum(dhakaToday().getFullYear())} <b>${esc(SITE.name)}</b> | সর্বস্বত্ব সংরক্ষিত</span><span>সম্পাদকীয় ডেস্ক</span></footer>
  </div>
</div>`;

/* ---------- লগআউট ------------------------------------------------------- */
document.getElementById("logoutBtn").addEventListener("click", () => {
  logOut();
  location.href = "index.html";
});

/* ---------- পাতা বদল (সাইডবার/ওপরের বোতাম) — ঠিকানায় #form, #list... থাকে -------- */
const app = document.getElementById("app");
const PAGE_TITLES = { dash: "ড্যাশবোর্ড", form: "নতুন খবর", list: "সব খবর", cats: "সব বিভাগ", photos: "ফটো গ্যালারি", videos: "ভিডিও গ্যালারি" };
function setPage(name) {
  if (!PAGE_TITLES[name]) name = "dash";
  app.dataset.page = name;
  document.getElementById("appTitle").textContent = name === "form" && editingId ? "খবর এডিট" : PAGE_TITLES[name];
  $$(".app__nav [data-page]").forEach(b => b.classList.toggle("is-on", b.dataset.page === name));
  if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
  closeSide();
  scrollTo({ top: 0 });
}
const setTab = setPage;   /* পুরোনো কোড "setTab('form')" ডাকে */

$$(".app__nav [data-page]").forEach(b => b.addEventListener("click", () => setPage(b.dataset.page)));
app.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) {
    if (go.dataset.f) { const chip = $(`#mChips [data-f="${go.dataset.f}"]`); if (chip) chip.click(); }
    setPage(go.dataset.go);
  }
  const sc = e.target.closest("[data-scroll]");
  if (sc) document.getElementById(sc.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
});

/* মোবাইলে সাইডবার ড্রয়ার */
const side = document.getElementById("appSide"), scrim = document.getElementById("appScrim");
function closeSide() { app.classList.remove("side-open"); }
document.getElementById("appBurger").addEventListener("click", () => app.classList.add("side-open"));
scrim.addEventListener("click", closeSide);

/* থিম: সাইটের হেডারের থিম বোতাম (লুকানো) দিয়েই একই প্যানেল খোলে */
document.getElementById("appTheme").addEventListener("click", e => {
  e.stopPropagation();
  const b = $("#siteHeader .js-theme");
  if (b) b.click();
});

/* স্বাগত বার্তা — বন্ধ করলে এই সেশনে আর দেখায় না */
const welcome = document.getElementById("welcome");
if (sessionStorage.getItem("beda-welcome-off")) welcome.hidden = true;
document.getElementById("welcomeX").addEventListener("click", () => {
  welcome.hidden = true;
  try { sessionStorage.setItem("beda-welcome-off", "1"); } catch (e) { /* উপেক্ষা */ }
});

/* ---------- রিচ টেক্সট এডিটর -------------------------------------------- */
const rteBox = document.getElementById("fBody");
const rteCount = document.getElementById("rteCount");

/* কার্সর যে ট্যাগের ভেতরে আছে (এডিটরের মধ্যেই) — না থাকলে null */
function closestInEditor(tag) {
  const sel = getSelection();
  let n = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  while (n && n !== rteBox) {
    if (n.nodeType === 1 && n.tagName === tag) return n;
    n = n.parentNode;
  }
  return null;
}

/* হাইলাইট: বাছাই করা লেখা <mark>-এ মোড়ানো; হাইলাইটের ভেতরে চাপলে সরিয়ে দেয় */
function toggleHighlight() {
  const mark = closestInEditor("MARK");
  if (mark) {
    while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
    mark.remove();
    return;
  }
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const box = document.createElement("div");
  box.appendChild(sel.getRangeAt(0).cloneContents());
  document.execCommand("insertHTML", false, `<mark>${box.innerHTML}</mark>`);
}

document.querySelectorAll(".rte__btn").forEach(btn => {
  btn.addEventListener("mousedown", e => e.preventDefault()); // সিলেকশন যেন না হারায়
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    rteBox.focus();
    if (cmd === "createLink") {
      const url = (prompt("লিংক ঠিকানা দিন (https://... বা mailto:...)") || "").trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
        alert("শুধু http://, https:// অথবা mailto: দিয়ে শুরু হওয়া লিংক দেওয়া যাবে।");
        return;
      }
      document.execCommand("createLink", false, url);
    } else if (cmd === "blockquote") {
      document.execCommand("formatBlock", false, "blockquote");
    } else if (cmd === "heading") {
      /* উপশিরোনাম: আবার চাপলে সাধারণ অনুচ্ছেদে ফেরে */
      document.execCommand("formatBlock", false, closestInEditor("H3") ? "p" : "h3");
    } else if (cmd === "highlight") {
      toggleHighlight();
    } else {
      document.execCommand(cmd, false, null);
    }
    updateCount();
  });
});

function updateCount() {
  const words = (rteBox.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  rteCount.textContent = `${bnNum(words)} শব্দ`;
}
rteBox.addEventListener("input", updateCount);

/* ---------- ফাইল থেকে ফর্ম পূরণ ------------------------------------------
   ফাইলের লেখা অংশে ভাগ হয় (ফাঁকা লাইন দিয়ে আলাদা; ফাঁকা লাইন একেবারে না থাকলে
   প্রতিটি অনুচ্ছেদই একটি অংশ)। অংশগুলো ফর্মের ক্রমে বসে:
     ১ম = শিরোনাম, ২য় = উপশিরোনাম, ৩য় = ইন্ট্রো, বাকি সব = পোস্ট কনটেন্ট।
   শুধু "-" লেখা অংশ মানে সেই ঘর খালি থাকবে। বসানোর আগে পূর্বরূপ দেখানো হয়।
   অনুচ্ছেদ = { text, html, list } — html-এ মোটা/বাঁকা/নিচে-দাগ থাকে (docx ও md থেকে)। */
const importBox = document.getElementById("importBox");
const importFile = document.getElementById("importFile");
const importPrev = document.getElementById("importPrev");
const SKIP_MARK = /^[-–—]$/;

/* zip ফাইল থেকে একটি ফাইল পড়া (docx/odt আসলে zip) — কোনো লাইব্রেরি ছাড়া */
async function readZipEntry(buf, name) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ফাইলটি পড়া যায়নি (zip নয়)।");
  let p = dv.getUint32(eocd + 16, true);
  const count = dv.getUint16(eocd + 10, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const entry = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (entry === name) {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      if (method === 0) return new TextDecoder().decode(data);
      if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("এই ব্রাউজারে ফাইলটি খোলা যায়নি — Chrome/Edge-এর নতুন সংস্করণে চেষ্টা করুন।");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("ফাইলের ভেতরে লেখা পাওয়া যায়নি।");
}

/* Word/Google Docs (.docx) — অনুচ্ছেদ, মোটা/বাঁকা/নিচে-দাগ, বুলেট তালিকা */
function paragraphsFromDocx(xml) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const on = el => el && !/^(0|false|none)$/i.test(el.getAttributeNS(W, "val") || "");
  return Array.from(doc.getElementsByTagNameNS(W, "p")).map(pEl => {
    let text = "", html = "";
    for (const r of pEl.getElementsByTagNameNS(W, "r")) {
      let piece = "";
      for (const c of r.childNodes) {
        if (c.localName === "t") piece += c.textContent;
        else if (c.localName === "tab") piece += " ";
        else if (c.localName === "br") piece += "\n";
      }
      if (!piece) continue;
      const pr = r.getElementsByTagNameNS(W, "rPr")[0];
      let h = esc(piece).replace(/\n/g, "<br>");
      if (pr && on(pr.getElementsByTagNameNS(W, "u")[0])) h = `<u>${h}</u>`;
      if (pr && on(pr.getElementsByTagNameNS(W, "i")[0])) h = `<i>${h}</i>`;
      if (pr && on(pr.getElementsByTagNameNS(W, "b")[0])) h = `<b>${h}</b>`;
      text += piece; html += h;
    }
    return { text: text.trim(), html: html.trim(), list: pEl.getElementsByTagNameNS(W, "numPr").length > 0 };
  });
}

/* OpenDocument (.odt, LibreOffice ইত্যাদি) — শুধু লেখা */
function paragraphsFromOdt(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const T = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
  const out = [];
  for (const el of doc.getElementsByTagNameNS(T, "*")) {
    if (el.localName !== "p" && el.localName !== "h") continue;
    const text = el.textContent.trim();
    out.push({ text, html: esc(text), list: el.parentNode && el.parentNode.localName === "list-item" });
  }
  return out;
}

/* .txt / .md / টেনে আনা বা পেস্ট করা লেখা — md-র **মোটা**, *বাঁকা*, "- " তালিকা বোঝে */
function paragraphsFromText(raw, markdown) {
  return String(raw).replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n").map(line => {
    let t = line.trim(), list = false;
    if (markdown) {
      t = t.replace(/^#{1,6}\s+/, "");
      if (/^[-*+]\s+/.test(t)) { list = true; t = t.replace(/^[-*+]\s+/, ""); }
    }
    let html = esc(t);
    if (markdown) html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, "$1<i>$2</i>");
    const text = markdown ? t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, "$1$2") : t;
    return { text, html, list };
  });
}

/* অনুচ্ছেদ → অংশ → ফর্মের ঘর */
function mapToFields(paras) {
  while (paras.length && !paras[0].text) paras.shift();
  const hasGaps = paras.some(p => !p.text);
  const blocks = [];
  if (hasGaps) {
    let cur = [];
    for (const p of paras) {
      if (p.text) cur.push(p);
      else if (cur.length) { blocks.push(cur); cur = []; }
    }
    if (cur.length) blocks.push(cur);
  } else {
    paras.forEach(p => blocks.push([p]));
  }
  const line = b => b ? b.map(p => p.text).join(" ").replace(/\s+/g, " ").trim() : "";
  const field = b => SKIP_MARK.test(line(b)) ? "" : line(b);

  /* পোস্ট কনটেন্ট: প্রতিটি অনুচ্ছেদ আলাদা <p>, পরপর তালিকার লাইন একটি <ul>-এ */
  const bodyParas = blocks.slice(3).flat().filter(p => !SKIP_MARK.test(p.text));
  let html = "", inList = false;
  for (const p of bodyParas) {
    if (p.list && !inList) { html += "<ul>"; inList = true; }
    if (!p.list && inList) { html += "</ul>"; inList = false; }
    html += p.list ? `<li>${p.html}</li>` : `<p>${p.html}</p>`;
  }
  if (inList) html += "</ul>";
  return {
    title: field(blocks[0]), sub: field(blocks[1]), intro: field(blocks[2]),
    body: sanitizeRichHtml(html), bodyCount: bodyParas.length
  };
}

async function readImport(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".docx")) return paragraphsFromDocx(await readZipEntry(await file.arrayBuffer(), "word/document.xml"));
  if (name.endsWith(".odt")) return paragraphsFromOdt(await readZipEntry(await file.arrayBuffer(), "content.xml"));
  if (name.endsWith(".doc")) throw new Error("পুরোনো .doc ফাইল খোলা যায় না — Word-এ .docx হিসেবে সেভ করে আবার দিন।");
  if (name.endsWith(".pdf")) throw new Error("PDF থেকে লেখা নেওয়া যায় না — .docx, .txt বা .md ফাইল দিন।");
  if (/\.(txt|md|markdown)$/.test(name) || /^text\//.test(file.type)) return paragraphsFromText(await file.text(), /\.(md|markdown)$/.test(name));
  throw new Error("এই ধরনের ফাইল চেনা গেল না — .docx, .odt, .txt বা .md দিন।");
}

/* পূর্বরূপ — কোন লেখা কোন ঘরে যাবে; "ফর্মে বসান" চাপলে তবেই বসে */
function previewImport(fields, source) {
  if (!fields.title && !fields.sub && !fields.intro && !fields.bodyCount) {
    showToast("ফাইলে কোনো লেখা পাওয়া যায়নি।", false);
    return;
  }
  const cut = (s, n) => s.length > n ? s.slice(0, n).trim() + "…" : s;
  const row = (label, val, warn) => `<div class="importprev__row"><span>${label}</span>${
    val ? `<b>${esc(cut(val, 140))}</b>` : `<em>খালি থাকবে</em>`}${warn ? `<small>${warn}</small>` : ""}</div>`;
  const bodyText = plainTextFromHtml(fields.body.replace(/<\/(p|li)>/g, " ")).replace(/\s+/g, " ").trim();
  importPrev.innerHTML = `
    <div class="importprev__head">${ICON.check}<span><b>${esc(source)}</b> থেকে যা বসবে:</span></div>
    ${row("শিরোনাম", fields.title, fields.title.length > 160 ? "১৬০ অক্ষরের বেশি — বসানোর পর ছোট করুন" : "")}
    ${row("উপশিরোনাম", fields.sub)}
    ${row("ইন্ট্রো", fields.intro)}
    ${row(`পোস্ট কনটেন্ট${fields.bodyCount ? ` (${bnNum(fields.bodyCount)}টি অনুচ্ছেদ)` : ""}`, bodyText)}
    <p class="importprev__note">ফর্মে আগে যা লেখা আছে, এই চারটি ঘরে তা বদলে যাবে। ছবি, বিভাগ ইত্যাদি আগের মতোই থাকবে।</p>
    <div class="importprev__act">
      <button type="button" class="btn btn--primary" id="importApply">ফর্মে বসান</button>
      <button type="button" class="btn btn--ghost" id="importCancel">বাতিল</button>
    </div>`;
  importPrev.hidden = false;
  importPrev.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.getElementById("importCancel").onclick = () => { importPrev.hidden = true; };
  document.getElementById("importApply").onclick = () => {
    document.getElementById("fTitle").value = fields.title;
    document.getElementById("fSub").value = fields.sub;
    document.getElementById("fIntro").value = fields.intro;
    rteBox.innerHTML = fields.body;
    updateCount();
    ["fTitle", "fSub", "fIntro"].forEach(id => document.getElementById(id).dispatchEvent(new Event("input", { bubbles: true })));
    document.getElementById("eTitle").textContent = "";
    importPrev.hidden = true;
    showToast("ফাইল থেকে ফর্ম পূরণ হয়েছে — একবার দেখে নিয়ে বাকি ঘর (ছবি, বিভাগ) পূরণ করুন।", true);
    document.getElementById("fTitle").scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

async function handleImport(getParas, source) {
  importBox.classList.add("is-busy");
  try {
    previewImport(mapToFields(await getParas()), source);
  } catch (err) {
    showToast(err.message || "ফাইলটি পড়া যায়নি।", false);
  } finally {
    importBox.classList.remove("is-busy");
  }
}

importBox.addEventListener("click", () => importFile.click());
importBox.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); importFile.click(); } });
importFile.addEventListener("change", () => {
  const f = importFile.files[0];
  if (f) handleImport(() => readImport(f), f.name);
  importFile.value = "";
});
["dragenter", "dragover"].forEach(ev => importBox.addEventListener(ev, e => { e.preventDefault(); importBox.classList.add("is-over"); }));
["dragleave", "drop"].forEach(ev => importBox.addEventListener(ev, () => importBox.classList.remove("is-over")));
importBox.addEventListener("drop", e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) { handleImport(() => readImport(f), f.name); return; }
  const text = e.dataTransfer.getData("text/plain");          /* ডকুমেন্ট থেকে বাছাই করা লেখা টেনে আনলে */
  if (text) handleImport(async () => paragraphsFromText(text, false), "টেনে আনা লেখা");
});
importBox.addEventListener("paste", e => {
  const f = e.clipboardData.files[0];
  const text = e.clipboardData.getData("text/plain");
  if (!f && !text) return;
  e.preventDefault();
  if (f) handleImport(() => readImport(f), f.name);
  else handleImport(async () => paragraphsFromText(text, false), "পেস্ট করা লেখা");
});

/* ---------- বিভাগ → সাব-ক্যাটাগরি ক্যাসকেড ------------------------------------ */
const fCat = document.getElementById("fCat");
const fSubcat = document.getElementById("fSubcat");
fCat.addEventListener("change", () => {
  const list = SUBCATEGORIES[fCat.value] || [];
  if (!list.length) {
    fSubcat.innerHTML = `<option value="" hidden selected>— এই বিভাগে সাব-ক্যাটাগরি নেই —</option>`;
    fSubcat.disabled = true;
    return;
  }
  fSubcat.disabled = false;
  fSubcat.innerHTML = `<option value="" hidden selected>— সাব-ক্যাটাগরি বাছাই করুন —</option>`
    + `<option value="">নেই</option>` +
    list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
});

/* ---------- প্রশাসনিক বিভাগ → জেলা ক্যাসকেড ----------------------------- */
const fDivision = document.getElementById("fDivision");
const fDistrict = document.getElementById("fDistrict");
const fUpazila = document.getElementById("fUpazila");

/* জেলার সব উপজেলা (geo.js-এর পূর্ণ তালিকা)। keep: পুরোনো খবরে হাতে লেখা এমন
   উপজেলা থাকলে যা তালিকায় নেই, সেটিও একটি বিকল্প হিসেবে রেখে বাছাই করে রাখা। */
function fillUpazilas(keep = "") {
  const list = fDistrict.value ? upazilasOf(fDistrict.value) : [];
  const match = list.find(u => sameBn(u, keep));
  const extra = keep && !match ? [keep] : [];
  fUpazila.disabled = !list.length && !extra.length;
  fUpazila.innerHTML = `<option value="" hidden selected>${fUpazila.disabled ? "— আগে জেলা বাছাই করুন —" : "— উপজেলা বাছাই করুন (ঐচ্ছিক) —"}</option>`
    + (fUpazila.disabled ? "" : `<option value="">নেই</option>`) +
    [...list, ...extra].map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  fUpazila.value = match || keep || "";
}

fDivision.addEventListener("change", () => {
  const list = BD_DISTRICTS[fDivision.value] || [];
  if (!list.length) {
    fDistrict.innerHTML = `<option value="" hidden selected>— বাছাই করুন —</option>`;
    fDistrict.disabled = true;
    fillUpazilas();
    return;
  }
  fDistrict.disabled = false;
  fDistrict.innerHTML = `<option value="" hidden selected>— জেলা বাছাই করুন —</option>`
    + `<option value="">নেই</option>` +
    list.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  fillUpazilas();
});
fDistrict.addEventListener("change", () => fillUpazilas());

/* ---------- ছবি নির্বাচন (বাছাই বা টেনে আনা) ----------------------------- */
let pickedImage = "";
const fImage = document.getElementById("fImage");
const drop = document.getElementById("drop");
const preview = document.getElementById("preview");
const previewImg = document.getElementById("previewImg");

const setErr = (id, msg) => { document.getElementById(id).textContent = msg; };

async function takeFile(file) {
  setErr("eImage", "");
  if (!file) { clearImage(); return; }
  try {
    pickedImage = await fileToImage(file);
    previewImg.src = pickedImage;
    preview.hidden = false;
    drop.hidden = true;
  } catch (err) {
    clearImage();
    setErr("eImage", err.message);
  }
}
fImage.addEventListener("change", () => takeFile(fImage.files[0]));
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
drop.addEventListener("drop", e => { e.preventDefault(); takeFile(e.dataTransfer.files[0]); });

document.getElementById("clearImg").addEventListener("click", clearImage);

function clearImage() {
  pickedImage = "";
  fImage.value = "";
  previewImg.removeAttribute("src");
  preview.hidden = true;
  drop.hidden = false;
}

/* ---------- ফর্ম রিসেট (নতুন পোস্টের জন্য প্রস্তুত) --------------------- */
function resetForm(form) {
  form.reset();
  rteBox.innerHTML = "";
  updateCount();
  fSubcat.innerHTML = `<option value="" hidden selected>— প্রথমে বিভাগ বাছাই করুন —</option>`;
  fSubcat.disabled = true;
  fDistrict.innerHTML = `<option value="" hidden selected>— বাছাই করুন —</option>`;
  fDistrict.disabled = true;
  fillUpazilas();
  clearImage();
}

/* ---------- ফর্ম জমা (দুটি বোতাম: ড্রাফট / প্রকাশ) ------------------------ */
let submitStatus = "published";
document.getElementById("draftBtn").addEventListener("click", () => { submitStatus = "draft"; });
document.getElementById("postBtn").addEventListener("click", () => { submitStatus = "published"; });

/* ---------- পোস্ট সম্পাদনা (বিদ্যমান পোস্ট ফর্মে লোড করা) --------------- */
let editingId = null;
const editingBanner = document.getElementById("editingBanner");
const postBtn = document.getElementById("postBtn");
const formHeading = document.getElementById("formHeading");

function startEdit(post) {
  editingId = post.id;
  setTab("form");

  document.getElementById("fTitle").value = post.title || "";
  document.getElementById("fSub").value = post.subHeadline || "";
  document.getElementById("fIntro").value = "";
  rteBox.innerHTML = post.content || (post.body || []).map(t => `<p>${esc(t)}</p>`).join("");
  updateCount();
  document.getElementById("fCaption").value = post.imgCaption || "";
  document.getElementById("fAuthor").value = post.author || "";
  document.getElementById("fKeywords").value = (post.keywords || []).join(", ");

  fCat.value = post.cat || "";
  fCat.dispatchEvent(new Event("change"));
  fSubcat.value = post.subcat || "";

  fDivision.value = post.division || "";
  fDivision.dispatchEvent(new Event("change"));
  fDistrict.value = post.district || "";
  fillUpazilas(post.upazila || "");   /* এডিটে আগের উপজেলাসহ তালিকা */

  document.getElementById("fLead").checked = !!post.isLead;
  document.getElementById("fExclusive").checked = !!post.exclusive;

  pickedImage = post.img || "";
  if (pickedImage) {
    previewImg.src = pickedImage;
    preview.hidden = false;
    drop.hidden = true;
  } else {
    clearImage();
  }

  editingBanner.hidden = false;
  document.getElementById("editingTitle").textContent = post.title;
  formHeading.textContent = "খবর এডিট";
  postBtn.textContent = "পরিবর্তন সংরক্ষণ করুন";
  scrollTo({ top: document.getElementById("postForm").getBoundingClientRect().top + scrollY - 90, behavior: "smooth" });
  document.getElementById("fTitle").focus({ preventScroll: true });
}

function endEdit() {
  editingId = null;
  editingBanner.hidden = true;
  formHeading.textContent = "নতুন খবর পোস্ট করুন";
  postBtn.textContent = "প্রকাশ করুন";
  if (app.dataset.page === "form") document.getElementById("appTitle").textContent = PAGE_TITLES.form;
}

document.getElementById("cancelEdit").addEventListener("click", () => {
  endEdit();
  resetForm(document.getElementById("postForm"));
});

document.getElementById("postForm").addEventListener("submit", async e => {
  e.preventDefault();

  const title = document.getElementById("fTitle").value.trim();
  const cat   = fCat.value;
  const contentHtml = sanitizeRichHtml(rteBox.innerHTML.trim());
  const plainBody = plainTextFromHtml(contentHtml).trim();

  setErr("eTitle", ""); setErr("eCat", ""); setErr("eBody", "");
  let bad = false;
  if (!title) { setErr("eTitle", "শিরোনাম লিখুন।"); bad = true; }
  if (!cat)   { setErr("eCat", "একটি বিভাগ বাছাই করুন।"); bad = true; }
  if (!plainBody) { setErr("eBody", "পোস্ট কনটেন্ট লিখুন।"); bad = true; }
  if (bad) {
    const firstErr = $(".field__err:not(:empty)");
    if (firstErr) firstErr.closest(".field").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const introRaw = document.getElementById("fIntro").value.trim();
  const excerptSrc = introRaw || plainBody;
  const excerpt = excerptSrc.length > 190 ? excerptSrc.slice(0, 190).trim() + "…" : excerptSrc;

  const keywords = document.getElementById("fKeywords").value
    .split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);

  const post = {
    id: String(Date.now()),
    cat,
    subcat: fSubcat.value || "",
    title,
    subHeadline: document.getElementById("fSub").value.trim(),
    excerpt,
    content: contentHtml,
    img: pickedImage,
    imgCaption: document.getElementById("fCaption").value.trim(),
    author: document.getElementById("fAuthor").value.trim() || "নিজস্ব প্রতিবেদক",
    keywords,
    division: fDivision.value || "",
    district: fDistrict.value || "",
    upazila: fUpazila.value.trim(),
    isLead: document.getElementById("fLead").checked,
    exclusive: document.getElementById("fExclusive").checked,
    status: submitStatus,
    read: readTime(plainBody),
    createdAt: Date.now()
  };

  const draftBtn = document.getElementById("draftBtn");
  draftBtn.disabled = true; postBtn.disabled = true;
  const activeBtn = submitStatus === "draft" ? draftBtn : postBtn;
  const activeLabel = activeBtn.textContent;
  activeBtn.textContent = "পাঠানো হচ্ছে...";

  const wasEditing = editingId;
  let saved;
  try {
    saved = wasEditing ? await updatePost(wasEditing, post) : await createPost(post);
  } catch (err) {
    showToast(err.message, false);
    draftBtn.disabled = false; postBtn.disabled = false;
    activeBtn.textContent = activeLabel;
    return;
  }

  draftBtn.disabled = false; postBtn.disabled = false;
  activeBtn.textContent = activeLabel;

  showToast(
    submitStatus === "draft" ? "ড্রাফট হিসেবে সেভ হয়েছে"
      : (wasEditing ? "পরিবর্তন সংরক্ষিত হয়েছে" : "সাইটে আপলোড হয়েছে"),
    true, saved, submitStatus === "draft"
  );
  endEdit();
  resetForm(e.target);
  refreshPosts();
  await refreshManageList();
  scrollTo({ top: 0, behavior: "smooth" });
});

/* ---------- বার্তা ------------------------------------------------------ */
function showToast(msg, ok, saved, isDraft) {
  const t = document.getElementById("toast");
  t.className = "toast " + (ok ? "toast--ok" : "toast--bad");
  t.innerHTML = ok
    ? `<strong>✓ ${esc(msg)}</strong> ${isDraft || !saved ? "" : `<a href="${link(saved)}">খবরটি দেখুন</a>`}`
    : `<strong>${esc(msg)}</strong>`;
  t.hidden = false;
}

/* ---------- সব খবর তালিকা --------------------------------------- */
let filter = "all";
const mSearch = document.getElementById("mSearch");
mSearch.addEventListener("input", renderManageList);
$$("#mChips .chip").forEach(c => c.addEventListener("click", () => {
  filter = c.dataset.f;
  $$("#mChips .chip").forEach(x => x.classList.toggle("is-on", x === c));
  renderManageList();
}));

async function refreshManageList() {
  await loadManaged();
  renderManageList();
}

function renderManageList() {
  const box = document.getElementById("manageList");
  const all = managedPosts();
  const drafts = all.filter(p => p.status === "draft");
  const live   = all.filter(p => p.status !== "draft");

  document.getElementById("stTotal").textContent = bnNum(all.length);
  document.getElementById("stLive").textContent = bnNum(live.length);
  document.getElementById("stDraft").textContent = bnNum(drafts.length);
  renderDash(all, live);

  if (!all.length) {
    box.innerHTML = `<div class="empty" style="padding:40px 16px;border:0">
        <div class="empty__icon">${ICON.news}</div>
        <h3>কোনো খবর নেই</h3>
        <p>ফর্ম থেকে প্রথম খবরটি পোস্ট করুন।</p>
      </div>`;
    return;
  }

  const q = mSearch.value.trim().toLowerCase();
  const match = p => !q || String(p.title || "").toLowerCase().includes(q);
  const showDrafts = filter !== "live" ? drafts.filter(match) : [];
  const showLive   = filter !== "draft" ? live.filter(match) : [];

  const row = p => `
      <div class="mrow" data-id="${p.id}">
        <img class="mrow__img" src="${imgFor(p)}" alt="" loading="lazy">
        <div>
          <a class="mrow__title" href="${p.status === "draft" ? `article.html?id=${p.id}` : link(p)}">${esc(p.title)}</a>
          <span class="meta" style="margin-top:4px">
            <span class="status ${p.status === "draft" ? "status--draft" : "status--live"}">${p.status === "draft" ? "ড্রাফট" : "প্রকাশিত"}</span>
            <span>${catName(p.cat)}</span><span>${timeAgo(p.createdAt)}</span>
          </span>
        </div>
        <div class="mrow__actions">
          <button class="mrow__edit" type="button" data-edit="${p.id}">${ICON.edit}এডিট</button>
          ${p.status === "draft" ? `<button class="mrow__pub" type="button" data-pub="${p.id}">${ICON.check}প্রকাশ করুন</button>` : ""}
          <button class="mrow__del" type="button" data-del="${p.id}" aria-label="ডিলিট করুন">${ICON.trash}ডিলিট</button>
        </div>
      </div>`;

  box.innerHTML = (!showDrafts.length && !showLive.length)
    ? `<p class="field__hint" style="padding:20px 0;text-align:center">কোনো খবর মেলেনি।</p>`
    : `${showDrafts.length ? `<p class="admin__subhead">ড্রাফট (${bnNum(showDrafts.length)})</p>${showDrafts.map(row).join("")}` : ""}
       ${showLive.length ? `<p class="admin__subhead">প্রকাশিত (${bnNum(showLive.length)})</p>${showLive.map(row).join("")}` : ""}`;

  box.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const post = all.find(p => String(p.id) === String(btn.dataset.edit));
      if (post) startEdit(post);
    });
  });

  box.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.del;
      const post = all.find(p => String(p.id) === String(id));
      if (!post) return;
      if (!await askDialog({ title: "খবরটি ডিলিট করবেন?",
            message: `“${post.title}” — খবরটি ও এর ছবি স্থায়ীভাবে ডিলিট হবে। এটি আর ফেরানো যাবে না।`,
            okText: "ডিলিট করুন", cancelText: "বাতিল", danger: true })) return;

      btn.disabled = true;
      try {
        await removePost(id);
      } catch (err) {
        btn.disabled = false;
        showToast(err.message, false);
        return;
      }
      if (String(editingId) === String(id)) { endEdit(); resetForm(document.getElementById("postForm")); }
      refreshPosts();
      await refreshManageList();
    });
  });

  box.querySelectorAll("[data-pub]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.pub;
      btn.disabled = true;
      btn.textContent = "প্রকাশ হচ্ছে...";
      try {
        await publishPost(id);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `${ICON.check}প্রকাশ করুন`;
        showToast(err.message, false);
        return;
      }
      refreshPosts();
      await refreshManageList();
    });
  });
}

/* ---------- ড্যাশবোর্ড ও বিভাগের হিসাব --------------------------------- */
function renderDash(all, live) {
  const views = live.reduce((n, p) => n + (p.views || 0), 0);
  const top = live.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).filter(p => p.views).slice(0, 5);
  const usedCats = new Set(live.map(p => p.cat));
  document.getElementById("navCount").textContent = all.length ? bnNum(all.length) : "";
  document.getElementById("stViews").textContent = bnNum(views);
  document.getElementById("stTopViews").textContent = top.length ? `${bnNum(top[0].views)} বার` : "—";
  document.getElementById("stCatsUsed").textContent = bnNum(CATEGORIES.filter(c => usedCats.has(c.slug)).length);
  document.getElementById("stEx").textContent = bnNum(live.filter(p => p.exclusive || p.cat === "exclusive").length);
  document.getElementById("stLead").textContent = bnNum(live.filter(p => p.isLead).length);

  const line = (p, right) => `
    <div class="drow">
      <img src="${imgFor(p)}" alt="" loading="lazy">
      <div><a href="${p.status === "draft" ? `article.html?id=${p.id}` : link(p)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        <span class="drow__meta"><i class="status ${p.status === "draft" ? "status--draft" : "status--live"}">${p.status === "draft" ? "ড্রাফট" : "প্রকাশিত"}</i>${catName(p.cat)} · ${timeAgo(p.createdAt)}</span></div>
      ${right}
    </div>`;
  const editBtn = p => `<button type="button" class="drow__btn" data-dedit="${p.id}" aria-label="এডিট">${ICON.edit}</button>`;
  const empty = msg => `<p class="drow__empty">${msg}</p>`;

  const recentBox = document.getElementById("dashRecent");
  recentBox.innerHTML = all.length ? all.slice(0, 5).map(p => line(p, editBtn(p))).join("") : empty("এখনো কোনো খবর নেই — ওপরের “নতুন খবর” থেকে শুরু করুন।");
  recentBox.querySelectorAll("[data-dedit]").forEach(b => b.addEventListener("click", () => {
    const post = all.find(p => String(p.id) === b.dataset.dedit);
    if (post) startEdit(post);
  }));
  document.getElementById("dashTop").innerHTML = top.length
    ? top.map((p, i) => line(p, `<b class="drow__views">${ICON.eye}${bnNum(p.views)}</b>`).replace('class="drow"', `class="drow drow--rank" data-rank="${bnNum(i + 1)}"`)).join("")
    : empty("এখনো কোনো খবরে ভিউ হয়নি।");

  /* সব বিভাগ পাতা — প্রতিটির রং, খবর, ড্রাফট, মোট ভিউ */
  document.getElementById("catTable").innerHTML = `
    <div class="ctable">
      <div class="ctable__row ctable__row--head"><span>বিভাগ</span><span>প্রকাশিত</span><span>ড্রাফট</span><span>মোট ভিউ</span><span></span></div>
      ${CATEGORIES.map(c => {
        const mine = all.filter(p => p.cat === c.slug);
        const pub = mine.filter(p => p.status !== "draft");
        return `<div class="ctable__row">
          <span><i class="ctable__dot"${catAttr(c.slug)}></i><b>${c.name}</b></span>
          <span>${bnNum(pub.length)}</span><span>${bnNum(mine.length - pub.length)}</span>
          <span>${bnNum(pub.reduce((n, p) => n + (p.views || 0), 0))}</span>
          <span><a href="${topicLink(c.slug)}" target="_blank" rel="noopener">পাতা দেখুন${ICON.arrow}</a></span>
        </div>`;
      }).join("")}
    </div>`;
}

/* ---------- গ্যালারি: ফটো অ্যালবাম ও ভিডিও -------------------------------- */
const gToast = (id, msg, ok) => {
  const t = document.getElementById(id);
  t.className = "toast " + (ok ? "toast--ok" : "toast--bad");
  t.innerHTML = `<strong>${ok ? "✓ " : ""}${esc(msg)}</strong>`;
  t.hidden = false;
};

/* বাছাই করা ছবি — পাঠানোর আগে ছোট প্রিভিউ, প্রতিটি আলাদা করে বাদ দেওয়া যায় */
let gpFiles = [];
const gpPicked = document.getElementById("gpPicked");
function renderPicked() {
  gpPicked.innerHTML = gpFiles.map((f, i) =>
    `<span class="gpicked__item"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="${i}" aria-label="বাদ দিন">${ICON.close}</button></span>`).join("");
  gpPicked.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { gpFiles.splice(+b.dataset.rm, 1); renderPicked(); }));
}
document.getElementById("gpFiles").addEventListener("change", e => {
  gpFiles = gpFiles.concat(Array.from(e.target.files).filter(f => f.type.startsWith("image/"))).slice(0, 40);
  e.target.value = "";
  renderPicked();
});

document.getElementById("gpSave").addEventListener("click", async () => {
  const btn = document.getElementById("gpSave");
  const title = document.getElementById("gpTitle").value.trim();
  if (!title) { gToast("gpToast", "অ্যালবামের শিরোনাম লিখুন।"); return; }
  if (!gpFiles.length) { gToast("gpToast", "অন্তত একটি ছবি বাছাই করুন।"); return; }
  const label = btn.innerHTML;
  btn.disabled = true;
  let item = null, done = 0;
  try {
    for (const f of gpFiles) {
      btn.textContent = `${bnNum(done + 1)}/${bnNum(gpFiles.length)} ছবি আপলোড হচ্ছে…`;
      const img = await fileToImage(f);
      item = item ? await addGalleryPhoto(item.id, img)
                  : await addGalleryItem({ type: "photo", title, caption: document.getElementById("gpCaption").value.trim(), img });
      done++;
    }
    gToast("gpToast", `অ্যালবাম প্রকাশিত হয়েছে — ${bnNum(done)}টি ছবি।`, true);
    gpFiles = []; renderPicked();
    document.getElementById("gpTitle").value = ""; document.getElementById("gpCaption").value = "";
  } catch (err) {
    gToast("gpToast", done ? `${bnNum(done)}টি ছবি উঠেছে, বাকিগুলো ওঠেনি: ${err.message}` : err.message);
  } finally {
    btn.disabled = false; btn.innerHTML = label;
    refreshGallery();
  }
});

/* ভিডিও: লিংক দিলেই চেনা যায় কি না দেখানো, YouTube হলে ছবিও */
const gvUrl = document.getElementById("gvUrl"), gvCheck = document.getElementById("gvCheck"), gvPrev = document.getElementById("gvPrev");
gvUrl.addEventListener("input", () => {
  const v = parseVideoLink(gvUrl.value);
  gvCheck.classList.toggle("is-ok", !!v);
  gvCheck.classList.toggle("is-bad", !v && !!gvUrl.value.trim());
  gvCheck.textContent = !gvUrl.value.trim() ? "YouTube (Shorts-সহ) বা Facebook ভিডিওর লিংক কপি করে এখানে দিন।"
    : v ? `✓ ${v.kind === "youtube" ? "YouTube" : "Facebook"} ভিডিও চেনা গেছে` : "এই লিংকটি চেনা যাচ্ছে না — YouTube বা Facebook ভিডিওর লিংক দিন।";
  gvPrev.hidden = !(v && v.kind === "youtube");
  if (v && v.kind === "youtube") gvPrev.innerHTML = `<img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="">`;
});

document.getElementById("gvSave").addEventListener("click", async () => {
  const btn = document.getElementById("gvSave");
  const title = document.getElementById("gvTitle").value.trim();
  if (!parseVideoLink(gvUrl.value)) { gToast("gvToast", "YouTube বা Facebook ভিডিওর সঠিক লিংক দিন।"); return; }
  if (!title) { gToast("gvToast", "ভিডিওর শিরোনাম লিখুন।"); return; }
  const label = btn.innerHTML;
  btn.disabled = true; btn.textContent = "পাঠানো হচ্ছে…";
  try {
    const thumbFile = document.getElementById("gvThumb").files[0];
    await addGalleryItem({ type: "video", title, url: gvUrl.value.trim(),
      caption: document.getElementById("gvCaption").value.trim(), thumb: thumbFile ? await fileToImage(thumbFile, 960) : "" });
    gToast("gvToast", "ভিডিও প্রকাশিত হয়েছে।", true);
    ["gvUrl", "gvTitle", "gvCaption", "gvThumb"].forEach(id => { document.getElementById(id).value = ""; });
    gvUrl.dispatchEvent(new Event("input"));
  } catch (err) {
    gToast("gvToast", err.message);
  } finally {
    btn.disabled = false; btn.innerHTML = label;
    refreshGallery();
  }
});

/* তালিকা — অ্যালবাম/ভিডিও কার্ড, দেখুন ও ডিলিট */
async function refreshGallery() {
  const items = await fetchGallery();
  const albums = items.filter(i => i.type === "photo"), videos = items.filter(i => i.type === "video");
  const photoCount = albums.reduce((n, a) => n + (a.photos || []).length, 0);
  document.getElementById("navPhotos").textContent = albums.length ? bnNum(albums.length) : "";
  document.getElementById("navVideos").textContent = videos.length ? bnNum(videos.length) : "";
  document.getElementById("stAlbums").textContent = bnNum(albums.length);
  document.getElementById("stPhotos").textContent = bnNum(photoCount);
  document.getElementById("stVideos").textContent = bnNum(videos.length);
  document.getElementById("stYt").textContent = bnNum(videos.filter(v => v.video.kind === "youtube").length);
  document.getElementById("stFb").textContent = bnNum(videos.filter(v => v.video.kind === "facebook").length);

  const card = (it, img, meta, href) => `
    <article class="gcard">
      <a class="gcard__img${it.type === "video" ? " is-video" : ""}" href="${href}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}${it.type === "video" ? `<span class="gcard__play">${ICON.play}</span>` : ""}</a>
      <div class="gcard__body"><b>${esc(it.title)}</b><span>${meta}</span></div>
      <div class="gcard__act"><a href="${href}" target="_blank" rel="noopener">${ICON.eye}দেখুন</a><button type="button" class="gcard__del" data-gdel="${it.id}">${ICON.trash}ডিলিট</button></div>
    </article>`;
  document.getElementById("gpList").innerHTML = albums.length
    ? albums.map(a => card(a, a.photos[0], `${bnNum(a.photos.length)}টি ছবি · ${timeAgo(a.createdAt)}`, `gallery.html?id=${a.id}`)).join("")
    : `<p class="drow__empty">এখনো কোনো অ্যালবাম নেই।</p>`;
  document.getElementById("gvList").innerHTML = videos.length
    ? videos.map(v => card(v, videoThumb(v), `${v.video.kind === "youtube" ? "YouTube" : "Facebook"} · ${timeAgo(v.createdAt)}`, `videos.html?id=${v.id}`)).join("")
    : `<p class="drow__empty">এখনো কোনো ভিডিও নেই।</p>`;

  document.querySelectorAll("[data-gdel]").forEach(b => b.addEventListener("click", async () => {
    const it = items.find(x => String(x.id) === b.dataset.gdel);
    if (!it) return;
    const isVideo = it.type === "video";
    if (!await askDialog({ title: isVideo ? "ভিডিওটি ডিলিট করবেন?" : "অ্যালবামটি ডিলিট করবেন?",
          message: `“${it.title}” — ${isVideo ? "ভিডিওটি" : `অ্যালবাম ও এর ${bnNum(it.photos.length)}টি ছবি`} স্থায়ীভাবে ডিলিট হবে। এটি আর ফেরানো যাবে না।`,
          okText: "ডিলিট করুন", cancelText: "বাতিল", danger: true })) return;
    b.disabled = true;
    try { await deleteGalleryItem(it.id); }
    catch (err) { b.disabled = false; askDialog({ title: "ডিলিট করা যায়নি", message: err.message }); return; }
    refreshGallery();
  }));
}

setPage(location.hash.slice(1) || "dash");
refreshManageList();
refreshGallery();
}

})();
