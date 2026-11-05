/* =====================================================================
   অ্যাডমিন প্যানেল — খবর পোস্ট, ড্রাফট, এডিট, প্রকাশ ও ডিলিট
   প্যানেলের সব লেখা ইংরেজিতে (ক্লায়েন্টের চাওয়া); খবর, বিভাগ ও এলাকার নাম বাংলাতেই।
   ===================================================================== */
(async () => {
await initStore({ fresh: true });   /* অ্যাডমিনে সবসময় সার্ভার থেকে সরাসরি — সংরক্ষিত কপি নয় */
mountShell(null);

const main = document.getElementById("adminMain");

/* ---------- ছোট সহায়ক ---------------------------------------------------- */
const num = v => Number(v || 0).toLocaleString("en-US");

/* বাংলাদেশ সময়ে তারিখ/সময়ের অংশ */
function dhakaParts(ms, opts) {
  const p = {};
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hourCycle: "h23", ...opts })
      .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  } catch (e) { /* খুব পুরোনো ব্রাউজার */ }
  return p;
}
/* "15:47/30-10" — তালিকার Time কলাম */
const fmtShort = ms => {
  if (!ms) return "";
  const p = dhakaParts(ms, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  return `${p.hour}:${p.minute}/${p.day}-${p.month}`;
};
/* "22:10/04 Nov 2026" — Updated by কলাম */
const fmtLong = ms => {
  if (!ms) return "";
  const p = dhakaParts(ms, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric" });
  return `${p.hour}:${p.minute}/${p.day} ${p.month} ${p.year}`;
};
/* "5 min ago" */
function ago(ms) {
  if (!ms) return "";
  const s = Math.floor((nowMs() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) { const d = Math.floor(s / 86400); return `${d} day${d > 1 ? "s" : ""} ago`; }
  return fmtLong(ms);
}

/* সার্ভার/স্টোরের বাংলা বার্তা → ইংরেজি */
const EN_ERR = [
  [/পাসওয়ার্ড ঠিক নয়/, "Wrong password."],
  [/অনেকবার ভুল/, "Too many wrong attempts — please wait a few minutes and try again."],
  [/আবার লগইন/, "Your session has expired — please log in again."],
  [/শিরোনাম লিখুন/, "Please write a headline."],
  [/বিভাগ বাছাই/, "Please choose a category."],
  [/পোস্ট কনটেন্ট লিখুন/, "Please write the post content."],
  [/অনেক বড়/, "The image is too large."],
  [/ছবি নয়|ছবিটি পাওয়া যায়নি|ছবিটি পড়া যায়নি/, "That file could not be read as an image."],
  [/পাওয়া যায়নি/, "Not found — it may have been deleted already."],
  [/লেখার অনুমতি নেই/, "The server cannot save files — give the data/ and uploads/ folders write permission."],
  [/সাড়া পাওয়া যায়নি|পৌঁছানো যায়নি/, "Could not reach the server."],
  [/জায়গা ফুরিয়ে/, "The browser's storage is full — delete some old posts and try again."],
  [/সংরক্ষণ করা যায়নি|মুছে ফেলা যায়নি/, "The server could not save the change."]
];
const enMsg = m => {
  m = String(m || "");
  for (const [re, t] of EN_ERR) if (re.test(m)) return t;
  return /[ঀ-৿]/.test(m) ? "Something went wrong. Please try again." : (m || "Something went wrong.");
};

/* ---------- পাসওয়ার্ড গেট (যাচাই শুধু সার্ভারে) ------------------------------ */
function renderGate() {
  main.innerHTML = `
    <div class="gate">
      <div class="pass">
        <div class="pass__band"><span>Press pass · Editorial desk</span>${ICON.lock}</div>
        <div class="pass__body">
          <h1>Admin Login</h1>
          <p>${SITE.name} — enter the password to continue.</p>
          <form id="gateForm" novalidate>
            <label class="field"><span class="field__label">Password</span>
              <input type="password" id="gatePass" inputmode="numeric" autocomplete="current-password"></label>
            <p class="gate__err" id="gateErr" role="alert"></p>
            <button class="btn btn--primary" type="submit" style="width:100%" id="gateBtn">${ICON.lock}Log in</button>
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
      err.textContent = enMsg(problem);
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
   cancelText না দিলে শুধু একটি বোতাম (জানানোর জন্য)। ফোকাস শুরুতে "Cancel"-এ থাকে,
   তাই ভুল করে Enter চাপলে কিছু মুছে যায় না; Esc বা বাইরে চাপলে বাতিল।          */
function askDialog({ title, message = "", okText = "OK", cancelText = "", danger = false }) {
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

/* ঘর পূরণের পপআপ — এডিটরের Link/Image/Video/Table/Find ইত্যাদির জন্য।
   fields: [{ name, label, type: text|url|number|file|checkbox, value, placeholder, accept }]
   validate(values) → ভুল থাকলে বার্তা, নইলে ""। ফেরত: values অথবা null (বাতিল)।   */
function askForm({ title, fields, okText = "OK", cancelText = "Cancel", note = "", validate }) {
  return new Promise(resolve => {
    const before = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "adlg";
    wrap.innerHTML = `
      <form class="adlg__box adlg__box--form" role="dialog" aria-modal="true" aria-labelledby="afT" novalidate>
        <h3 id="afT">${esc(title)}</h3>
        ${fields.map(f => f.type === "checkbox"
          ? `<label class="adlg__check"><input type="checkbox" name="${f.name}"${f.value ? " checked" : ""}><span>${esc(f.label)}</span></label>`
          : `<label class="field"><span class="field__label">${esc(f.label)}</span>
              <input name="${f.name}" type="${f.type || "text"}"${f.type === "file" ? ` accept="${esc(f.accept || "")}"` : ` value="${esc(f.value ?? "")}"`}
                placeholder="${esc(f.placeholder || "")}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""} autocomplete="off"></label>`).join("")}
        ${note ? `<p class="adlg__note">${note}</p>` : ""}
        <p class="adlg__err" role="alert"></p>
        <div class="adlg__act">
          <button type="button" class="adlg__btn" data-r="0">${esc(cancelText)}</button>
          <button type="submit" class="adlg__btn adlg__btn--ok">${esc(okText)}</button>
        </div>
      </form>`;
    document.body.appendChild(wrap);
    document.body.classList.add("no-scroll");
    const form = $("form", wrap), errBox = $(".adlg__err", wrap);
    const done = val => {
      removeEventListener("keydown", onKey, true);
      wrap.classList.add("is-out");
      setTimeout(() => wrap.remove(), 160);
      document.body.classList.remove("no-scroll");
      if (before && before.focus) before.focus();
      resolve(val);
    };
    const onKey = e => { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", e => {
      if (e.target.closest('[data-r="0"]') || e.target === wrap) done(null);
    });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const vals = {};
      fields.forEach(f => {
        const el = form.elements[f.name];
        vals[f.name] = f.type === "checkbox" ? el.checked : f.type === "file" ? el.files[0] || null : el.value.trim();
      });
      const problem = validate ? validate(vals) : "";
      if (problem) { errBox.textContent = problem; return; }
      done(vals);
    });
    const first = $("input:not([type=checkbox])", form);
    if (first) first.focus();
  });
}

/* কোণে ছোট বার্তা — "Link copied" ইত্যাদি, নিজে থেকেই মিলিয়ে যায় */
function notify(msg) {
  const el = document.createElement("div");
  el.className = "anote";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("is-out"), 1800);
  setTimeout(() => el.remove(), 2200);
}

/* ---------- এডিটরের বাড়তি আইকন (TinyMCE-এর মতো টুলবার) ------------------- */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const EI = {
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
  alignL: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  alignC: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  alignR: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  alignJ: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  outdent: svg('<path d="M21 6H11M21 10H11M21 14H11M21 18H3"/><path d="M7 8l-4 3 4 3"/><path d="M3 6h4"/>'),
  indent: svg('<path d="M21 6H11M21 10H11M21 14H11M21 18H3"/><path d="M3 8l4 3-4 3"/><path d="M3 6h4"/>'),
  video: svg('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>'),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'),
  strike: svg('<path d="M5 12h14"/><path d="M16 6.5C15 5 13.5 4.5 12 4.5c-2.5 0-4.5 1.3-4.5 3.5 0 1.4.8 2.4 2.3 3"/><path d="M8 17.5c1 1.4 2.5 2 4 2 2.6 0 4.5-1.4 4.5-3.6 0-.8-.2-1.4-.6-1.9"/>'),
  code: svg('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>'),
  source: svg('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13 6l-2 12"/>'),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  print: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M7 14h10v7H7z"/>'),
  file: svg('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'),
  find: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  hr: svg('<path d="M3 12h18"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  sup: svg('<path d="M4 7l8 10M12 7l-8 10"/><path d="M16 9c0-1.5 3.5-1.8 3.5 0 0 1.4-3.5 2.4-3.5 4h4"/>'),
  sub: svg('<path d="M4 5l8 10M12 5l-8 10"/><path d="M16 15c0-1.5 3.5-1.8 3.5 0 0 1.4-3.5 2.4-3.5 4h4"/>'),
  clear: svg('<path d="M6 4h12M12 4l-3 16M4 20l16-16"/>'),
  blocks: svg('<rect x="4" y="4" width="16" height="6" stroke-dasharray="2 2"/><rect x="4" y="14" width="16" height="6" stroke-dasharray="2 2"/>'),
  count: svg('<path d="M4 7h16M4 12h10M4 17h6"/>'),
  scissors: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1L20 20M8.1 15.9L20 4"/>'),
  paste: svg('<rect x="6" y="4" width="12" height="17" rx="1"/><path d="M9 4V2h6v2"/>'),
  selectAll: svg('<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  restore: svg('<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/>')
};

/* সব খবরের তালিকার ধরন — সাইডবারের News Manage-এর ভেতরের লিংকগুলো */
const LIST_VIEWS = {
  all:      { title: "All Posts",       short: "All" },
  live:     { title: "Published Posts", short: "Published" },
  draft:    { title: "Draft Posts",     short: "Drafts" },
  lead:     { title: "Lead Posts",      short: "Lead" },
  breaking: { title: "Breaking News",   short: "Breaking" },
  readmore: { title: "Read More",       short: "Read More" },
  trash:    { title: "Trash",           short: "Trash" }
};
const VIEW_TEST = {
  all: p => !p.trashed,
  live: p => !p.trashed && p.status !== "draft",
  draft: p => !p.trashed && p.status === "draft",
  lead: p => !p.trashed && p.isLead,
  breaking: p => !p.trashed && p.breaking,
  readmore: p => !p.trashed && (p.readMore || []).length > 0,
  trash: p => !!p.trashed
};

/* ---------- অ্যাডমিন প্যানেল --------------------------------------------- */
function renderPanel() {

/* ---------- কোন মোডে চলছে ----------------------------------------------- */
const onServer = storeMode() === "server";
const modeNote = onServer
  ? `<div class="mode mode--server">
       <strong>✓ Server mode — visible on every device</strong>
       Posts are saved on the server. Anything you post here shows on phones and other
       computers too, and it stays until you delete it yourself.
     </div>`
  : `<div class="mode mode--local">
       <strong>⚠ Local mode — posts will not reach other devices</strong>
       Posts are only being saved in <em>this browser</em>. A post made on this PC will
       not show on a phone.
       <span class="mode__why">Reason: ${esc(storeReason())}</span>
       <span class="mode__fix">Fix: upload the site to hosting with PHP, or for testing run
       <code>preview-server.ps1</code> ("Run as Administrator") and open that network address on
       your phone. Details are in the README.</span>
     </div>`;

/* ---------- প্যানেল: বাঁয়ে সাইডবার, ওপরে বার, মাঝে পাতা (ড্যাশবোর্ড/ফর্ম/তালিকা/বিভাগ) ---
   সাইটের হেডার-ফুটার লুকিয়ে অ্যাপের মতো পূর্ণ পর্দার নকশা।                  */
document.body.classList.add("admin-app");
const wave = `<svg class="dcard__wave" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 40 C60 0 90 80 160 55 S300 10 400 50 V90 H0Z" opacity=".22"/>
  <path d="M0 62 C70 30 120 90 200 66 S330 40 400 70 V90 H0Z" opacity=".3"/></svg>`;

/* এডিটরের মেনু (File, Edit, View, Insert, Format, Tools, Table) */
const mItem = (act, label, icon = "", key = "") =>
  `<button type="button" data-act="${act}">${icon || '<i class="ed__noicon"></i>'}<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ""}</button>`;
const MENUS = {
  File: [mItem("newdoc", "New document", EI.file), mItem("preview", "Preview", EI.eye), "<hr>", mItem("print", "Print", EI.print, "Ctrl+P")],
  Edit: [mItem("undo", "Undo", EI.undo, "Ctrl+Z"), mItem("redo", "Redo", EI.redo, "Ctrl+Y"), "<hr>",
         mItem("cut", "Cut", EI.scissors, "Ctrl+X"), mItem("copy", "Copy", ICON.copy, "Ctrl+C"), mItem("paste", "Paste", EI.paste, "Ctrl+V"), "<hr>",
         mItem("selectall", "Select all", EI.selectAll, "Ctrl+A"), mItem("find", "Find and replace", EI.find, "Ctrl+F")],
  View: [mItem("source", "Source code", EI.source), mItem("blocks", "Show blocks", EI.blocks), mItem("fullscreen", "Fullscreen", EI.full, "Ctrl+Shift+F")],
  Insert: [mItem("image", "Image…", EI.image), mItem("link", "Link…", ICON.link, "Ctrl+K"), mItem("video", "Video…", EI.video),
           mItem("table", "Table…", EI.table), "<hr>", mItem("hr", "Horizontal line", EI.hr), mItem("datetime", "Date/time", EI.clock)],
  Format: [mItem("bold", "Bold", ICON.bold, "Ctrl+B"), mItem("italic", "Italic", ICON.italic, "Ctrl+I"), mItem("underline", "Underline", ICON.underline, "Ctrl+U"),
           mItem("strike", "Strikethrough", EI.strike), mItem("sup", "Superscript", EI.sup), mItem("sub", "Subscript", EI.sub),
           mItem("code", "Code", EI.code), mItem("highlight", "Highlight", ICON.highlight), "<hr>",
           mItem("p", "Paragraph"), mItem("h2", "Heading 2", ICON.heading), mItem("h3", "Heading 3", ICON.heading), mItem("h4", "Heading 4", ICON.heading),
           mItem("blockquote", "Blockquote", ICON.quote2), mItem("pre", "Preformatted", EI.code), "<hr>",
           mItem("alignleft", "Align left", EI.alignL), mItem("aligncenter", "Align center", EI.alignC), mItem("alignright", "Align right", EI.alignR),
           mItem("alignjustify", "Justify", EI.alignJ), "<hr>", mItem("clear", "Clear formatting", EI.clear)],
  Tools: [mItem("find", "Find and replace", EI.find), mItem("wordcount", "Word count", EI.count), mItem("source", "Source code", EI.source)],
  Table: [mItem("table", "Insert table…", EI.table), "<hr>", mItem("rowBefore", "Insert row before"), mItem("rowAfter", "Insert row after"),
          mItem("colBefore", "Insert column before"), mItem("colAfter", "Insert column after"), "<hr>",
          mItem("delRow", "Delete row"), mItem("delCol", "Delete column"), mItem("delTable", "Delete table", ICON.trash)]
};
const FORMATS = [["p", "Paragraph"], ["h2", "Heading 2"], ["h3", "Heading 3"], ["h4", "Heading 4"], ["blockquote", "Blockquote"], ["pre", "Preformatted"]];
const PALETTE = ["#000000", "#374151", "#6b7280", "#9ca3af", "#ffffff", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#059669",
                 "#0891b2", "#2563eb", "#1e3a8a", "#fef08a", "#bbf7d0", "#a5f3fc", "#bfdbfe", "#fecaca", "#e5e7eb", "#0f172a"];
const palette = which => `<div class="ed__drop ed__pal" role="menu">${PALETTE.map(c =>
  `<button type="button" data-color="${c}" data-which="${which}" style="background:${c}" title="${c}" aria-label="${c}"></button>`).join("")}
  <button type="button" class="ed__nocolor" data-color="" data-which="${which}">Remove color</button></div>`;
const tb = (act, icon, title) => `<button type="button" class="ed__btn" data-act="${act}" title="${title}" aria-label="${title}">${icon}</button>`;

main.innerHTML = `
<div class="app" id="app" data-page="dash">
  <aside class="app__side" id="appSide" aria-label="Admin menu">
    <a class="app__brand" href="index.html" target="_blank" rel="noopener">${brandMark()}<span><b>${esc(SITE.name)}</b><small>Editorial desk</small></span></a>
    <!-- সাইডবার — চাপলে খোলে এমন দল (Settings, News Manage, Photo/Video Gallery) -->
    <nav class="app__nav">
      <button type="button" data-page="dash">${ICON.home}<span>Dashboard</span></button>
      <div class="app__group">
        <button type="button" class="app__gtoggle" aria-expanded="false">${EI.gear}<span>Settings</span><i class="app__chev">${ICON.chev}</i></button>
        <div class="app__sub">
          <button type="button" data-page="cats"><span>Categories</span></button>
          <button type="button" data-theme-open><span>Theme</span></button>
          <a href="index.html" target="_blank" rel="noopener"><span>View Site</span></a>
          <a href="rss.php" target="_blank" rel="noopener"><span>RSS Feed</span></a>
        </div>
      </div>
      <div class="app__group">
        <button type="button" class="app__gtoggle" aria-expanded="false">${EI.layers}<span>News Manage</span><i class="app__chev">${ICON.chev}</i></button>
        <div class="app__sub">
          <button type="button" data-page="form"><span>Create Post</span></button>
          <button type="button" data-page="list" data-view="all"><span>View All Posts</span><em class="app__count" id="navCount"></em></button>
          <button type="button" data-page="list" data-view="draft"><span>Draft Posts</span><em class="app__count" id="navDrafts"></em></button>
          <button type="button" data-page="list" data-view="lead"><span>Lead Posts</span><em class="app__count" id="navLead"></em></button>
          <button type="button" data-page="list" data-view="breaking"><span>Breaking News</span><em class="app__count" id="navBreaking"></em></button>
          <button type="button" data-page="list" data-view="trash"><span>Trash Post</span><em class="app__count" id="navTrash"></em></button>
          <button type="button" data-page="list" data-view="readmore"><span>Read More</span><em class="app__count" id="navReadMore"></em></button>
        </div>
      </div>
      <div class="app__group">
        <button type="button" class="app__gtoggle" aria-expanded="false">${ICON.image}<span>Photo Gallery</span><em class="app__count" id="navPhotos"></em><i class="app__chev">${ICON.chev}</i></button>
        <div class="app__sub">
          <button type="button" data-page="photos" data-to="gpTitle"><span>Add Album</span></button>
          <button type="button" data-page="photos" data-to="gpList"><span>All Albums</span></button>
        </div>
      </div>
      <div class="app__group">
        <button type="button" class="app__gtoggle" aria-expanded="false">${ICON.play}<span>Video Gallery</span><em class="app__count" id="navVideos"></em><i class="app__chev">${ICON.chev}</i></button>
        <div class="app__sub">
          <button type="button" data-page="videos" data-to="gvUrl"><span>Add Video</span></button>
          <button type="button" data-page="videos" data-to="gvList"><span>All Videos</span></button>
        </div>
      </div>
    </nav>
    <div class="app__sidefoot">
      <span class="app__mode ${onServer ? "is-server" : "is-local"}"><i></i>${onServer ? "Server mode" : "Local mode"}</span>
      <button type="button" id="logoutBtn">${ICON.logout}<span>Log out</span></button>
    </div>
  </aside>
  <div class="app__scrim" id="appScrim"></div>

  <div class="app__main">
    <header class="app__top">
      <button type="button" class="iconbtn app__burger" id="appBurger" aria-label="Open menu">${ICON.menu}</button>
      <span class="app__title" id="appTitle">Dashboard</span>
      <div class="app__actions">
        <button type="button" class="app__act app__act--main" data-go="form">${ICON.plus}<span>Create Post</span></button>
        <button type="button" class="app__act" data-go="list">${ICON.list}<span>All News</span></button>
        <button type="button" class="themebtn" id="appTheme" aria-label="Change theme and colors"><span class="themebtn__icon">${ICON.palette}</span><span class="themebtn__label">Theme</span></button>
        <span class="app__user" title="Admin"><span class="app__avatar">${brandMark()}</span><span>Admin</span></span>
      </div>
    </header>

    <div class="app__content">

    <!-- ড্যাশবোর্ড -->
    <section class="app__page" data-page="dash">
      <h1 class="app__h1">Dashboard</h1>
      <div class="app__alert" id="welcome"><span><b>Welcome!</b> Write posts, edit them and keep an eye on the site's numbers from here.</span>
        <button type="button" aria-label="Close" id="welcomeX">${ICON.close}</button></div>
      ${modeNote}
      <div class="dcards">
        <div class="dcard dcard--a">
          <span class="dcard__label">TOTAL POSTS</span><b class="dcard__num" id="stTotal">–</b>
          <span class="dcard__sub">Published <b id="stLive">–</b> · Drafts <b id="stDraft">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="list" data-f="all">All news</button><button type="button" data-go="list" data-f="draft">Drafts</button><button type="button" data-go="form">Create post</button></div>
        </div>
        <div class="dcard dcard--b">
          <span class="dcard__label">CATEGORIES</span><b class="dcard__num">${num(CATEGORIES.length)}</b>
          <span class="dcard__sub">With posts: <b id="stCatsUsed">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="cats">All categories</button><a href="index.html" target="_blank" rel="noopener">View site</a></div>
        </div>
        <div class="dcard dcard--c">
          <span class="dcard__label">TOTAL VIEWS</span><b class="dcard__num" id="stViews">–</b>
          <span class="dcard__sub">Most viewed: <b id="stTopViews">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-scroll="dashTopWrap">Most viewed</button></div>
        </div>
        <div class="dcard dcard--d">
          <span class="dcard__label">EXCLUSIVE</span><b class="dcard__num" id="stEx">–</b>
          <span class="dcard__sub">Lead posts: <b id="stLead">–</b></span>${wave}
          <div class="dcard__links"><a href="category.html?cat=exclusive" target="_blank" rel="noopener">Exclusive page</a><a href="category.html?cat=investigation" target="_blank" rel="noopener">Investigation</a></div>
        </div>
        <div class="dcard dcard--e">
          <span class="dcard__label">PHOTO GALLERY</span><b class="dcard__num" id="stAlbums">–</b>
          <span class="dcard__sub">Albums · Photos <b id="stPhotos">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="photos">Add album</button><a href="gallery.html" target="_blank" rel="noopener">View on site</a></div>
        </div>
        <div class="dcard dcard--f">
          <span class="dcard__label">VIDEOS</span><b class="dcard__num" id="stVideos">–</b>
          <span class="dcard__sub">YouTube <b id="stYt">–</b> · Facebook <b id="stFb">–</b></span>${wave}
          <div class="dcard__links"><button type="button" data-go="videos">Add video</button><a href="videos.html" target="_blank" rel="noopener">View on site</a></div>
        </div>
      </div>
      <div class="dash2">
        <section class="apanel"><div class="apanel__head">${ICON.clock}Recent posts<button type="button" data-go="list">View all${ICON.arrow}</button></div><div id="dashRecent"></div></section>
        <section class="apanel" id="dashTopWrap"><div class="apanel__head">${ICON.eye}Most viewed</div><div id="dashTop"></div></section>
      </div>
    </section>

    <!-- নতুন পোস্ট — বাঁয়ে লেখা (শিরোনাম, কনটেন্ট), ডানে বাকি সব (ছবি, ড্রপডাউন, বোতাম) -->
    <section class="app__page" data-page="form">
      <div class="toast" id="toast" hidden></div>

      <div class="editing-banner" id="editingBanner" hidden>
        <span>✎ Editing: <strong id="editingTitle"></strong></span>
        <button type="button" id="cancelEdit">Cancel</button>
      </div>

      <form id="postForm" class="pform" novalidate>
        <div class="pform__main apanel">
          <h1 class="pform__h" id="formHeading">Create Post</h1>

          <!-- ফাইল থেকে ফর্ম পূরণ: Google Docs/Word (.docx), .odt, .txt, .md, বা টেনে আনা/পেস্ট করা লেখা -->
          <div class="importbox" id="importBox" tabindex="0" role="button"
               aria-label="Drop a file or text here, or click to choose a file">
            ${ICON.upload}
            <b>Fill the form from a file</b>
            <span>Drop a Google Docs / Word (.docx), .odt, .txt or .md file here — or click to choose one, or paste copied text here (Ctrl+V)</span>
            <small>In the file: first part = Headline, then a blank line, next part = Sub Headline, then the Intro, and everything after that = Post Content. To leave a field empty, write only "-" in that part.</small>
            <input type="file" id="importFile" accept=".docx,.odt,.txt,.md,.markdown,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" hidden>
          </div>
          <div class="importprev" id="importPrev" hidden></div>

          <label class="field">
            <span class="field__label">Headline <i>*</i></span>
            <input type="text" id="fTitle" placeholder="e.g. অক্সিজেন উৎপাদন ০.৪ শতাংশ কমেছে" maxlength="160">
            <span class="field__err" id="eTitle"></span>
          </label>

          <label class="field">
            <span class="field__label">Sub Headline</span>
            <input type="text" id="fSub" placeholder="Optional — shown smaller under the headline" maxlength="220">
          </label>

          <label class="field">
            <span class="field__label">Intro</span>
            <textarea id="fIntro" rows="2" placeholder="Optional — if empty, the start of the post content is used"></textarea>
          </label>

          <div class="field">
            <span class="field__label">Post Content <i>*</i></span>
            <div class="ed" id="rte">
              <nav class="ed__menubar" aria-label="Editor menu">
                ${Object.entries(MENUS).map(([name, items]) => `<div class="ed__dd"><button type="button" class="ed__mbtn" data-dd>${name}</button>
                  <div class="ed__drop" role="menu">${items.join("")}</div></div>`).join("")}
              </nav>
              <div class="ed__tools" role="toolbar" aria-label="Formatting">
                <div class="ed__dd ed__split">${tb("forecolor", `<span class="ed__A">A</span><i class="ed__bar" id="edForeBar"></i>`, "Text color")}<button type="button" class="ed__btn ed__caret" data-dd aria-label="Choose text color"></button>${palette("fore")}</div>
                <div class="ed__dd ed__split">${tb("backcolor", `<span class="ed__A ed__A--bg">A</span><i class="ed__bar" id="edBackBar"></i>`, "Background color")}<button type="button" class="ed__btn ed__caret" data-dd aria-label="Choose background color"></button>${palette("back")}</div>
                <span class="ed__sep"></span>
                ${tb("undo", EI.undo, "Undo")}${tb("redo", EI.redo, "Redo")}
                <span class="ed__sep"></span>
                <div class="ed__dd"><button type="button" class="ed__btn ed__fmt" data-dd><span id="edFmtLabel">Formats</span></button>
                  <div class="ed__drop" role="menu">${FORMATS.map(([t, l]) => `<button type="button" data-act="${t}" class="ed__fmtitem ed__fmtitem--${t}">${l}</button>`).join("")}</div></div>
                <span class="ed__sep"></span>
                ${tb("bold", ICON.bold, "Bold")}${tb("italic", ICON.italic, "Italic")}
                <span class="ed__sep"></span>
                ${tb("alignleft", EI.alignL, "Align left")}${tb("aligncenter", EI.alignC, "Align center")}${tb("alignright", EI.alignR, "Align right")}${tb("alignjustify", EI.alignJ, "Justify")}
                <span class="ed__sep"></span>
                ${tb("ul", ICON.ul, "Bullet list")}${tb("ol", ICON.ol, "Numbered list")}
                <span class="ed__sep"></span>
                ${tb("outdent", EI.outdent, "Decrease indent")}${tb("indent", EI.indent, "Increase indent")}
                <span class="ed__sep"></span>
                ${tb("link", ICON.link, "Insert/edit link")}${tb("image", EI.image, "Insert image")}${tb("video", EI.video, "Insert video")}
              </div>
              <div class="rte__box" id="fBody" contenteditable="true" spellcheck="false"
                   data-placeholder="Write the full story here. Press Enter for a new paragraph."></div>
              <textarea class="ed__source" id="fSource" hidden spellcheck="false" aria-label="HTML source"></textarea>
              <div class="ed__status"><span id="edPath">p</span><span id="rteCount">0 words</span></div>
            </div>
            <span class="field__err" id="eBody"></span>
          </div>
        </div>

        <aside class="pform__side apanel">
          <div class="field">
            <span class="field__label">Featured Image</span>
            <label class="drop" id="drop">
              <input type="file" id="fImage" accept="image/*">
              ${ICON.image}
              <b>Choose an image or drop it here</b>
              <span class="field__hint">Suggested size: 640 × 360px. Without one, a colored background is used.</span>
            </label>
            <span class="field__err" id="eImage"></span>
          </div>

          <div class="preview" id="preview" hidden>
            <img id="previewImg" alt="Selected image preview">
            <button class="preview__x" type="button" id="clearImg">Remove image</button>
          </div>

          <label class="field">
            <span class="field__label">Featured Image Caption</span>
            <input type="text" id="fCaption" placeholder="Optional" maxlength="200">
          </label>

          <label class="field">
            <span class="field__label">Reporter Name</span>
            <input type="text" id="fAuthor" placeholder="নিজস্ব প্রতিবেদক" maxlength="80">
          </label>

          <label class="field">
            <span class="field__label">Keywords</span>
            <input type="text" id="fKeywords" placeholder="Separate with commas, e.g. বাজেট, অর্থনীতি">
          </label>

          <label class="field">
            <span class="field__label">Category <i>*</i></span>
            <select id="fCat">
              <option value="" hidden selected>Select Category</option>
              ${CATEGORIES.map(c => `<option value="${c.slug}">${c.name}</option>`).join("")}
            </select>
            <span class="field__err" id="eCat"></span>
          </label>

          <label class="field">
            <span class="field__label">Sub Category</span>
            <select id="fSubcat" disabled>
              <option value="" hidden selected>Select Sub Category</option>
            </select>
          </label>

          <div class="field-row field-row--3">
            <label class="field">
              <span class="field__label">Division</span>
              <select id="fDivision">
                <option value="" hidden selected>Select Division</option>
                <option value="">None</option>
                ${BD_DIVISIONS.map(d => `<option value="${d.slug}">${d.name}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__label">District</span>
              <select id="fDistrict" disabled>
                <option value="" hidden selected>Select District</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">Upazila</span>
              <select id="fUpazila" disabled>
                <option value="" hidden selected>Select Upazila</option>
              </select>
            </label>
          </div>

          <label class="field">
            <span class="field__label">Facebook Share Banner</span>
            <select id="fShare">
              <option value="banner" selected>Banner</option>
              <option value="photo">Photo only</option>
              <option value="site">Site card</option>
            </select>
            <span class="field__hint" id="shareHint"></span>
          </label>
          <div class="sharepv" id="sharePv" hidden><img id="sharePvImg" alt="What Facebook will show"></div>

          <div class="field">
            <span class="field__label">Read More</span>
            <input type="text" id="fRm1" list="rmList" placeholder="Post ID or headline (optional)" autocomplete="off">
            <input type="text" id="fRm2" list="rmList" placeholder="Second post (optional)" autocomplete="off">
            <datalist id="rmList"></datalist>
            <span class="field__hint">The two “আরও পড়ুন” links at the end of this post. Leave empty to pick them automatically (same category first).</span>
            <span class="field__err" id="eReadMore"></span>
          </div>

          <div class="pchecks">
            <label class="pcheck"><span>Exclusive</span><input type="checkbox" id="fExclusive"></label>
            <label class="pcheck"><span>Breaking News</span><input type="checkbox" id="fBreaking"></label>
            <label class="pcheck"><span>Is Lead?</span><input type="checkbox" id="fLead"></label>
            <div class="leadpos" id="leadPosBox" hidden>
              <label class="leadpos__label" for="fLeadPos">Top news position</label>
              <div class="stepper">
                <button type="button" data-step="-1" aria-label="Lower number (higher up)">−</button>
                <input type="number" id="fLeadPos" min="1" max="${LEAD_SLOTS}" value="1" step="1" inputmode="numeric">
                <button type="button" data-step="1" aria-label="Higher number (further down)">+</button>
              </div>
              <small class="leadpos__hint" id="leadPosHint"></small>
            </div>
            <label class="pcheck"><span>RSS</span><input type="checkbox" id="fRss" checked></label>
          </div>
          <p class="field__hint pchecks__hint"><b>Is Lead?</b> pins this post to a top-news position on the homepage: 1 is the big top story,
            2–5 are the four beside it, 6–9 the row below. <b>Breaking News</b> shows it in the running headline bar at the top of the homepage.
            <b>RSS</b> includes it in the site's news feed (<a href="rss.php" target="_blank" rel="noopener">rss.php</a>), which apps and other sites read.</p>

          <div class="pbtns">
            <button class="pbtn pbtn--create" type="submit" id="postBtn" data-status="published">Create Post</button>
            <button class="pbtn pbtn--draft" type="submit" id="draftBtn" data-status="draft">Save as Draft</button>
          </div>
        </aside>
      </form>
    </section>

    <!-- সব খবর — টেবিল: ID, Headline, Time, Publisher, Updated by, Category, Total Hit, Action -->
    <section class="app__page" data-page="list">
      <div class="apanel plist">
        <div class="plist__head">
          <h1 class="plist__title">${ICON.grid}<span id="plistTitle">All Posts</span></h1>
          <form class="pgroup pgroup--green" id="pSearchForm" role="search">
            <input type="search" id="mSearch" placeholder="Post ID, Headline or Text" aria-label="Search posts">
            <button type="submit">Submit</button>
          </form>
          <form class="pgroup pgroup--blue" id="pCatForm">
            <select id="mCat" aria-label="Category">
              <option value="">Category</option>
              ${CATEGORIES.map(c => `<option value="${c.slug}">${c.name}</option>`).join("")}
            </select>
            <select id="mStatus" aria-label="Show" class="pgroup__status">
              ${Object.entries(LIST_VIEWS).map(([v, t]) => `<option value="${v}">${t.short}</option>`).join("")}
            </select>
            <button type="submit">Submit</button>
          </form>
          <button type="button" class="pcreate" data-go="form">${ICON.plus}Create Post</button>
        </div>
        <p class="plist__count" id="pCount"></p>
        <div class="ptable-wrap">
          <table class="ptable">
            <thead><tr><th>ID</th><th>Headline</th><th>Time</th><th>Publisher</th><th>Updated by</th><th>Category</th><th>Total Hit</th><th>Action</th></tr></thead>
            <tbody id="pBody"><tr><td colspan="8" class="ptable__empty">Loading…</td></tr></tbody>
          </table>
        </div>
        <nav class="pager" id="pPager" aria-label="Pages"></nav>
      </div>
    </section>

    <!-- সব বিভাগ -->
    <section class="app__page" data-page="cats">
      <h1 class="app__h1">Categories</h1>
      <div class="apanel"><div id="catTable"></div></div>
    </section>

    <!-- ফটো গ্যালারি -->
    <section class="app__page" data-page="photos">
      <h1 class="app__h1">Photo Gallery</h1>
      <div class="apanel gform">
        <div class="apanel__head">${ICON.plus}New album</div>
        <div class="toast" id="gpToast" hidden></div>
        <label class="field"><span class="field__label">Title <i>*</i></span>
          <input type="text" id="gpTitle" maxlength="200" placeholder="e.g. বিজয় দিবসের কুচকাওয়াজ"></label>
        <label class="field"><span class="field__label">Caption</span>
          <textarea id="gpCaption" rows="2" maxlength="500" placeholder="Optional — a short description of the album"></textarea></label>
        <div class="field"><span class="field__label">Photos <i>*</i></span>
          <label class="drop">${ICON.image}<b>Drop photos here, or click to choose</b>
            <span class="field__hint">You can pick many at once (up to 40). Large photos are resized automatically.</span>
            <input type="file" id="gpFiles" accept="image/*" multiple></label>
          <div class="gpicked" id="gpPicked"></div>
        </div>
        <div class="admin__actions"><button type="button" class="btn btn--primary" id="gpSave">${ICON.check}Publish album</button></div>
      </div>
      <div class="ggrid" id="gpList"></div>
    </section>

    <!-- ভিডিও গ্যালারি -->
    <section class="app__page" data-page="videos">
      <h1 class="app__h1">Video Gallery</h1>
      <div class="apanel gform">
        <div class="apanel__head">${ICON.plus}New video</div>
        <div class="toast" id="gvToast" hidden></div>
        <label class="field"><span class="field__label">Video link <i>*</i></span>
          <input type="url" id="gvUrl" placeholder="https://www.youtube.com/watch?v=... or a Facebook video link">
          <span class="field__hint" id="gvCheck">Paste a YouTube (Shorts too) or Facebook video link.</span></label>
        <div class="gvprev" id="gvPrev" hidden></div>
        <label class="field"><span class="field__label">Title <i>*</i></span>
          <input type="text" id="gvTitle" maxlength="200" placeholder="Video title"></label>
        <label class="field"><span class="field__label">Caption</span>
          <textarea id="gvCaption" rows="2" maxlength="500" placeholder="Optional"></textarea></label>
        <label class="field"><span class="field__label">Custom thumbnail</span>
          <input type="file" id="gvThumb" accept="image/*">
          <span class="field__hint">Optional — YouTube thumbnails come automatically; a picture helps Facebook videos look better.</span></label>
        <div class="admin__actions"><button type="button" class="btn btn--primary" id="gvSave">${ICON.check}Publish video</button></div>
      </div>
      <div class="ggrid" id="gvList"></div>
    </section>

    </div>
    <footer class="app__foot"><span>© ${dhakaToday().getFullYear()} <b>${esc(SITE.name)}</b> | All rights reserved</span><span>Editorial desk</span></footer>
  </div>
</div>`;

/* ---------- লগআউট ------------------------------------------------------- */
document.getElementById("logoutBtn").addEventListener("click", () => {
  logOut();
  location.href = "index.html";
});

/* ---------- পাতা বদল (সাইডবার/ওপরের বোতাম) — ঠিকানায় #form, #list... থাকে -------- */
const app = document.getElementById("app");
const PAGE_TITLES = { dash: "Dashboard", form: "Create Post", list: "All News", cats: "Categories", photos: "Photo Gallery", videos: "Video Gallery" };
/* name = পাতা; view = সব খবরের কোন তালিকা (all, draft, lead, breaking, trash, readmore…)।
   ঠিকানায় থাকে #form, #list, #list/draft ইত্যাদি — রিফ্রেশ করলেও একই পাতা খোলে। */
function setPage(name, view) {
  if (!PAGE_TITLES[name]) name = "dash";
  if (name === "list") setListView(LIST_VIEWS[view] ? view : listStatus);
  app.dataset.page = name;
  document.getElementById("appTitle").textContent = name === "form" && editingId ? "Edit Post"
    : name === "list" ? LIST_VIEWS[listStatus].title : PAGE_TITLES[name];
  $$(".app__nav [data-page]").forEach(b => b.classList.toggle("is-on",
    b.dataset.page === name && (name !== "list" || (b.dataset.view || "all") === listStatus)));
  $$(".app__group").forEach(g => { if (g.querySelector(".is-on")) openGroup(g, true); });
  if (name === "form") fillReadMoreList();
  const hash = name === "list" && listStatus !== "all" ? `list/${listStatus}` : name;
  if (location.hash.slice(1) !== hash) history.replaceState(null, "", "#" + hash);
  closeSide();
  scrollTo({ top: 0 });
}

/* সাইডবারের দল খোলা/বন্ধ */
function openGroup(g, on) {
  g.classList.toggle("is-open", on);
  $(".app__gtoggle", g).setAttribute("aria-expanded", String(on));
}
$$(".app__gtoggle").forEach(t => t.addEventListener("click", () => {
  const g = t.closest(".app__group");
  openGroup(g, !g.classList.contains("is-open"));
}));
$$(".app__nav [data-page]").forEach(b => b.addEventListener("click", () => {
  setPage(b.dataset.page, b.dataset.view);
  if (b.dataset.to) {
    const el = document.getElementById(b.dataset.to);
    setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "center" }); if (el.focus) el.focus({ preventScroll: true }); }, 60);
  }
}));
$$("[data-theme-open]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); closeSide(); document.getElementById("appTheme").click(); }));
app.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) setPage(go.dataset.go, go.dataset.f);
  const sc = e.target.closest("[data-scroll]");
  if (sc) document.getElementById(sc.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
});

