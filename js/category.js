/* =====================================================================
   বিভাগ, এলাকা ও সার্চ পেজ — /topic/dhaka · category.html?q=শব্দ ·
   category.html?division=dhaka&district=...
   ===================================================================== */
(async () => {
await initStore();
const qs   = new URLSearchParams(location.search);
/* বিভাগ: /topic/dhaka (সুন্দর লিংক) অথবা পুরোনো category.html?cat=dhaka */
const topicMatch = location.pathname.match(/\/topic\/([A-Za-z0-9_-]+)\/?$/);
const slug = topicMatch ? topicMatch[1] : qs.get("cat");
const term = (qs.get("q") || "").trim();
const division = qs.get("division") || "";
const district = qs.get("district") || "";
const upazila  = qs.get("upazila") || "";

mountShell(slug);

if (term) {
  $$(".js-search input").forEach(i => { i.value = term; });
  document.getElementById("searchbar").classList.add("is-open");
}

const top = document.getElementById("catTop");
const col = document.getElementById("listCol");

/* পেজ আঁকা — প্রথমে সংরক্ষিত কপি দিয়ে সঙ্গে সঙ্গে; পেছনে নতুন খবর এলে আবার */
function render() {
  let list, heading, sub, kicker;

  if (term) {
    const t = term.toLowerCase();
    list = POSTS.filter(a => searchText(a).includes(t));
    kicker = "অনুসন্ধান";
    heading = `“${term}”`;
    sub = `${bnNum(list.length)}টি খবরে শব্দটি পাওয়া গেছে।`;
  } else if (division) {
    /* sameBn: দেখতে এক এমন বানান (যেমন "ড়" দুইভাবে লেখা) মিলে যায় */
    list = POSTS.filter(a =>
      a.division === division &&
      (!district || sameBn(a.district, district)) &&
      (!upazila  || sameBn(a.upazila, upazila)));
    kicker = "আমার এলাকার খবর";
    heading = [upazila, district, divisionName(division)].filter(Boolean)[0];
    sub = `${[divisionName(division), district, upazila].filter(Boolean).join(" › ")} — ${bnNum(list.length)}টি প্রতিবেদন।`;
  } else if (slug) {
    list = inCat(slug);
    kicker = "বিভাগ";
    heading = catName(slug);
    document.querySelector(".sheethead").dataset.cat = slug;   /* পাতার মাথা বিভাগের রঙে */
    sub = `এই বিভাগে এখন পর্যন্ত ${bnNum(list.length)}টি প্রতিবেদন।`;
  } else {
    list = POSTS;
    kicker = "আর্কাইভ";
    heading = "সব খবর";
    sub = `মোট ${bnNum(list.length)}টি প্রতিবেদন।`;
  }

  document.title = `${term ? `${term} — অনুসন্ধান` : heading} — ${SITE.name}`;
  document.getElementById("pageKicker").textContent = kicker;
  document.getElementById("pageTitle").textContent = heading;
  document.getElementById("pageSub").textContent = sub;
  document.getElementById("crumbs").innerHTML =
    `<a href="index.html">প্রচ্ছদ</a>${ICON.chev}<span>${esc(term ? "অনুসন্ধান" : kicker)}</span>`;

  /* ওপরে: বড় প্রধান খবর + পাশে "সর্বশেষ" (এক্সক্লুসিভ খবর আগে),
     তার নিচে পরের ৩টি কলামে, শেষে বাকিগুলো তারিখসহ আর্কাইভ তালিকায়      */
  if (!list.length) {
    top.hidden = true;
    /* সার্চে কিছু না মিললে আলাদা বার্তা; বিভাগ/এলাকার পাতায় প্রচ্ছদের মতো একই সবুজ বাক্স */
    col.innerHTML = term
      ? emptyBox("কোনো খবর পাওয়া যায়নি", "অন্য শব্দ দিয়ে খুঁজে দেখুন অথবা প্রচ্ছদে ফিরে যান।", true)
      : emptyBox("এখনো কোনো খবর প্রকাশিত হয়নি", "নতুন প্রতিবেদন প্রকাশ হলে এখানে দেখা যাবে।");
  } else {
    const marked = list.filter(a => a.exclusive);
    const others = list.filter(a => !a.exclusive);
    const ordered = [...marked, ...others];
    const [lead, ...after] = ordered;
    const second = after.slice(0, 3);
    const rest = after.slice(3);

    top.hidden = false;
    top.innerHTML = `
      <div class="front__lead">${feature(lead, true)}</div>
      <aside class="front__latest">${recentList(after, 6)}</aside>`;

    col.innerHTML =
      (second.length ? `<section class="section">${deskHead("আরও প্রতিবেদন")}
        <div class="cols cols--media" style="--n:3">${second.map(a => story(a, { dek: true })).join("")}</div></section>` : "") +
      (rest.length ? `<section class="section">${deskHead("আর্কাইভ")}
        <div>${rest.map(indexRow).join("")}</div></section>` : "");
  }
}

render();
watchPosts(render);

})();
