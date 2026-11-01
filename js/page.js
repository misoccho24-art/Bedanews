/* =====================================================================
   তথ্যের পাতা (আমাদের সম্পর্কে, যোগাযোগ, নীতিমালা, বিজ্ঞাপন) — লেখা HTML-এই
   আছে; এখানে শুধু হেডার/ফুটার বসানো আর data-site ঘরগুলো SITE থেকে ভরা।
   ===================================================================== */
(async () => {
await initStore();
mountShell(null);

document.querySelectorAll("[data-site]").forEach(el => {
  const v = SITE[el.dataset.site];
  if (!v) return;
  el.textContent = v;
  if (el.tagName === "A" && el.dataset.site === "email") el.href = `mailto:${v}`;
});
})();