/* মোবাইলে সাইডবার ড্রয়ার */
const scrim = document.getElementById("appScrim");
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

/* =====================================================================
   পোস্ট এডিটর — TinyMCE-এর মতো: ওপরে মেনু (File … Table), তার নিচে টুলবার,
   নিচে স্ট্যাটাস বার (কোন ট্যাগে আছি · শব্দসংখ্যা)। সাধারণ ব্রাউজার execCommand
   দিয়ে চলে, বাইরের কোনো লাইব্রেরি লাগে না। যা লেখা হয় তা সংরক্ষণের আগে
   sanitizeRichHtml() দিয়ে ছাঁকা হয় — সার্ভারও আবার ছাঁকে।
   ===================================================================== */
const ed = document.getElementById("rte");
const rteBox = document.getElementById("fBody");
const rteSource = document.getElementById("fSource");
const rteCount = document.getElementById("rteCount");
const edPath = document.getElementById("edPath");
const edFmtLabel = document.getElementById("edFmtLabel");
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* পুরোনো ব্রাউজার */ }

/* কার্সরের জায়গা মনে রাখা — পপআপ খুললে এডিটর থেকে ফোকাস চলে যায় */
let savedRange = null;
const inEditor = node => node && rteBox.contains(node);
function saveSel() {
  const s = getSelection();
  if (s.rangeCount && inEditor(s.getRangeAt(0).commonAncestorContainer)) savedRange = s.getRangeAt(0).cloneRange();
}
function restoreSel() {
  const s0 = getSelection();
  if (document.activeElement === rteBox && s0.rangeCount && inEditor(s0.getRangeAt(0).commonAncestorContainer)) return;   /* কার্সর এডিটরেই আছে */
  rteBox.focus();
  if (savedRange && inEditor(savedRange.commonAncestorContainer)) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }
}

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

