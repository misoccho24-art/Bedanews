/* =====================================================================
   ফটো গ্যালারি (gallery.html) ও ভিডিও গ্যালারি (videos.html)
   <body data-kind="photo|video"> দেখে কোনটি আঁকবে ঠিক করে।
   ছবি: অ্যালবামে চাপলে বড় পর্দায় দেখা (আগে/পরে, কিবোর্ড ←/→, ফোনে আঙুলে সরানো)।
   ভিডিও: চাপলে পর্দার মাঝে চলে (YouTube / Facebook)।
   ?id=... দিয়ে খুললে সরাসরি সেই অ্যালবাম/ভিডিও খোলে — শেয়ার করা যায়।
   ===================================================================== */
(async () => {
await initStore();
mountShell(null);

const kind = document.body.dataset.kind === "video" ? "video" : "photo";
const grid = document.getElementById("galGrid");
const items = (await fetchGallery()).filter(i => i.type === kind);

document.getElementById("galSub").textContent = items.length
  ? (kind === "photo"
      ? `${bnNum(items.length)}টি অ্যালবাম · ${bnNum(items.reduce((n, a) => n + a.photos.length, 0))}টি ছবি`
      : `${bnNum(items.length)}টি ভিডিও`)
  : "";

if (!items.length) {
  grid.className = "";
  grid.innerHTML = emptyBox(kind === "photo" ? "এখনো কোনো ছবি প্রকাশিত হয়নি" : "এখনো কোনো ভিডিও প্রকাশিত হয়নি",
                            "নতুন প্রকাশ হলে এখানে দেখা যাবে।");
  return;
}
grid.innerHTML = items.map(kind === "photo" ? albumCard : videoCard).join("");

/* ---------- পর্দাজোড়া দেখার বাক্স (ছবি ও ভিডিও দুটোতেই) ------------------ */
const box = document.createElement("div");
box.className = "lbox";
box.hidden = true;
box.setAttribute("role", "dialog");
box.setAttribute("aria-modal", "true");
box.innerHTML = `
  <div class="lbox__bar"><span class="lbox__count" id="lbCount"></span>
    <button type="button" class="lbox__x" id="lbClose" aria-label="বন্ধ করুন">${ICON.close}</button></div>
  <div class="lbox__stage" id="lbStage"></div>
  <button type="button" class="lbox__nav lbox__nav--prev" id="lbPrev" aria-label="আগের ছবি">${ICON.chev}</button>
  <button type="button" class="lbox__nav lbox__nav--next" id="lbNext" aria-label="পরের ছবি">${ICON.chev}</button>
  <div class="lbox__cap"><b id="lbTitle"></b><span id="lbCaption"></span></div>`;
document.body.appendChild(box);
const $id = id => document.getElementById(id);

let album = null, idx = 0;
function setUrl(id) {
  const u = new URL(location.href);
  if (id) u.searchParams.set("id", id); else u.searchParams.delete("id");
  history.replaceState(null, "", u);
}
function openItem(it, at = 0) {
  document.body.classList.add("no-scroll");
  box.hidden = false;
  box.classList.toggle("is-video", it.type === "video");
  $id("lbTitle").textContent = it.title;
  $id("lbCaption").textContent = it.caption || "";
  setUrl(it.id);
  if (it.type === "video") {
    album = null;
    $id("lbCount").textContent = it.video.kind === "youtube" ? "YouTube" : "Facebook";
    $id("lbStage").innerHTML = `<div class="lbox__video"><iframe src="${esc(videoEmbed(it))}" title="${esc(it.title)}"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  } else {
    album = it; idx = at;
    showPhoto();
  }
  $id("lbClose").focus();
}
function showPhoto() {
  const n = album.photos.length;
  $id("lbStage").innerHTML = `<img src="${esc(album.photos[idx])}" alt="${esc(album.title)} — ছবি ${bnNum(idx + 1)}">`;
  $id("lbCount").textContent = `${bnNum(idx + 1)} / ${bnNum(n)}`;
  $id("lbPrev").hidden = $id("lbNext").hidden = n < 2;
}
function step(d) {
  if (!album) return;
  idx = (idx + d + album.photos.length) % album.photos.length;
  showPhoto();
}
function closeBox() {
  box.hidden = true;
  $id("lbStage").innerHTML = "";          /* ভিডিও বন্ধ হয় */
  document.body.classList.remove("no-scroll");
  setUrl(null);
}
$id("lbClose").addEventListener("click", closeBox);
$id("lbPrev").addEventListener("click", () => step(-1));
$id("lbNext").addEventListener("click", () => step(1));
box.addEventListener("click", e => { if (e.target === box || e.target.id === "lbStage") closeBox(); });
addEventListener("keydown", e => {
  if (box.hidden) return;
  if (e.key === "Escape") closeBox();
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
});
/* ফোনে আঙুল দিয়ে ডানে-বাঁয়ে সরালে আগের/পরের ছবি */
let tx = null;
box.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
box.addEventListener("touchend", e => {
  if (tx === null) return;
  const dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  tx = null;
});

/* কার্ডে চাপলে নতুন পাতায় না গিয়ে এখানেই খোলে */
grid.addEventListener("click", e => {
  const card = e.target.closest("[data-album],[data-vid]");
  if (!card || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const id = card.dataset.album || card.dataset.vid;
  openItem(items.find(i => String(i.id) === id));
});

const want = new URLSearchParams(location.search).get("id");
const start = want && items.find(i => String(i.id) === want);
if (start) openItem(start);
})();
