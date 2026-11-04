<?php
/* =====================================================================
   ফেসবুক/হোয়াটসঅ্যাপ/টুইটারে খবরের লিংক শেয়ার করলে সঠিক ছবি+শিরোনাম
   দেখানোর জন্য এই ফাইলটি ব্যবহৃত হয়।
   ---------------------------------------------------------------------
   কেন দরকার: article.html-এর শিরোনাম/ছবি জাভাস্ক্রিপ্ট দিয়ে বসে, কিন্তু
   ফেসবুকের ক্রলার জাভাস্ক্রিপ্ট চালায় না — তাই সে খালি/ভুল তথ্য পায়।
   .htaccess-এর নিয়ম অনুযায়ী /article.html?id=... রিকোয়েস্ট আসলে ভেতরে
   ভেতরে এই ফাইলটিই আসল কাজ করে (ইউআরএল একই থাকে, পাঠক কিছু বোঝেন না)।
   এই ফাইল প্রথমে সঠিক <meta> ট্যাগ বসিয়ে দেয়, তারপর ঠিক article.html-এর
   মতোই বাকি পাতা দেখায় — সাধারণ পাঠকের অভিজ্ঞতা অপরিবর্তিত থাকে।
   ===================================================================== */

$postFile = __DIR__ . '/data/posts.json';
$id = isset($_GET['id']) ? (string)$_GET['id'] : '';
$n  = isset($_GET['n'])  ? (string)$_GET['n']  : '';   /* /বিভাগ/article/১৫ থেকে আসা নম্বর */

$post = null;
if (($id !== '' || $n !== '') && is_file($postFile)) {
    $raw = @file_get_contents($postFile);
    $list = $raw ? json_decode($raw, true) : null;
    if (is_array($list)) {
        foreach ($list as $p) {
            $match = ($id !== '' && isset($p['id']) && (string)$p['id'] === $id)
                  || ($n !== '' && isset($p['no']) && (string)$p['no'] === $n);
            if ($match && (!isset($p['status']) || $p['status'] !== 'draft')) {
                $post = $p;
                break;
            }
        }
    }
}

/* https কি না — অনেক হোস্টে (Cloudflare/প্রক্সির পেছনে) $_SERVER['HTTPS'] খালি থাকে,
   তখন ছবির ঠিকানা http:// হয়ে যেত আর ফেসবুক অনেক সময় ছবিটি আনতে পারত না */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443')
      || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && stripos($_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false)
      || (isset($_SERVER['HTTP_CF_VISITOR']) && stripos($_SERVER['HTTP_CF_VISITOR'], 'https') !== false);
$scheme = $https ? 'https://' : 'http://';
$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
$origin = $scheme . $host;
$canonical = $origin . '/article.html' . ($id !== '' ? ('?id=' . rawurlencode($id)) : ($n !== '' ? ('?n=' . (int)$n) : ''));
if ($post && isset($post['no'])) {
    $canonical = $origin . '/article.html?n=' . (int)$post['no'];
}

$siteName = 'বেদা নিউজ';
$title = $post ? $post['title'] : $siteName;
$desc  = $post ? (!empty($post['excerpt']) ? $post['excerpt'] : $post['title'])
               : 'বেদা নিউজ-এর বিস্তারিত সংবাদ।';

/* শেয়ারের ছবি: খবরের আপলোড করা ছবি; না থাকলে সাইটের শেয়ার-কার্ড (img/share.png)।
   অটো-জেনারেটেড গ্রেডিয়েন্ট ছবিটি (SVG data URL) ফেসবুক দেখাতে পারে না।
   ছবির মাপ (width/height) ও ধরন বলে দেওয়া জরুরি — না দিলে ফেসবুক প্রথমবার শেয়ারের
   সময় ছবি ছাড়াই শুধু লেখা দেখায়, কারণ ছবিটি সে পরে আলাদাভাবে আনে। */
$imgPath = 'img/share.png';
if ($post && !empty($post['img']) && strpos($post['img'], 'uploads/') === 0 && strpos($post['img'], '..') === false
    && is_file(__DIR__ . '/' . $post['img'])) {
    $imgPath = $post['img'];
}
$image = '';
$imgW = 0; $imgH = 0; $imgType = '';
if (is_file(__DIR__ . '/' . $imgPath)) {
    $image = $origin . '/' . implode('/', array_map('rawurlencode', explode('/', $imgPath)));
    $info = @getimagesize(__DIR__ . '/' . $imgPath);
    if ($info) { $imgW = (int)$info[0]; $imgH = (int)$info[1]; $imgType = (string)$info['mime']; }
}