/* রং ও লেখা সাজানো CSS স্টাইলে হয় (style="color:…"), বাকি সব সাধারণ ট্যাগে (<b>, <i>…) —
   নইলে মোটা লেখা <span style="font-weight">-এ চলে যেত, যা সংরক্ষণে টেকে না */
const CSS_CMDS = new Set(["foreColor", "hiliteColor", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"]);
function exec(cmd, val = null) {
  restoreSel();
  document.execCommand("styleWithCSS", false, CSS_CMDS.has(cmd));
  document.execCommand(cmd, false, val);
  changed();
}

/* হাইলাইট: বাছাই করা লেখা <mark>-এ মোড়ানো; হাইলাইটের ভেতরে চাপলে সরিয়ে দেয় */
function toggleWrap(tag) {
  const el = closestInEditor(tag.toUpperCase());
  if (el) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.remove();
    changed();
    return;
  }
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const box = document.createElement("div");
  box.appendChild(sel.getRangeAt(0).cloneContents());
  exec("insertHTML", `<${tag}>${box.innerHTML}</${tag}>`);
}

/* ইনডেন্ট: তালিকায় তালিকা ভেতরে/বাইরে; অন্য অনুচ্ছেদে বাঁয়ে ৪০px করে জায়গা */
function blocksInSelection() {
  const s = getSelection();
  if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  const all = Array.from(rteBox.querySelectorAll("p,h2,h3,h4,div,blockquote,pre")).filter(el => r.intersectsNode(el));
  return all.filter(el => !all.some(o => o !== el && el.contains(o)));
}
function indentBy(dir) {
  restoreSel();
  if (closestInEditor("LI")) { exec(dir > 0 ? "indent" : "outdent"); return; }
  let blocks = blocksInSelection();
  if (!blocks.length) { exec("formatBlock", "p"); blocks = blocksInSelection(); }
  blocks.forEach(b => {
    const v = Math.max(0, Math.min(400, (parseInt(b.style.paddingLeft, 10) || 0) + dir * 40));
    b.style.paddingLeft = v ? `${v}px` : "";
    if (!b.getAttribute("style")) b.removeAttribute("style");
  });
  changed();
}

/* টেবিলের সারি/কলাম যোগ-বিয়োগ — কার্সর যে ঘরে আছে তার হিসাবে */
function tableOp(op) {
  const cell = closestInEditor("TD") || closestInEditor("TH");
  if (!cell) { askDialog({ title: "Put the cursor inside a table first" }); return; }
  const row = cell.parentNode, table = cell.closest("table"), idx = Array.from(row.children).indexOf(cell);
  if (op === "rowBefore" || op === "rowAfter") {
    const nr = row.cloneNode(true);
    nr.querySelectorAll("td,th").forEach(c => { c.innerHTML = "<br>"; });
    row.parentNode.insertBefore(nr, op === "rowBefore" ? row : row.nextSibling);
  }
  if (op === "colBefore" || op === "colAfter") {
    table.querySelectorAll("tr").forEach(tr => {
      const ref = tr.children[idx];
      const nc = document.createElement(ref ? ref.tagName.toLowerCase() : "td");
      nc.innerHTML = "<br>";
      if (!ref) tr.appendChild(nc);
      else tr.insertBefore(nc, op === "colBefore" ? ref : ref.nextSibling);
    });
  }
  if (op === "delRow") { row.remove(); if (!table.querySelector("tr")) table.remove(); }
  if (op === "delCol") {
    table.querySelectorAll("tr").forEach(tr => { if (tr.children[idx]) tr.children[idx].remove(); });
    if (!table.querySelector("td,th")) table.remove();
  }
  if (op === "delTable") table.remove();
  changed();
}

/* ছবি: সার্ভারে আপলোড করে ঠিকানাটি বসানো (লোকাল মোডে ছবি নিজেই) */
async function insertImageFiles(files, alt = "") {
  for (const f of files) {
    if (!f || !/^image\//.test(f.type)) continue;
    try {
      const url = await uploadImage(await fileToImage(f, 1200));
      exec("insertHTML", `<img src="${esc(url)}" alt="${esc(alt)}"><p><br></p>`);
    } catch (err) {
      showToast(enMsg(err.message), false);
    }
  }
}

async function insertLink() {
  saveSel();
  const a = closestInEditor("A");
  const sel = getSelection();
  const hasText = sel.rangeCount && !sel.isCollapsed;
  const vals = await askForm({
    title: a ? "Edit link" : "Insert link",
    fields: [
      { name: "url", label: "URL", type: "url", value: a ? a.getAttribute("href") : "", placeholder: "https://…" },
      ...(hasText || a ? [] : [{ name: "text", label: "Text to display", placeholder: "Link text" }])
    ],
    okText: a ? "Update" : "Insert",
    validate: v => /^(https?:\/\/|mailto:)\S+$/i.test(v.url) ? "" : "Enter a link that starts with http://, https:// or mailto:"
  });
  if (!vals) return;
  restoreSel();
  if (a) { a.setAttribute("href", vals.url); changed(); return; }
  if (hasText) exec("createLink", vals.url);
  else exec("insertHTML", `<a href="${esc(vals.url)}">${esc(vals.text || vals.url)}</a>&nbsp;`);
}

async function insertImage() {
  saveSel();
  const vals = await askForm({
    title: "Insert image",
    fields: [
      { name: "file", label: "Upload from computer", type: "file", accept: "image/*" },
      { name: "url", label: "…or image address (https://)", type: "url", placeholder: "https://…" },
      { name: "alt", label: "Image description (alt text)", placeholder: "Optional" }
    ],
    okText: "Insert",
    validate: v => v.file || /^https:\/\/\S+$/i.test(v.url) ? "" : "Choose an image file, or enter an address that starts with https://"
  });
  if (!vals) return;
  if (vals.file) await insertImageFiles([vals.file], vals.alt);
  else exec("insertHTML", `<img src="${esc(vals.url)}" alt="${esc(vals.alt)}"><p><br></p>`);
}

async function insertVideo() {
  saveSel();
  const vals = await askForm({
    title: "Insert video",
    fields: [{ name: "url", label: "YouTube or Facebook video link", type: "url", placeholder: "https://www.youtube.com/watch?v=…" }],
    okText: "Insert",
    validate: v => parseVideoLink(v.url) ? "" : "This link isn't recognised — use a YouTube or Facebook video link."
  });
  if (!vals) return;
  const v = parseVideoLink(vals.url);
  const src = v.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${v.id}`
    : `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.url)}&show_text=false`;
  exec("insertHTML", `<iframe src="${esc(src)}" allowfullscreen loading="lazy" frameborder="0"></iframe><p><br></p>`);
}

async function insertTable() {
  saveSel();
  const vals = await askForm({
    title: "Insert table",
    fields: [
      { name: "rows", label: "Rows", type: "number", value: 3, min: 1, max: 30 },
      { name: "cols", label: "Columns", type: "number", value: 3, min: 1, max: 10 },
      { name: "head", label: "First row is a header", type: "checkbox", value: true }
    ],
    okText: "Insert",
    validate: v => (+v.rows >= 1 && +v.rows <= 30 && +v.cols >= 1 && +v.cols <= 10) ? "" : "Use 1–30 rows and 1–10 columns."
  });
  if (!vals) return;
  const rows = +vals.rows, cols = +vals.cols;
  const cells = tag => `<tr>${`<${tag}><br></${tag}>`.repeat(cols)}</tr>`;
  const head = vals.head ? `<thead>${cells("th")}</thead>` : "";
  const body = cells("td").repeat(vals.head ? Math.max(1, rows - 1) : rows);
  exec("insertHTML", `<table>${head}<tbody>${body}</tbody></table><p><br></p>`);
}

async function findReplace() {
  saveSel();
  const vals = await askForm({
    title: "Find and replace",
    fields: [
      { name: "find", label: "Find" },
      { name: "repl", label: "Replace with" },
      { name: "cs", label: "Match case", type: "checkbox" }
    ],
    okText: "Replace all",
    validate: v => v.find ? "" : "Type the text to find."
  });
  if (!vals) return;
  const re = new RegExp(vals.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), vals.cs ? "g" : "gi");
  let count = 0;
  const walker = document.createTreeWalker(rteBox, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const next = t.nodeValue.replace(re, () => { count++; return vals.repl; });
    if (next !== t.nodeValue) t.nodeValue = next;
  }
  changed();
  askDialog({ title: count ? `Replaced ${num(count)} time${count > 1 ? "s" : ""}` : "Nothing found",
              message: count ? "" : `“${vals.find}” isn't in the post content.` });
}

function wordStats() {
  const text = (rteBox.textContent || "").trim();
  return {
    words: text ? text.split(/\s+/).filter(Boolean).length : 0,
    chars: text.length,
    charsNoSpace: text.replace(/\s/g, "").length,
    paras: rteBox.querySelectorAll("p,h2,h3,h4,li,blockquote,pre").length || (text ? 1 : 0)
  };
}

/* পূর্বরূপ — সাইটে যেমন দেখাবে (খবরের পাতার লেখার নকশায়) */
function showPreview() {
  const wrap = document.createElement("div");
  wrap.className = "adlg";
  const title = document.getElementById("fTitle").value.trim();
  wrap.innerHTML = `<div class="adlg__box adlg__box--wide" role="dialog" aria-modal="true" aria-label="Preview">
    <div class="adlg__bar"><b>Preview</b><button type="button" class="adlg__x" aria-label="Close">${ICON.close}</button></div>
    <div class="adlg__scroll">${title ? `<h1 class="story__title">${esc(title)}</h1>` : ""}
      <div class="story__text">${sanitizeRichHtml(rteBox.innerHTML) || "<p><em>Nothing written yet.</em></p>"}</div></div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("no-scroll");
  const close = () => { wrap.remove(); document.body.classList.remove("no-scroll"); removeEventListener("keydown", onKey, true); };
  const onKey = e => { if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", e => { if (e.target === wrap || e.target.closest(".adlg__x")) close(); });
}

function printContent() {
  const w = window.open("", "_blank");
  if (!w) return;
  const title = esc(document.getElementById("fTitle").value.trim() || SITE.name);
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:"Noto Serif Bengali",serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.8}img,iframe{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px}</style>
    </head><body><h1>${title}</h1>${sanitizeRichHtml(rteBox.innerHTML)}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/* HTML সোর্স দেখা/বদলানো — ফিরে এলে লেখা আবার ছাঁকা হয় */
function toggleSource() {
  const on = !ed.classList.contains("is-source");
  if (on) {
    rteSource.value = sanitizeRichHtml(rteBox.innerHTML).replace(/(<\/(p|h2|h3|h4|li|ul|ol|blockquote|pre|table|tr|thead|tbody)>)/g, "$1\n");
    rteSource.style.height = `${Math.max(rteBox.offsetHeight, 360)}px`;
  } else {
    rteBox.innerHTML = sanitizeRichHtml(rteSource.value);
  }
  ed.classList.toggle("is-source", on);
  rteSource.hidden = !on;
  rteBox.hidden = on;
  (on ? rteSource : rteBox).focus();
  changed();
}
const syncSource = () => { if (ed.classList.contains("is-source")) toggleSource(); };

const ACT = {
  newdoc: async () => {
    if (rteBox.textContent.trim() && !await askDialog({ title: "Start a new document?", message: "Everything in Post Content will be cleared.",
      okText: "Clear", cancelText: "Cancel", danger: true })) return;
    rteBox.innerHTML = ""; changed(); rteBox.focus();
  },
  preview: showPreview, print: printContent,
  undo: () => exec("undo"), redo: () => exec("redo"),
  cut: () => exec("cut"), copy: () => exec("copy"),
  paste: async () => {
    saveSel();
    try { const t = await navigator.clipboard.readText(); exec("insertText", t); }
    catch (e) { askDialog({ title: "Use Ctrl+V to paste", message: "Your browser doesn't allow pasting from the menu — click in the editor and press Ctrl+V." }); }
  },
  selectall: () => { rteBox.focus(); const r = document.createRange(); r.selectNodeContents(rteBox); const s = getSelection(); s.removeAllRanges(); s.addRange(r); saveSel(); },
  find: findReplace,
  source: toggleSource,
  blocks: () => ed.classList.toggle("ed--blocks"),
  fullscreen: () => { ed.classList.toggle("is-full"); document.body.classList.toggle("no-scroll", ed.classList.contains("is-full")); rteBox.focus(); },
  image: insertImage, link: insertLink, video: insertVideo, table: insertTable,
  hr: () => exec("insertHorizontalRule"),
  datetime: () => exec("insertText", `${bnToday()} · ${bnBongabdo()}`),
  bold: () => exec("bold"), italic: () => exec("italic"), underline: () => exec("underline"),
  strike: () => exec("strikeThrough"), sup: () => exec("superscript"), sub: () => exec("subscript"),
  code: () => { restoreSel(); toggleWrap("code"); }, highlight: () => { restoreSel(); toggleWrap("mark"); },
  p: () => exec("formatBlock", "p"), h2: () => exec("formatBlock", "h2"), h3: () => exec("formatBlock", "h3"),
  h4: () => exec("formatBlock", "h4"), blockquote: () => exec("formatBlock", "blockquote"), pre: () => exec("formatBlock", "pre"),
  alignleft: () => exec("justifyLeft"), aligncenter: () => exec("justifyCenter"),
  alignright: () => exec("justifyRight"), alignjustify: () => exec("justifyFull"),
  ul: () => exec("insertUnorderedList"), ol: () => exec("insertOrderedList"),
  indent: () => indentBy(1), outdent: () => indentBy(-1),
  clear: () => { exec("removeFormat"); exec("formatBlock", "p"); },
  wordcount: () => { const s = wordStats(); askDialog({ title: "Word count",
    message: `Words: ${num(s.words)} · Characters: ${num(s.chars)} · Without spaces: ${num(s.charsNoSpace)} · Paragraphs: ${num(s.paras)}` }); },
  forecolor: () => exec("foreColor", lastColor.fore), backcolor: () => exec("hiliteColor", lastColor.back),
  rowBefore: () => tableOp("rowBefore"), rowAfter: () => tableOp("rowAfter"), colBefore: () => tableOp("colBefore"),
  colAfter: () => tableOp("colAfter"), delRow: () => tableOp("delRow"), delCol: () => tableOp("delCol"), delTable: () => tableOp("delTable")
};

/* শেষ বাছাই করা রং — রঙের বোতাম চাপলেই সেটি বসে, পাশের তীর দিয়ে অন্য রং */
const lastColor = { fore: "#dc2626", back: "#fef08a" };
const paintBars = () => {
  document.getElementById("edForeBar").style.background = lastColor.fore;
  document.getElementById("edBackBar").style.background = lastColor.back;
};
paintBars();

const closeDrops = except => $$(".ed__dd.is-open", ed).forEach(d => { if (d !== except) d.classList.remove("is-open"); });
/* বোতাম চাপলে এডিটরের বাছাই করা লেখা যেন হারিয়ে না যায় */
ed.addEventListener("mousedown", e => { if (e.target.closest("button")) e.preventDefault(); });
ed.addEventListener("click", e => {
  const dd = e.target.closest("[data-dd]");
  if (dd) {
    const box = dd.closest(".ed__dd");
    closeDrops(box);
    box.classList.toggle("is-open");
    return;
  }
  const sw = e.target.closest("[data-color]");
  if (sw) {
    closeDrops();
    const which = sw.dataset.which, c = sw.dataset.color;
    if (c) { lastColor[which] = c; paintBars(); }
    exec(which === "fore" ? "foreColor" : "hiliteColor", c || (which === "fore" ? "inherit" : "transparent"));
    return;
  }
  const b = e.target.closest("[data-act]");
  if (b && ACT[b.dataset.act]) {
    closeDrops();
    if (ed.classList.contains("is-source") && b.dataset.act !== "source" && b.dataset.act !== "fullscreen") return;
    ACT[b.dataset.act]();
  }
});
document.addEventListener("click", e => { if (!ed.contains(e.target)) closeDrops(); });

/* কিবোর্ড শর্টকাট (Ctrl+B/I/U/Z ব্রাউজার নিজেই করে) */
rteBox.addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "k") { e.preventDefault(); insertLink(); }
  else if (k === "f" && e.shiftKey) { e.preventDefault(); ACT.fullscreen(); }
  else if (k === "f") { e.preventDefault(); findReplace(); }
  else if (k === "y") { e.preventDefault(); exec("redo"); }
  else if (k === "p") { e.preventDefault(); printContent(); }
});
addEventListener("keydown", e => { if (e.key === "Escape" && ed.classList.contains("is-full")) ACT.fullscreen(); });

/* পেস্ট: Word/ওয়েবসাইট থেকে আনা লেখা ছেঁকে বসে; ছবি পেস্ট করলে আপলোড হয় */
rteBox.addEventListener("paste", e => {
  const files = Array.from(e.clipboardData.files || []).filter(f => /^image\//.test(f.type));
  if (files.length) { e.preventDefault(); saveSel(); insertImageFiles(files); return; }
  const html = e.clipboardData.getData("text/html");
  if (!html) return;
  e.preventDefault();
  const clean = sanitizeRichHtml(html.replace(/<!--[\s\S]*?-->/g, "")).replace(/<img[^>]+src="data:[^"]*"[^>]*>/gi, "");
  exec("insertHTML", clean);
});
/* ছবি টেনে এনে এডিটরে ছাড়লে — যেখানে ছাড়া হলো সেখানেই বসে */
rteBox.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
rteBox.addEventListener("drop", e => {
  const files = Array.from(e.dataTransfer.files || []).filter(f => /^image\//.test(f.type));
  if (!files.length) return;
  e.preventDefault();
  const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
  if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  saveSel();
  insertImageFiles(files);
});

/* স্ট্যাটাস বার: কার্সর কোন ট্যাগে (p » strong), টুলবারে কোনটি চালু, শব্দসংখ্যা */
const FMT_NAMES = { P: "Paragraph", H2: "Heading 2", H3: "Heading 3", H4: "Heading 4", BLOCKQUOTE: "Blockquote", PRE: "Preformatted" };
function updateState() {
  const s = getSelection();
  if (!s.rangeCount || !inEditor(s.getRangeAt(0).commonAncestorContainer)) return;
  const path = [];
  let block = "";
  for (let n = s.getRangeAt(0).commonAncestorContainer; n && n !== rteBox; n = n.parentNode) {
    if (n.nodeType === 1) { path.unshift(n.tagName.toLowerCase()); if (!block && FMT_NAMES[n.tagName]) block = n.tagName; }
  }
  edPath.textContent = path.join(" » ") || "p";
  edFmtLabel.textContent = FMT_NAMES[block] || "Formats";
  const st = c => { try { return document.queryCommandState(c); } catch (e) { return false; } };
  const on = { bold: st("bold"), italic: st("italic"), alignleft: st("justifyLeft"), aligncenter: st("justifyCenter"),
               alignright: st("justifyRight"), alignjustify: st("justifyFull"), ul: st("insertUnorderedList"), ol: st("insertOrderedList") };
  $$(".ed__tools [data-act]", ed).forEach(b => { if (b.dataset.act in on) b.classList.toggle("is-on", !!on[b.dataset.act]); });
}
document.addEventListener("selectionchange", () => { saveSel(); updateState(); });

function updateCount() {
  const w = wordStats().words;
  rteCount.textContent = `${num(w)} word${w === 1 ? "" : "s"}`;
  rteBox.classList.toggle("is-empty", !rteBox.textContent.trim() && !rteBox.querySelector("img,iframe,table,hr"));
}
function changed() { updateCount(); updateState(); }
rteBox.addEventListener("input", updateCount);

/* খালি এডিটরে লেখা শুরু করলে প্রথম লাইনও একটি অনুচ্ছেদ (<p>) হয় */
function ensureParagraph() {
  if (rteBox.firstElementChild || rteBox.textContent.trim()) return;
  rteBox.innerHTML = "<p><br></p>";
  const r = document.createRange();
  r.setStart(rteBox.firstChild, 0);
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
rteBox.addEventListener("focus", ensureParagraph);
rteBox.addEventListener("keydown", e => { if (e.key.length === 1 || e.key === "Enter") ensureParagraph(); });
updateCount();

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
  if (eocd < 0) throw new Error("The file could not be read (it isn't a zip/docx).");
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
      if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("This browser can't open the file — try a recent Chrome or Edge.");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("No text was found inside the file.");
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
  if (name.endsWith(".doc")) throw new Error("Old .doc files can't be opened — save it as .docx in Word and try again.");
  if (name.endsWith(".pdf")) throw new Error("Text can't be taken from a PDF — use a .docx, .txt or .md file.");
  if (/\.(txt|md|markdown)$/.test(name) || /^text\//.test(file.type)) return paragraphsFromText(await file.text(), /\.(md|markdown)$/.test(name));
  throw new Error("This kind of file isn't supported — use .docx, .odt, .txt or .md.");
}

/* পূর্বরূপ — কোন লেখা কোন ঘরে যাবে; "Fill the form" চাপলে তবেই বসে */
function previewImport(fields, source) {
  if (!fields.title && !fields.sub && !fields.intro && !fields.bodyCount) {
    showToast("No text was found in the file.", false);
    return;
  }
  const cut = (s, n) => s.length > n ? s.slice(0, n).trim() + "…" : s;
  const row = (label, val, warn) => `<div class="importprev__row"><span>${label}</span>${
    val ? `<b>${esc(cut(val, 140))}</b>` : `<em>will stay empty</em>`}${warn ? `<small>${warn}</small>` : ""}</div>`;
  const bodyText = plainTextFromHtml(fields.body.replace(/<\/(p|li)>/g, " ")).replace(/\s+/g, " ").trim();
  importPrev.innerHTML = `
    <div class="importprev__head">${ICON.check}<span>From <b>${esc(source)}</b>, this will be filled in:</span></div>
    ${row("Headline", fields.title, fields.title.length > 160 ? "Longer than 160 characters — shorten it after filling" : "")}
    ${row("Sub Headline", fields.sub)}
    ${row("Intro", fields.intro)}
    ${row(`Post Content${fields.bodyCount ? ` (${num(fields.bodyCount)} paragraphs)` : ""}`, bodyText)}
    <p class="importprev__note">Whatever is already in these four fields will be replaced. Image, category and the rest stay as they are.</p>
    <div class="importprev__act">
      <button type="button" class="btn btn--primary" id="importApply">Fill the form</button>
      <button type="button" class="btn btn--ghost" id="importCancel">Cancel</button>
    </div>`;
  importPrev.hidden = false;
  importPrev.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.getElementById("importCancel").onclick = () => { importPrev.hidden = true; };
  document.getElementById("importApply").onclick = () => {
    syncSource();
    document.getElementById("fTitle").value = fields.title;
    document.getElementById("fSub").value = fields.sub;
    document.getElementById("fIntro").value = fields.intro;
    rteBox.innerHTML = fields.body;
    updateCount();
    ["fTitle", "fSub", "fIntro"].forEach(id => document.getElementById(id).dispatchEvent(new Event("input", { bubbles: true })));
    document.getElementById("eTitle").textContent = "";
    importPrev.hidden = true;
    showToast("The form was filled from the file — check it, then fill in the rest (image, category).", true);
    document.getElementById("fTitle").scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

async function handleImport(getParas, source) {
  importBox.classList.add("is-busy");
  try {
    previewImport(mapToFields(await getParas()), source);
  } catch (err) {
    showToast(err.message || "The file could not be read.", false);
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
  if (text) handleImport(async () => paragraphsFromText(text, false), "dropped text");
});
importBox.addEventListener("paste", e => {
  const f = e.clipboardData.files[0];
  const text = e.clipboardData.getData("text/plain");
  if (!f && !text) return;
  e.preventDefault();
  if (f) handleImport(() => readImport(f), f.name);
  else handleImport(async () => paragraphsFromText(text, false), "pasted text");
});

/* ---------- বিভাগ → সাব-ক্যাটাগরি ক্যাসকেড ------------------------------------ */
const fCat = document.getElementById("fCat");
const fSubcat = document.getElementById("fSubcat");
fCat.addEventListener("change", () => {
  const list = SUBCATEGORIES[fCat.value] || [];
  if (!list.length) {
    fSubcat.innerHTML = `<option value="" hidden selected>No sub categories</option>`;
    fSubcat.disabled = true;
    return;
  }
  fSubcat.disabled = false;
  fSubcat.innerHTML = `<option value="" hidden selected>Select Sub Category</option>`
    + `<option value="">None</option>` +
    list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
});

/* ---------- প্রশাসনিক বিভাগ → জেলা → উপজেলা ক্যাসকেড -------------------------- */
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
  fUpazila.innerHTML = `<option value="" hidden selected>Select Upazila</option>`
    + (fUpazila.disabled ? "" : `<option value="">None</option>`) +
    [...list, ...extra].map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  fUpazila.value = match || keep || "";
}

function fillDistricts() {
  const list = BD_DISTRICTS[fDivision.value] || [];
  fDistrict.disabled = !list.length;
  fDistrict.innerHTML = `<option value="" hidden selected>Select District</option>`
    + (list.length ? `<option value="">None</option>` : "") +
    list.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  fillUpazilas();
}
fDivision.addEventListener("change", fillDistricts);
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
    setErr("eImage", enMsg(err.message));
  }
  updateSharePreview();
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
  updateSharePreview();
}

/* ---------- ফেসবুক শেয়ারের ছবি ------------------------------------------
   Banner = খবরের ছবির নিচে সাইটের রঙের পট্টিতে লোগো ও নাম (১২০০×৬৩০, ফেসবুকের মাপ);
   Photo only = শুধু খবরের ছবি; Site card = সাইটের শেয়ার-কার্ড (img/share.png)।
   ব্যানারটি এখানেই (ব্রাউজারে) আঁকা হয়ে খবরের সঙ্গে সার্ভারে যায়।            */
const fShare = document.getElementById("fShare");
const sharePv = document.getElementById("sharePv"), sharePvImg = document.getElementById("sharePvImg");
const shareHint = document.getElementById("shareHint");

const loadImg = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
async function makeBanner(src) {
  const img = await loadImg(src);
  try { await Promise.all([document.fonts.load('800 44px "Noto Serif Bengali"'), document.fonts.load('600 24px "Noto Sans Bengali"')]); } catch (e) { /* ফন্ট না এলেও চলে */ }
  const W = 1200, H = 630, band = 104, green = "#059669";
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const s = Math.max(W / img.width, (H - band) / img.height);
  x.fillStyle = "#111"; x.fillRect(0, 0, W, H);
  x.drawImage(img, (W - img.width * s) / 2, (H - band - img.height * s) / 2, img.width * s, img.height * s);
  x.fillStyle = green; x.fillRect(0, H - band, W, band);
  x.fillRect(0, 0, W, 8);
  const mid = H - band / 2;
  x.fillStyle = "#fff"; x.beginPath();
  if (x.roundRect) x.roundRect(30, mid - 34, 68, 68, 10); else x.rect(30, mid - 34, 68, 68);
  x.fill();
  let first = SITE.name.charAt(0);
  try { first = new Intl.Segmenter("bn", { granularity: "grapheme" }).segment(SITE.name)[Symbol.iterator]().next().value.segment; } catch (e) { /* পুরোনো ব্রাউজার */ }
  x.textBaseline = "middle";
  x.fillStyle = green; x.textAlign = "center"; x.font = '800 42px "Noto Serif Bengali", serif';
  x.fillText(first, 64, mid + 2);
  x.fillStyle = "#fff"; x.textAlign = "left"; x.font = '800 46px "Noto Serif Bengali", serif';
  x.fillText(SITE.name, 118, mid + 2);
  x.textAlign = "right"; x.font = '600 24px "Noto Sans Bengali", sans-serif'; x.globalAlpha = .9;
  x.fillText(location.host || "", W - 34, mid + 2);
  return c.toDataURL("image/jpeg", 0.86);
}

let shareTicket = 0;
async function updateSharePreview() {
  const mode = fShare.value, ticket = ++shareTicket;
  shareHint.textContent = mode === "banner" ? "The post photo with the site's name and logo underneath."
    : mode === "photo" ? "Only the post photo." : "The site's own share card, without the post photo.";
  let src = "";
  if (mode === "site" || !pickedImage) src = mode === "site" || mode === "banner" ? "img/share.png" : "";
  if (mode === "photo" && pickedImage) src = pickedImage;
  if (mode === "banner" && pickedImage) { try { src = await makeBanner(pickedImage); } catch (e) { src = pickedImage; } }
  if (ticket !== shareTicket) return;               /* এর মধ্যে আবার বদলেছে */
  sharePv.hidden = !src;
  if (src) sharePvImg.src = src;
}
fShare.addEventListener("change", updateSharePreview);

/* ---------- Is Lead? — প্রচ্ছদের ওপরের খবরে কত নম্বরে বসবে -----------------
   টিক দিলে নম্বরের ঘর আসে: টাইপ করা যায়, বা −/+ (কিবোর্ডে ↑/↓) দিয়ে বদলানো যায়।
   ১ = বড় প্রধান খবর, ২–৫ = পাশের চারটি, ৬–৯ = নিচের সারি (main.js-এর topNews)। */
const fLead = document.getElementById("fLead");
const fLeadPos = document.getElementById("fLeadPos");
const leadPosBox = document.getElementById("leadPosBox");
const leadPosHint = document.getElementById("leadPosHint");
const clampPos = v => Math.min(LEAD_SLOTS, Math.max(1, parseInt(v, 10) || 1));
function updateLeadHint() {
  const raw = parseInt(fLeadPos.value, 10);
  if (!raw) { leadPosHint.textContent = `Type a number from 1 to ${LEAD_SLOTS}.`; return; }
  const v = clampPos(raw);
  const where = v === 1 ? "the big top story" : v <= 5 ? `beside the big story (${v - 1} of 4)` : `the row below the top stories (${v - 5} of 4)`;
  const taken = managedPosts().find(p => p.status !== "draft" && String(p.id) !== String(editingId) && leadPosOf(p) === v);
  leadPosHint.innerHTML = `<b>#${v}</b> — ${where}.` + (raw !== v ? ` (Highest is ${LEAD_SLOTS}.)` : "") +
    (taken ? `<br>Now there: “${esc(taken.title)}” — it moves down one place.` : "");
}
function syncLeadBox() {
  leadPosBox.hidden = !fLead.checked;
  if (fLead.checked) updateLeadHint();
}
fLead.addEventListener("change", () => { syncLeadBox(); if (fLead.checked) fLeadPos.focus(); });
fLeadPos.addEventListener("input", updateLeadHint);
fLeadPos.addEventListener("change", () => { fLeadPos.value = clampPos(fLeadPos.value); updateLeadHint(); });
leadPosBox.addEventListener("click", e => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  fLeadPos.value = clampPos(clampPos(fLeadPos.value) + +b.dataset.step);
  updateLeadHint();
});