function ogesc($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<base href="/">
<title><?php echo ogesc($title); ?> — বেদা নিউজ</title>
<meta name="description" content="<?php echo ogesc($desc); ?>">

<meta property="og:type" content="article">
<meta property="og:site_name" content="<?php echo ogesc($siteName); ?>">
<meta property="og:title" content="<?php echo ogesc($title); ?>">
<meta property="og:description" content="<?php echo ogesc($desc); ?>">
<link rel="canonical" href="<?php echo ogesc($canonical); ?>">
<meta property="og:url" content="<?php echo ogesc($canonical); ?>">
<?php if ($image !== ''): ?>
<meta property="og:image" content="<?php echo ogesc($image); ?>">
<?php if ($https): ?><meta property="og:image:secure_url" content="<?php echo ogesc($image); ?>">
<?php endif; ?>
<?php if ($imgType !== ''): ?><meta property="og:image:type" content="<?php echo ogesc($imgType); ?>">
<?php endif; ?>
<?php if ($imgW > 0): ?><meta property="og:image:width" content="<?php echo $imgW; ?>">
<meta property="og:image:height" content="<?php echo $imgH; ?>">
<?php endif; ?>
<meta property="og:image:alt" content="<?php echo ogesc($title); ?>">
<?php endif; ?>
<meta property="og:locale" content="bn_BD">

<meta name="twitter:card" content="<?php echo $image !== '' ? 'summary_large_image' : 'summary'; ?>">
<meta name="twitter:title" content="<?php echo ogesc($title); ?>">
<meta name="twitter:description" content="<?php echo ogesc($desc); ?>">
<?php if ($image !== ''): ?><meta name="twitter:image" content="<?php echo ogesc($image); ?>"><?php endif; ?>

<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%276%27 fill=%27%23059669%27/%3E%3Cpath d=%27M8 10h16M8 16h16M8 22h10%27 stroke=%27white%27 stroke-width=%273%27 stroke-linecap=%27round%27/%3E%3C/svg%3E">
<script>!function(){try{var t=localStorage.getItem("db-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);var ac=localStorage.getItem("db-accent-css");if(ac){var st=document.createElement("style");st.id="accentVars";st.textContent=ac;document.head.appendChild(st);document.documentElement.setAttribute("data-accent","")}t==="dark"&&document.querySelector('meta[name="theme-color"]').setAttribute("content","#0f1115")}catch(e){}if(location.protocol==="file:")return;var r=fetch("api/posts.php",{cache:"no-cache",headers:{Accept:"application/json"}});r.catch(function(){});window.__postsReq=r}()</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Serif+Bengali:wght@400;600;700;800&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Serif+Bengali:wght@400;600;700;800&display=swap"></noscript>
<link rel="stylesheet" href="css/style.css?v=48">
</head>
<body>

<div id="siteHeader"><div class="skel-head"><div class="wrap"><span class="mark" aria-hidden="true">বে</span><b>বেদা নিউজ</b></div></div></div>

<main class="wrap">
  <article class="story" id="article">
    <div class="sk" style="height:48px;width:90%;margin:30px auto 0"></div>
    <div class="sk" style="height:48px;width:60%;margin:12px auto 0"></div>
    <div class="sk sk-img" style="margin-top:28px;aspect-ratio:16/9"></div>
    <div class="sk sk-line"></div><div class="sk sk-line" style="width:90%"></div>
  </article>
</main>

<section class="wrap after" id="relatedWrap">
  <div class="desk"><h2>সম্পর্কিত খবর</h2></div>
  <div class="cols cols--media" id="related"></div>
</section>

<section class="wrap section" id="moreWrap" hidden>
  <div class="desk"><h2>সর্বশেষ</h2><a class="desk__more" href="index.html">প্রচ্ছদে যান</a></div>
  <div class="more-grid" id="more"></div>
</section>

<div id="siteFooter"></div>

<script src="js/data.js?v=49"></script>
<script src="js/geo.js?v=49"></script>
<script src="js/store.js?v=49"></script>
<script src="js/main.js?v=49"></script>
<script src="js/article.js?v=49"></script>
</body>
</html>