/* ---------- Read More — খবর শেষের "আরও পড়ুন"-এর ২টি খবর নিজে বাছাই --------
   তালিকা থেকে "#১২ — শিরোনাম" বাছাই করা যায়, অথবা শুধু নম্বর (12) বা পুরো শিরোনাম
   লেখা যায়। খালি রাখলে খবরের পাতায় নিজে থেকেই বসে (একই বিভাগ আগে)। */
const rmInputs = [document.getElementById("fRm1"), document.getElementById("fRm2")];
const rmLabel = p => `#${p.no || "—"} — ${p.title}`;
const rmPool = () => managedPosts().filter(p => !p.trashed && p.status !== "draft" && String(p.id) !== String(editingId));
function fillReadMoreList() {
  document.getElementById("rmList").innerHTML = rmPool().map(p => `<option value="${esc(rmLabel(p))}"></option>`).join("");
}
/* ঘরের লেখা → খবর; খালি হলে null, না মিললে false */
function resolveRm(v) {
  v = String(v || "").trim().replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d));
  if (!v) return null;
  const pool = rmPool();
  const m = v.match(/^#?(\d+)(\s|—|$)/);
  if (m) return pool.find(p => String(p.no) === m[1]) || false;
  return pool.find(p => p.title === v) || false;
}

/* ---------- ফর্ম রিসেট (নতুন পোস্টের জন্য প্রস্তুত) --------------------- */
function resetForm(form) {
  form.reset();
  if (ed.classList.contains("is-source")) toggleSource();
  rteBox.innerHTML = "";
  updateCount();
  fSubcat.innerHTML = `<option value="" hidden selected>Select Sub Category</option>`;
  fSubcat.disabled = true;
  fillDistricts();
  clearImage();
  syncLeadBox();
}

/* ---------- ফর্ম জমা (দুটি বোতাম: Create Post / Save as Draft) ------------------- */
let submitStatus = "published";
document.getElementById("draftBtn").addEventListener("click", () => { submitStatus = "draft"; });
document.getElementById("postBtn").addEventListener("click", () => { submitStatus = "published"; });

/* ---------- পোস্ট এডিট (বিদ্যমান পোস্ট ফর্মে লোড করা) --------------- */
let editingId = null;
const editingBanner = document.getElementById("editingBanner");
const postBtn = document.getElementById("postBtn");
const formHeading = document.getElementById("formHeading");

function startEdit(post) {
  editingId = post.id;
  setPage("form");
  if (ed.classList.contains("is-source")) toggleSource();

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
  fillDistricts();
  fDistrict.value = post.district || "";
  fillUpazilas(post.upazila || "");   /* এডিটে আগের উপজেলাসহ তালিকা */

  fLead.checked = !!post.isLead;
  fLeadPos.value = leadPosOf(post) || 1;
  syncLeadBox();
  document.getElementById("fBreaking").checked = !!post.breaking;
  fillReadMoreList();
  rmInputs.forEach((inp, i) => {
    const p = managedPosts().find(x => String(x.id) === String((post.readMore || [])[i]));
    inp.value = p ? rmLabel(p) : "";
  });
  document.getElementById("fExclusive").checked = !!post.exclusive;
  document.getElementById("fRss").checked = post.rss !== false;
  fShare.value = post.shareMode || "photo";

  pickedImage = post.img || "";
  if (pickedImage) {
    previewImg.src = pickedImage;
    preview.hidden = false;
    drop.hidden = true;
  } else {
    clearImage();
  }
  updateSharePreview();

  editingBanner.hidden = false;
  document.getElementById("editingTitle").textContent = post.title;
  formHeading.textContent = "Edit Post";
  postBtn.textContent = "Update Post";
  document.getElementById("appTitle").textContent = "Edit Post";
  document.getElementById("fTitle").focus({ preventScroll: true });
}

function endEdit() {
  editingId = null;
  editingBanner.hidden = true;
  formHeading.textContent = "Create Post";
  postBtn.textContent = "Create Post";
  if (app.dataset.page === "form") document.getElementById("appTitle").textContent = PAGE_TITLES.form;
}

document.getElementById("cancelEdit").addEventListener("click", () => {
  endEdit();
  resetForm(document.getElementById("postForm"));
});

document.getElementById("postForm").addEventListener("submit", async e => {
  e.preventDefault();
  syncSource();

  const title = document.getElementById("fTitle").value.trim();
  const cat   = fCat.value;
  const contentHtml = sanitizeRichHtml(rteBox.innerHTML.trim());
  const plainBody = plainTextFromHtml(contentHtml).trim();
  const hasMedia = /<(img|iframe)\b/i.test(contentHtml);

  setErr("eTitle", ""); setErr("eCat", ""); setErr("eBody", "");
  let bad = false;
  if (!title) { setErr("eTitle", "Please write a headline."); bad = true; }
  if (!cat)   { setErr("eCat", "Please choose a category."); bad = true; }
  if (!plainBody && !hasMedia) { setErr("eBody", "Please write the post content."); bad = true; }
  const rmPicked = rmInputs.map(i => resolveRm(i.value));
  setErr("eReadMore", "");
  if (rmPicked.includes(false)) { setErr("eReadMore", "A Read More post wasn't found — pick one from the list, or type its ID number."); bad = true; }
  if (bad) {
    const firstErr = $(".field__err:not(:empty)");
    if (firstErr) firstErr.closest(".field").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const introRaw = document.getElementById("fIntro").value.trim();
  const excerptSrc = introRaw || plainBody || title;
  const excerpt = excerptSrc.length > 190 ? excerptSrc.slice(0, 190).trim() + "…" : excerptSrc;

  const keywords = document.getElementById("fKeywords").value
    .split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);

  const draftBtn = document.getElementById("draftBtn");
  draftBtn.disabled = true; postBtn.disabled = true;
  const activeBtn = submitStatus === "draft" ? draftBtn : postBtn;
  const activeLabel = activeBtn.textContent;
  activeBtn.textContent = "Saving…";

  /* শেয়ারের ব্যানার — শুধু সার্ভার মোডে (লোকাল মোডে ফেসবুক সাইটটি দেখতেই পায় না) */
  let shareImg = "";
  if (onServer && fShare.value === "banner" && pickedImage) {
    try { shareImg = await makeBanner(pickedImage); } catch (err) { shareImg = ""; }
  }

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
    isLead: fLead.checked,
    leadPos: fLead.checked ? clampPos(fLeadPos.value) : 0,
    breaking: document.getElementById("fBreaking").checked,
    readMore: [...new Set(rmPicked.filter(Boolean).map(p => String(p.id)))],
    exclusive: document.getElementById("fExclusive").checked,
    rss: document.getElementById("fRss").checked,
    shareMode: fShare.value,
    shareImg,
    status: submitStatus,
    read: readTime(plainBody),
    createdAt: Date.now()
  };

  const wasEditing = editingId;
  let saved;
  try {
    saved = wasEditing ? await updatePost(wasEditing, post) : await createPost(post);
  } catch (err) {
    showToast(enMsg(err.message), false);
    draftBtn.disabled = false; postBtn.disabled = false;
    activeBtn.textContent = activeLabel;
    return;
  }

  draftBtn.disabled = false; postBtn.disabled = false;
  activeBtn.textContent = activeLabel;

  showToast(
    submitStatus === "draft" ? "Saved as a draft"
      : (wasEditing ? "Changes saved" : "Post published on the site"),
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
    ? `<strong>✓ ${esc(msg)}</strong> ${isDraft || !saved ? "" : `<a href="${link(saved)}" target="_blank" rel="noopener">View post</a>`}`
    : `<strong>${esc(msg)}</strong>`;
  t.hidden = false;
}

/* ---------- সব খবর — টেবিল, খোঁজা, বিভাগ/অবস্থা বাছাই, পাতা ---------------- */
const PER_PAGE = 20;
let listQuery = "", listCat = "", listStatus = "all", listPage = 1;
const mSearch = document.getElementById("mSearch");
const mCat = document.getElementById("mCat");
const mStatus = document.getElementById("mStatus");
const pBody = document.getElementById("pBody");

document.getElementById("pSearchForm").addEventListener("submit", e => {
  e.preventDefault();
  listQuery = mSearch.value.trim();
  listPage = 1;
  renderManageList();
});
mSearch.addEventListener("search", () => { if (!mSearch.value) { listQuery = ""; listPage = 1; renderManageList(); } });
document.getElementById("pCatForm").addEventListener("submit", e => {
  e.preventDefault();
  listCat = mCat.value;
  setPage("list", mStatus.value);
});

/* তালিকার ধরন বদল (সাইডবার, ড্যাশবোর্ড বা "Show" বাছাই থেকে) */
function setListView(v) {
  if (v !== listStatus) listPage = 1;
  listStatus = LIST_VIEWS[v] ? v : "all";
  mStatus.value = listStatus;
  document.getElementById("plistTitle").textContent = LIST_VIEWS[listStatus].title;
  renderManageList();
}

async function refreshManageList() {
  await loadManaged();
  renderManageList();
}

const postUrl = p => p.status === "draft" ? `article.html?id=${p.id}` : link(p);
const bodyText = p => p.content ? plainTextFromHtml(p.content) : (p.body || []).join(" ");
const toAsciiDigits = s => s.replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d));

function filteredPosts(all) {
  const q = toAsciiDigits(listQuery).toLowerCase();
  const id = q.replace(/^#/, "");
  const list = all.filter(p =>
    VIEW_TEST[listStatus](p) &&
    (!listCat || p.cat === listCat) &&
    (!q || String(p.no) === id || String(p.id) === id ||
      `${p.title} ${p.subHeadline || ""} ${bodyText(p)}`.toLowerCase().includes(q)));
  /* Lead: প্রচ্ছদের নম্বর অনুযায়ী; Trash: সবশেষে ট্র্যাশে পাঠানোটা আগে */
  if (listStatus === "lead") list.sort((a, b) => leadPosOf(a) - leadPosOf(b));
  if (listStatus === "trash") list.sort((a, b) => b.trashed - a.trashed);
  return list;
}

function pagerHtml(total, page) {
  const pages = Math.ceil(total / PER_PAGE);
  if (pages <= 1) return "";
  const nums = new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages));
  const list = [...nums].sort((a, b) => a - b);
  let out = `<button type="button" data-pg="${page - 1}"${page === 1 ? " disabled" : ""}>Previous</button>`;
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) out += `<span class="pager__gap">…</span>`;
    out += `<button type="button" data-pg="${n}"${n === page ? ' class="is-on" aria-current="page"' : ""}>${n}</button>`;
  });
  return out + `<button type="button" data-pg="${page + 1}"${page === pages ? " disabled" : ""}>Next</button>`;
}

function renderManageList() {
  const every = managedPosts();
  const all = every.filter(p => !p.trashed);            /* ট্র্যাশের খবর হিসাবের বাইরে */
  const drafts = all.filter(p => p.status === "draft");
  const live   = all.filter(p => p.status !== "draft");

  document.getElementById("stTotal").textContent = num(all.length);
  document.getElementById("stLive").textContent = num(live.length);
  document.getElementById("stDraft").textContent = num(drafts.length);
  renderDash(all, live);
  const navNum = (id, n) => { document.getElementById(id).textContent = n ? num(n) : ""; };
  navNum("navDrafts", drafts.length);
  navNum("navLead", every.filter(VIEW_TEST.lead).length);
  navNum("navBreaking", every.filter(VIEW_TEST.breaking).length);
  navNum("navTrash", every.filter(VIEW_TEST.trash).length);
  navNum("navReadMore", every.filter(VIEW_TEST.readmore).length);
  fillReadMoreList();

  const list = filteredPosts(every);
  const byId = new Map(every.map(p => [String(p.id), p]));
  const inTrash = listStatus === "trash";
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  listPage = Math.min(Math.max(1, listPage), pages);
  const from = (listPage - 1) * PER_PAGE;
  const shown = list.slice(from, from + PER_PAGE);

  document.getElementById("pCount").textContent = list.length
    ? `Showing ${num(from + 1)} to ${num(from + shown.length)} of ${num(list.length)}`
    : "";

  const row = p => {
    const draft = p.status === "draft";
    const tags = [draft && `<i class="ptag ptag--draft">Draft</i>`, p.isLead && `<i class="ptag">Lead #${leadPosOf(p)}</i>`,
      p.breaking && `<i class="ptag ptag--brk">Breaking</i>`, p.exclusive && `<i class="ptag ptag--ex">Exclusive</i>`,
      inTrash && `<i class="ptag ptag--trash">In trash · ${fmtLong(p.trashed)}</i>`].filter(Boolean).join("");
    const rm = (p.readMore || []).map(rid => byId.get(String(rid))).filter(Boolean);
    const rmLine = listStatus === "readmore" && rm.length
      ? `<small class="prm">Read more: ${rm.map(x => `#${x.no || "—"} ${esc(x.title)}`).join(" · ")}</small>` : "";
    const actions = inTrash
      ? `<button type="button" class="pact pact--view" data-restore="${esc(p.id)}" title="Restore" aria-label="Restore">${EI.restore}</button>
         <button type="button" class="pact pact--del" data-purge="${esc(p.id)}" title="Delete forever" aria-label="Delete forever">${ICON.trash}</button>`
      : `<a class="pact pact--view" href="${postUrl(p)}" target="_blank" rel="noopener" title="View" aria-label="View">${ICON.eye}</a>
         <button type="button" class="pact pact--edit" data-edit="${esc(p.id)}" title="Edit" aria-label="Edit">${ICON.edit}</button>
         ${draft
           ? `<button type="button" class="pact pact--pub" data-pub="${esc(p.id)}" title="Publish" aria-label="Publish">${ICON.check}</button>`
           : `<button type="button" class="pact pact--copy" data-copy="${esc(p.id)}" title="Copy link" aria-label="Copy link">${ICON.copy}</button>`}
         <button type="button" class="pact pact--del" data-del="${esc(p.id)}" title="Move to trash" aria-label="Move to trash">${ICON.trash}</button>`;
    return `<tr data-id="${esc(p.id)}">
      <td class="ptable__id">${p.no ? num(p.no) : "—"}</td>
      <td class="ptable__h"><a href="${postUrl(p)}" target="_blank" rel="noopener" title="${esc(p.title)}">${esc(p.title)}</a>
        ${tags ? `<span class="ptags">${tags}</span>` : ""}${rmLine}</td>
      <td>${fmtShort(p.createdAt)}</td>
      <td>${esc(SITE.name)}</td>
      <td>${p.updatedAt ? `${esc(SITE.name)}<small>${fmtLong(p.updatedAt)}</small>` : ""}</td>
      <td>${esc(catName(p.cat))}</td>
      <td>${num(p.views)}</td>
      <td class="ptable__act">${actions}</td>
    </tr>`;
  };

  const EMPTY = { trash: "Trash is empty.", draft: "No drafts.", lead: "No lead posts — tick “Is Lead?” on a post to pin it to the homepage.",
    breaking: "No breaking news — tick “Breaking News” on a post to show it in the homepage ticker.",
    readmore: "No post has its own Read More links yet — pick them in the “Read More” box on the post form." };
  pBody.innerHTML = shown.length ? shown.map(row).join("")
    : `<tr><td colspan="8" class="ptable__empty">${listQuery || listCat ? "No posts match." : EMPTY[listStatus] || (all.length ? "No posts match." : "No posts yet — click “Create Post” to write the first one.")}</td></tr>`;
  document.getElementById("pPager").innerHTML = pagerHtml(list.length, listPage);
}

document.getElementById("pPager").addEventListener("click", e => {
  const b = e.target.closest("[data-pg]");
  if (!b || b.disabled) return;
  listPage = +b.dataset.pg;
  renderManageList();
  document.querySelector(".plist").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* টেবিলের বোতাম — এডিট, কপি, প্রকাশ, ডিলিট (একটিই লিসেনার) */
pBody.addEventListener("click", async e => {
  const btn = e.target.closest("button[data-edit],button[data-copy],button[data-pub],button[data-del],button[data-restore],button[data-purge]");
  if (!btn) return;
  const all = managedPosts();
  const id = btn.dataset.edit || btn.dataset.copy || btn.dataset.pub || btn.dataset.del || btn.dataset.restore || btn.dataset.purge;
  const post = all.find(p => String(p.id) === String(id));
  if (!post) return;

  if (btn.dataset.edit) { startEdit(post); return; }

  if (btn.dataset.copy) {
    const url = new URL(link(post), location.href).href;
    try { await navigator.clipboard.writeText(url); notify("Link copied"); }
    catch (err) { askDialog({ title: "Copy this link", message: url }); }
    return;
  }

  if (btn.dataset.pub) {
    btn.disabled = true;
    try { await publishPost(id); }
    catch (err) { btn.disabled = false; askDialog({ title: "Could not publish", message: enMsg(err.message) }); return; }
    notify("Post published");
    refreshPosts();
    await refreshManageList();
    return;
  }

  /* ডিলিট = ট্র্যাশে পাঠানো (ফেরানো যায়); ট্র্যাশ থেকে "Delete forever" = স্থায়ীভাবে মোছা */
  if (btn.dataset.del) {
    if (!await askDialog({ title: "Move this post to Trash?",
          message: `“${post.title}” will disappear from the site. You can bring it back from News Manage → Trash Post.`,
          okText: "Move to Trash", cancelText: "Cancel", danger: true })) return;
    btn.disabled = true;
    try { await trashPost(id); }
    catch (err) { btn.disabled = false; askDialog({ title: "Could not move to Trash", message: enMsg(err.message) }); return; }
    if (String(editingId) === String(id)) { endEdit(); resetForm(document.getElementById("postForm")); }
    notify("Moved to Trash");
    refreshPosts();
    await refreshManageList();
    return;
  }

  if (btn.dataset.restore) {
    btn.disabled = true;
    try { await restorePost(id); }
    catch (err) { btn.disabled = false; askDialog({ title: "Could not restore", message: enMsg(err.message) }); return; }
    notify("Post restored");
    refreshPosts();
    await refreshManageList();
    return;
  }

  if (btn.dataset.purge) {
    if (!await askDialog({ title: "Delete this post forever?",
          message: `“${post.title}” and its images will be deleted for good. This can't be undone.`,
          okText: "Delete forever", cancelText: "Cancel", danger: true })) return;
    btn.disabled = true;
    try { await removePost(id); }
    catch (err) { btn.disabled = false; askDialog({ title: "Could not delete", message: enMsg(err.message) }); return; }
    refreshPosts();
    await refreshManageList();
  }
});

/* ---------- ড্যাশবোর্ড ও বিভাগের হিসাব --------------------------------- */
function renderDash(all, live) {
  const views = live.reduce((n, p) => n + (p.views || 0), 0);
  const top = live.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).filter(p => p.views).slice(0, 5);
  const usedCats = new Set(live.map(p => p.cat));
  document.getElementById("navCount").textContent = all.length ? num(all.length) : "";
  document.getElementById("stViews").textContent = num(views);
  document.getElementById("stTopViews").textContent = top.length ? `${num(top[0].views)} views` : "—";
  document.getElementById("stCatsUsed").textContent = num(CATEGORIES.filter(c => usedCats.has(c.slug)).length);
  document.getElementById("stEx").textContent = num(live.filter(p => p.exclusive || p.cat === "exclusive").length);
  document.getElementById("stLead").textContent = num(live.filter(p => p.isLead).length);

  const line = (p, right) => `
    <div class="drow">
      <img src="${imgFor(p)}" alt="" loading="lazy">
      <div><a href="${postUrl(p)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        <span class="drow__meta"><i class="status ${p.status === "draft" ? "status--draft" : "status--live"}">${p.status === "draft" ? "Draft" : "Published"}</i>${catName(p.cat)} · ${ago(p.createdAt)}</span></div>
      ${right}
    </div>`;
  const editBtn = p => `<button type="button" class="drow__btn" data-dedit="${p.id}" aria-label="Edit">${ICON.edit}</button>`;
  const empty = msg => `<p class="drow__empty">${msg}</p>`;

  const recentBox = document.getElementById("dashRecent");
  recentBox.innerHTML = all.length ? all.slice(0, 5).map(p => line(p, editBtn(p))).join("") : empty("No posts yet — start with “Create Post” above.");
  recentBox.querySelectorAll("[data-dedit]").forEach(b => b.addEventListener("click", () => {
    const post = all.find(p => String(p.id) === b.dataset.dedit);
    if (post) startEdit(post);
  }));
  document.getElementById("dashTop").innerHTML = top.length
    ? top.map((p, i) => line(p, `<b class="drow__views">${ICON.eye}${num(p.views)}</b>`).replace('class="drow"', `class="drow drow--rank" data-rank="${i + 1}"`)).join("")
    : empty("No post has been viewed yet.");

  /* সব বিভাগ পাতা — প্রতিটির রং, খবর, ড্রাফট, মোট ভিউ */
  document.getElementById("catTable").innerHTML = `
    <div class="ctable">
      <div class="ctable__row ctable__row--head"><span>CATEGORY</span><span>PUBLISHED</span><span>DRAFTS</span><span>TOTAL VIEWS</span><span></span></div>
      ${CATEGORIES.map(c => {
        const mine = all.filter(p => p.cat === c.slug);
        const pub = mine.filter(p => p.status !== "draft");
        return `<div class="ctable__row">
          <span><i class="ctable__dot"${catAttr(c.slug)}></i><b>${c.name}</b></span>
          <span>${num(pub.length)}</span><span>${num(mine.length - pub.length)}</span>
          <span>${num(pub.reduce((n, p) => n + (p.views || 0), 0))}</span>
          <span><a href="${topicLink(c.slug)}" target="_blank" rel="noopener">View page${ICON.arrow}</a></span>
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
    `<span class="gpicked__item"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-rm="${i}" aria-label="Remove">${ICON.close}</button></span>`).join("");
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
  if (!title) { gToast("gpToast", "Please write the album title."); return; }
  if (!gpFiles.length) { gToast("gpToast", "Choose at least one photo."); return; }
  const label = btn.innerHTML;
  btn.disabled = true;
  let item = null, done = 0;
  try {
    for (const f of gpFiles) {
      btn.textContent = `Uploading photo ${done + 1}/${gpFiles.length}…`;
      const img = await fileToImage(f);
      item = item ? await addGalleryPhoto(item.id, img)
                  : await addGalleryItem({ type: "photo", title, caption: document.getElementById("gpCaption").value.trim(), img });
      done++;
    }
    gToast("gpToast", `Album published — ${done} photo${done > 1 ? "s" : ""}.`, true);
    gpFiles = []; renderPicked();
    document.getElementById("gpTitle").value = ""; document.getElementById("gpCaption").value = "";
  } catch (err) {
    gToast("gpToast", done ? `${done} photo${done > 1 ? "s" : ""} uploaded, the rest failed: ${enMsg(err.message)}` : enMsg(err.message));
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
  gvCheck.textContent = !gvUrl.value.trim() ? "Paste a YouTube (Shorts too) or Facebook video link."
    : v ? `✓ ${v.kind === "youtube" ? "YouTube" : "Facebook"} video recognised` : "This link isn't recognised — use a YouTube or Facebook video link.";
  gvPrev.hidden = !(v && v.kind === "youtube");
  if (v && v.kind === "youtube") gvPrev.innerHTML = `<img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="">`;
});

document.getElementById("gvSave").addEventListener("click", async () => {
  const btn = document.getElementById("gvSave");
  const title = document.getElementById("gvTitle").value.trim();
  if (!parseVideoLink(gvUrl.value)) { gToast("gvToast", "Enter a valid YouTube or Facebook video link."); return; }
  if (!title) { gToast("gvToast", "Please write the video title."); return; }
  const label = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const thumbFile = document.getElementById("gvThumb").files[0];
    await addGalleryItem({ type: "video", title, url: gvUrl.value.trim(),
      caption: document.getElementById("gvCaption").value.trim(), thumb: thumbFile ? await fileToImage(thumbFile, 960) : "" });
    gToast("gvToast", "Video published.", true);
    ["gvUrl", "gvTitle", "gvCaption", "gvThumb"].forEach(id => { document.getElementById(id).value = ""; });
    gvUrl.dispatchEvent(new Event("input"));
  } catch (err) {
    gToast("gvToast", enMsg(err.message));
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
  document.getElementById("navPhotos").textContent = albums.length ? num(albums.length) : "";
  document.getElementById("navVideos").textContent = videos.length ? num(videos.length) : "";
  document.getElementById("stAlbums").textContent = num(albums.length);
  document.getElementById("stPhotos").textContent = num(photoCount);
  document.getElementById("stVideos").textContent = num(videos.length);
  document.getElementById("stYt").textContent = num(videos.filter(v => v.video.kind === "youtube").length);
  document.getElementById("stFb").textContent = num(videos.filter(v => v.video.kind === "facebook").length);

  const card = (it, img, meta, href) => `
    <article class="gcard">
      <a class="gcard__img${it.type === "video" ? " is-video" : ""}" href="${href}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}${it.type === "video" ? `<span class="gcard__play">${ICON.play}</span>` : ""}</a>
      <div class="gcard__body"><b>${esc(it.title)}</b><span>${meta}</span></div>
      <div class="gcard__act"><a href="${href}" target="_blank" rel="noopener">${ICON.eye}View</a><button type="button" class="gcard__del" data-gdel="${it.id}">${ICON.trash}Delete</button></div>
    </article>`;
  document.getElementById("gpList").innerHTML = albums.length
    ? albums.map(a => card(a, a.photos[0], `${num(a.photos.length)} photo${a.photos.length > 1 ? "s" : ""} · ${ago(a.createdAt)}`, `gallery.html?id=${a.id}`)).join("")
    : `<p class="drow__empty">No albums yet.</p>`;
  document.getElementById("gvList").innerHTML = videos.length
    ? videos.map(v => card(v, videoThumb(v), `${v.video.kind === "youtube" ? "YouTube" : "Facebook"} · ${ago(v.createdAt)}`, `videos.html?id=${v.id}`)).join("")
    : `<p class="drow__empty">No videos yet.</p>`;

  document.querySelectorAll("[data-gdel]").forEach(b => b.addEventListener("click", async () => {
    const it = items.find(x => String(x.id) === b.dataset.gdel);
    if (!it) return;
    const isVideo = it.type === "video";
    if (!await askDialog({ title: isVideo ? "Delete this video?" : "Delete this album?",
          message: `“${it.title}” — ${isVideo ? "the video" : `the album and its ${num(it.photos.length)} photo${it.photos.length > 1 ? "s" : ""}`} will be deleted for good. This can't be undone.`,
          okText: "Delete", cancelText: "Cancel", danger: true })) return;
    b.disabled = true;
    try { await deleteGalleryItem(it.id); }
    catch (err) { b.disabled = false; askDialog({ title: "Could not delete", message: enMsg(err.message) }); return; }
    refreshGallery();
  }));
}

fillDistricts();
updateSharePreview();
{ const [pg, view] = (location.hash.slice(1) || "dash").split("/"); setPage(pg, view); }
refreshManageList();
refreshGallery();
}

/* শুরু — ওপরের সব ফাংশন ও আইকন তৈরি হওয়ার পরে */
if (isAdmin()) {
  renderPanel();
} else {
  renderGate();
}

})();
