<?php
/* =====================================================================
   বেদা নিউজ — পোস্ট এপিআই
   ---------------------------------------------------------------------
   খবরগুলো সার্ভারে ../data/posts.json ফাইলে জমা থাকে এবং ছবি ../uploads/
   ফোল্ডারে সেভ হয়। ফলে পোস্ট স্থায়ী — সব ভিজিটর দেখতে পায়, ব্রাউজার
   ডেটা মুছলেও হারায় না।

   হোস্টিংয়ে আপলোড করার পর data/ ও uploads/ ফোল্ডারে লেখার অনুমতি
   (permission 755 বা 775) আছে কি না দেখে নিন।

   অ্যাডমিন পাসওয়ার্ড শুধু এখানেই থাকে — PHP ফাইল সার্ভারে চলে, এর লেখা
   ভিজিটরের ব্রাউজারে কখনো যায় না। বদলাতে চাইলে নিচের লাইনটি বদলান, আর
   js/store.js-এর LOCAL_PASS_SHA256-এ নতুন পাসওয়ার্ডের SHA-256 ছাপ বসান
   (লোকাল মোডের জন্য; ছাপ থেকে পাসওয়ার্ড পড়া যায় না)।
   ===================================================================== */

const ADMIN_PASSWORD = '56631';

/* ভুল পাসওয়ার্ড: একই আইপি থেকে টানা এতবার ভুল হলে এত সেকেন্ড লগইন বন্ধ */
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_SECS = 15 * 60;

/* সর্বোচ্চ কত বড় ছবি নেওয়া হবে (বাইট) */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$base     = dirname(__DIR__);
$dataDir  = $base . '/data';
$upDir    = $base . '/uploads';
$postFile = $dataDir . '/posts.json';
$tokFile  = $dataDir . '/token.php';
$viewFile = $dataDir . '/views.json';     // খবর কতবার পড়া হয়েছে — {"id": সংখ্যা}; খবরের ফাইল থেকে আলাদা
$galFile  = $dataDir . '/gallery.json';   // ফটো অ্যালবাম ও ভিডিও — খবর থেকে আলাদা ফাইলে

/* ---------- গ্যালারি সহায়ক --------------------------------------------- */
/* data URL থেকে ছবি যাচাই করে uploads/-এ সেভ — ফেরত: "uploads/নাম.jpg" */
function save_upload($raw, $name) {
    global $upDir;
    if (!is_string($raw) || strpos($raw, 'data:image/') !== 0) fail('ছবিটি পাওয়া যায়নি।');
    $comma = strpos($raw, ',');
    $bin   = base64_decode($comma === false ? '' : substr($raw, $comma + 1), true);
    if ($bin === false) fail('ছবিটি পড়া যায়নি।');
    if (strlen($bin) > MAX_IMAGE_BYTES) fail('ছবিটি অনেক বড়।');
    if (@getimagesizefromstring($bin) === false) fail('ফাইলটি ছবি নয়।');
    if (!ensureDir($upDir)) fail('uploads ফোল্ডারে লেখার অনুমতি নেই।', 500);
    if (@file_put_contents($upDir . '/' . $name, $bin, LOCK_EX) === false) fail('ছবিটি সংরক্ষণ করা যায়নি।', 500);
    return 'uploads/' . $name;
}

/* ভিডিওর লিংক চেনা — শুধু YouTube ও Facebook */
function parse_video($url) {
    $url = trim((string)$url);
    if (!preg_match('#^https?://#i', $url) || strlen($url) > 500) fail('ভিডিওর পুরো লিংক দিন (https://...)।');
    if (preg_match('~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})~i', $url, $m)) {
        return ['kind' => 'youtube', 'id' => $m[1]];
    }
    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    if (preg_match('/(^|\.)(facebook\.com|fb\.watch)$/', $host)) {
        return ['kind' => 'facebook', 'url' => $url];
    }
    fail('শুধু YouTube বা Facebook ভিডিওর লিংক দেওয়া যাবে।');
}

/* গ্যালারির ফাইল থেকে ছবিগুলো মুছে ফেলা — শুধু uploads/-এর ভেতরের */
function remove_uploads($paths) {
    global $base;
    foreach ($paths as $f) {
        if (is_string($f) && strpos($f, 'uploads/') === 0 && strpos($f, '..') === false) @unlink($base . '/' . $f);
    }
}
$tryFile  = $dataDir . '/attempts.json';  // ভুল লগইনের হিসাব — data/ ফোল্ডার বাইরে থেকে খোলা যায় না

/* ---------- ছোট সহায়ক ------------------------------------------------- */
function out($arr, $code = 200) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($msg, $code = 400) { out(['ok' => false, 'error' => $msg], $code); }

function ensureDir($dir) {
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return false;
    return is_writable($dir);
}

function readPosts($file) {
    if (!is_file($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return [];
    $list = json_decode($raw, true);
    return is_array($list) ? $list : [];
}

/* স্থায়ী ক্রমিক নম্বর (লিংকে /বিভাগ/article/১৫ হিসেবে দেখায়)। নম্বর একবার বসলে আর বদলায়
   না — পুরোনো খবর মুছলেও বাকিদের নম্বর ঠিক থাকে। যেসব খবরে এখনো নম্বর নেই তাদের প্রকাশের
   ক্রমে (পুরোনোটা আগে) নম্বর বসানো হয়। ফেরত: [এখনকার সর্বোচ্চ নম্বর, কিছু বদলেছে কি না]। */
function number_posts(&$list) {
    $maxNo = 0;
    $missing = [];
    foreach ($list as $i => $q) {
        if (isset($q['no'])) { $maxNo = max($maxNo, (int)$q['no']); }
        else { $missing[$i] = isset($q['createdAt']) ? $q['createdAt'] : 0; }
    }
    if (!$missing) return [$maxNo, false];
    asort($missing);
    foreach ($missing as $i => $t) { $maxNo++; $list[$i]['no'] = $maxNo; }
    return [$maxNo, true];
}

/* লেখার সময় ফাইল লক করা হয়, যাতে একসঙ্গে দুটি অনুরোধে ডেটা নষ্ট না হয় */
function writePosts($file, $list) {
    $json = json_encode(array_values($list), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    return @file_put_contents($file, $json, LOCK_EX) !== false;
}

/* একাধিক ডিভাইস/ব্রাউজার/ট্যাব একসাথে লগইন থাকতে পারে (ফোন + কম্পিউটার,
   অথবা দুইজন অ্যাডমিন) — তাই একটিমাত্র টোকেন না রেখে একটি তালিকা রাখা হয়।
   নতুন করে লগইন করলে আগের সেশনগুলো আর বাতিল হয়ে যায় না।                 */
function readTokens($file) {
    if (!is_file($file)) return [];
    $t = @include $file;
    return is_array($t) ? $t : [];
}

function writeTokens($file, $tokens) {
    /* সর্বোচ্চ ২০টি সাম্প্রতিক টোকেন রাখা হয়, পুরোনোগুলো স্বয়ংক্রিয়ভাবে বাদ যায় */
    $tokens = array_slice(array_values(array_unique($tokens)), -20);
    $code = "<?php return " . var_export($tokens, true) . ";\n";
    return @file_put_contents($file, $code, LOCK_EX) !== false;
}

function addToken($file, $token) {
    $tokens = readTokens($file);
    $tokens[] = $token;
    return writeTokens($file, $tokens);
}

function checkAuth($tokFile, $token) {
    if (!is_string($token) || $token === '') return false;
    foreach (readTokens($tokFile) as $saved) {
        if (is_string($saved) && $saved !== '' && hash_equals($saved, $token)) return true;
    }
    return false;
}

/* একটি সাধারণ স্ট্রিং পরিষ্কার করা (প্লেইন টেক্সট ফিল্ডের জন্য) */
function clean($v, $max = 400) {
    $v = is_string($v) ? $v : '';
    $v = strip_tags($v);
    $v = trim($v);
    if (function_exists('mb_substr')) return mb_substr($v, 0, $max, 'UTF-8');
    return substr($v, 0, $max);
}

/* পোস্ট কনটেন্টে (rich text) শুধু নির্দিষ্ট কিছু ট্যাগ অনুমোদিত।
   বাকি সব ট্যাগ সরানো হয় (ভেতরের লেখা থেকে যায়), <a>-তে শুধু নিরাপদ
   http/https/mailto লিংক রাখা হয়, অন্য কোনো অ্যাট্রিবিউট রাখা হয় না।    */
function sanitize_rich($html) {
    $html = (string)$html;
    if ($html === '') return '';
    $allowed = '<p><br><b><strong><i><em><u><ul><ol><li><a><blockquote><mark><h3>';
    $html = strip_tags($html, $allowed);
    $html = preg_replace_callback('/<(\/?)(\w+)([^>]*)>/i', function ($m) {
        $closing = $m[1] !== '';
        $tag = strtolower($m[2]);
        if ($closing) return '</' . $tag . '>';
        if ($tag === 'a') {
            $href = '';
            if (preg_match('/href\s*=\s*"([^"]*)"/i', $m[3], $hm) ||
                preg_match("/href\\s*=\\s*'([^']*)'/i", $m[3], $hm)) {
                $href = trim($hm[1]);
            }
            if (preg_match('#^(https?:|mailto:)#i', $href)) {
                return '<a href="' . htmlspecialchars($href, ENT_QUOTES) . '" target="_blank" rel="noopener noreferrer">';
            }
            return '<a>';
        }
        return '<' . $tag . '>';
    }, $html);
    return $html;
}

/* কমা দিয়ে আলাদা করা শব্দের তালিকা (কীওয়ার্ড) পরিষ্কার করা */
function clean_list($v, $maxItems = 8, $itemMax = 40) {
    if (!is_array($v)) return [];
    $out = [];
    foreach ($v as $item) {
        $s = clean($item, $itemMax);
        if ($s !== '') $out[] = $s;
        if (count($out) >= $maxItems) break;
    }
    return $out;
}

/* ---------- GET: খবরের তালিকা -------------------------------------------
   টোকেন সঠিক হলে খসড়া-সহ সব খবর, নইলে শুধু প্রকাশিত খবর।              */
/* GET ?gallery=1 — ফটো অ্যালবাম ও ভিডিওর তালিকা (সবার জন্য), নতুনগুলো আগে */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['gallery'])) {
    $items = readPosts($galFile);
    usort($items, function ($a, $b) { return ($b['createdAt'] ?? 0) <=> ($a['createdAt'] ?? 0); });
    out(['ok' => true, 'items' => $items]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    /* তালিকাটি gzip করে পাঠানো হয় (~৫৪ KB → প্রায় ১০–১৫ KB) — শুধু ব্রাউজার চাইলে;
       zlib না থাকলে বা সার্ভার নিজেই কম্প্রেস করলে এই লাইন কিছুই করে না। */
    if (function_exists('ob_gzhandler') && !ini_get('zlib.output_compression')) ob_start('ob_gzhandler');
    $posts = readPosts($postFile);
    /* নম্বরহীন পুরোনো খবরে প্রথমবারেই নম্বর বসে যায় (একবারই লেখা হয়, তারপর আর কিছু বদলায় না) */
    list(, $numbered) = number_posts($posts);
    if ($numbered) writePosts($postFile, $posts);
    $qToken = isset($_GET['token']) ? (string)$_GET['token'] : '';
    if (!checkAuth($tokFile, $qToken)) {
        $posts = array_values(array_filter($posts, function ($p) {
            return !isset($p['status']) || $p['status'] !== 'draft';
        }));
    }
    /* প্রতিটি খবরের সঙ্গে কতবার পড়া হয়েছে তা জুড়ে দেওয়া (শুধু পাঠানোর সময়, সংরক্ষণ হয় না) */
    $views = is_file($viewFile) ? json_decode((string)@file_get_contents($viewFile), true) : [];
    if (!is_array($views)) $views = [];
    foreach ($posts as &$p) { $p['views'] = isset($views[(string)$p['id']]) ? (int)$views[(string)$p['id']] : 0; }
    unset($p);
    out(['ok' => true, 'posts' => $posts]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('অনুমোদিত নয়।', 405);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) fail('অনুরোধটি বোঝা যায়নি।');

$action = isset($body['action']) ? $body['action'] : '';

/* ---------- লগইন (শুধু পাসওয়ার্ড) ------------------------------------- */
if ($action === 'login') {
    $pass = isset($body['password']) ? trim((string)$body['password']) : '';
    $ip   = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?';
    if (!ensureDir($dataDir)) fail('data ফোল্ডারে লেখার অনুমতি নেই।', 500);

    /* পাসওয়ার্ড ছোট, তাই আন্দাজে চেষ্টা আটকাতে আইপি-ভিত্তিক লক */
    $tries = is_file($tryFile) ? json_decode((string)@file_get_contents($tryFile), true) : [];
    if (!is_array($tries)) $tries = [];
    $now = time();
    foreach ($tries as $k => $t) { if ($t['until'] < $now && $t['at'] < $now - LOGIN_LOCK_SECS) unset($tries[$k]); }
    $me = isset($tries[$ip]) ? $tries[$ip] : ['fails' => 0, 'until' => 0, 'at' => $now];
    if ($me['until'] > $now) {
        fail('অনেকবার ভুল হয়েছে। ' . ceil(($me['until'] - $now) / 60) . ' মিনিট পরে আবার চেষ্টা করুন।', 429);
    }

    if (!hash_equals(ADMIN_PASSWORD, $pass)) {   // সময়-নিরপেক্ষ তুলনা
        $me['fails']++;
        $me['at'] = $now;
        if ($me['fails'] >= LOGIN_MAX_FAILS) { $me['until'] = $now + LOGIN_LOCK_SECS; $me['fails'] = 0; }
        $tries[$ip] = $me;
        @file_put_contents($tryFile, json_encode($tries), LOCK_EX);
        usleep(400000);                       // ব্রুট-ফোর্স আরও ধীর করা
        fail('পাসওয়ার্ড ঠিক নয়।', 401);
    }
    if (isset($tries[$ip])) {
        unset($tries[$ip]);
        @file_put_contents($tryFile, json_encode($tries), LOCK_EX);
    }

    $token = bin2hex(random_bytes(24));
    if (!addToken($tokFile, $token)) fail('টোকেন সংরক্ষণ করা যায়নি।', 500);
    out(['ok' => true, 'token' => $token]);
}

/* ---------- খবর পড়া হলো: পড়ার সংখ্যা ১ বাড়ানো (লগইন লাগে না) ---------------
   প্রতিবার খোলাই গোনা হয়, সব ডিভাইস মিলিয়ে একটাই মোট সংখ্যা।
   ফাইল লক করে পড়া-লেখা — একসাথে অনেকে খুললেও সংখ্যা হারায় না।           */
if ($action === 'view') {
    $id = isset($body['id']) ? (string)$body['id'] : '';
    if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) fail('খবরটি চেনা যায়নি।');
    $exists = false;
    foreach (readPosts($postFile) as $q) {
        if ((string)$q['id'] === $id && (!isset($q['status']) || $q['status'] !== 'draft')) { $exists = true; break; }
    }
    if (!$exists) fail('খবরটি পাওয়া যায়নি।', 404);
    if (!ensureDir($dataDir)) fail('data ফোল্ডারে লেখার অনুমতি নেই।', 500);

    $fp = @fopen($viewFile, 'c+');
    if (!$fp) fail('পড়ার সংখ্যা সংরক্ষণ করা যায়নি।', 500);
    flock($fp, LOCK_EX);
    $views = json_decode((string)stream_get_contents($fp), true);
    if (!is_array($views)) $views = [];
    $views[$id] = (isset($views[$id]) ? (int)$views[$id] : 0) + 1;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($views));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    out(['ok' => true, 'views' => $views[$id]]);
}

/* এর পরের সব কাজে লগইন লাগবে */
$token = isset($body['token']) ? (string)$body['token'] : '';
if (!checkAuth($tokFile, $token)) fail('আবার লগইন করুন।', 401);

/* ---------- নতুন পোস্ট -------------------------------------------------- */
if ($action === 'create') {
    $p = isset($body['post']) && is_array($body['post']) ? $body['post'] : [];

    $title = clean(isset($p['title']) ? $p['title'] : '', 200);
    $cat   = clean(isset($p['cat']) ? $p['cat'] : '', 40);

    $content = sanitize_rich(isset($p['content']) ? $p['content'] : '');
    $bodyArr = [];
    if ($content === '' && isset($p['body']) && is_array($p['body'])) {
        foreach ($p['body'] as $para) {
            $para = clean($para, 5000);
            if ($para !== '') $bodyArr[] = $para;
        }
    }
    $plainCheck = trim(strip_tags($content));

    if ($title === '') fail('শিরোনাম লিখুন।');
    if ($cat === '')   fail('বিভাগ বাছাই করুন।');
    if ($plainCheck === '' && !count($bodyArr)) fail('পোস্ট কনটেন্ট লিখুন।');

    if (!ensureDir($dataDir)) fail('data ফোল্ডারে লেখার অনুমতি নেই।', 500);

    $id = (string)round(microtime(true) * 1000);

    /* ছবি: data URL এলে ফাইল হিসেবে সেভ করা হয় */
    $img = '';
    $raw = isset($p['img']) ? (string)$p['img'] : '';
    if ($raw !== '' && strpos($raw, 'data:image/') === 0) {
        $comma = strpos($raw, ',');
        $b64   = $comma === false ? '' : substr($raw, $comma + 1);
        $bin   = base64_decode($b64, true);
        if ($bin === false) fail('ছবিটি পড়া যায়নি।');
        if (strlen($bin) > MAX_IMAGE_BYTES) fail('ছবিটি অনেক বড়।');
        if (!ensureDir($upDir)) fail('uploads ফোল্ডারে লেখার অনুমতি নেই।', 500);

        /* সত্যিই ছবি কি না যাচাই */
        $info = @getimagesizefromstring($bin);
        if ($info === false) fail('ফাইলটি ছবি নয়।');

        $name = $id . '.jpg';
        if (@file_put_contents($upDir . '/' . $name, $bin, LOCK_EX) === false)
            fail('ছবিটি সংরক্ষণ করা যায়নি।', 500);
        $img = 'uploads/' . $name;
    }

    $excerptSrc = isset($p['excerpt']) && trim((string)$p['excerpt']) !== ''
        ? $p['excerpt'] : ($bodyArr[0] ?? $plainCheck);
    $excerpt = clean($excerptSrc, 300);

    $status = (isset($p['status']) && $p['status'] === 'draft') ? 'draft' : 'published';

    $post = [
        'id'          => $id,
        'cat'         => $cat,
        'subcat'      => clean(isset($p['subcat']) ? $p['subcat'] : '', 60),
        'title'       => $title,
        'subHeadline' => clean(isset($p['subHeadline']) ? $p['subHeadline'] : '', 240),
        'excerpt'     => $excerpt,
        'content'     => $content,
        'body'        => $bodyArr,
        'img'         => $img,
        'imgCaption'  => clean(isset($p['imgCaption']) ? $p['imgCaption'] : '', 220),
        'author'      => clean(isset($p['author']) ? $p['author'] : 'নিজস্ব প্রতিবেদক', 80),
        'keywords'    => clean_list(isset($p['keywords']) ? $p['keywords'] : []),
        'division'    => clean(isset($p['division']) ? $p['division'] : '', 40),
        'district'    => clean(isset($p['district']) ? $p['district'] : '', 60),
        'upazila'     => clean(isset($p['upazila']) ? $p['upazila'] : '', 60),
        'isLead'      => !empty($p['isLead']),
        'exclusive'   => !empty($p['exclusive']),
        'status'      => $status,
        'read'        => max(1, (int)(isset($p['read']) ? $p['read'] : 1)),
        'createdAt'   => round(microtime(true) * 1000)
    ];

    $list = readPosts($postFile);

    /* নতুন খবর পায় পরের নম্বর (নম্বরহীন পুরোনো খবর থাকলে আগে তাদের নম্বর বসে) */
    list($maxNo) = number_posts($list);
    $post['no'] = $maxNo + 1;

    array_unshift($list, $post);
    if (!writePosts($postFile, $list)) fail('খবরটি সংরক্ষণ করা যায়নি।', 500);

    out(['ok' => true, 'post' => $post]);
}

/* ---------- পোস্ট সম্পাদনা (এডিট) — id ও createdAt অপরিবর্তিত থাকে -------- */
if ($action === 'update') {
    $id = clean(isset($body['id']) ? $body['id'] : '', 40);
    if ($id === '') fail('কোন খবরটি এডিট করবেন তা বলা হয়নি।');

    $p = isset($body['post']) && is_array($body['post']) ? $body['post'] : [];

    $title = clean(isset($p['title']) ? $p['title'] : '', 200);
    $cat   = clean(isset($p['cat']) ? $p['cat'] : '', 40);

    $content = sanitize_rich(isset($p['content']) ? $p['content'] : '');
    $bodyArr = [];
    if ($content === '' && isset($p['body']) && is_array($p['body'])) {
        foreach ($p['body'] as $para) {
            $para = clean($para, 5000);
            if ($para !== '') $bodyArr[] = $para;
        }
    }
    $plainCheck = trim(strip_tags($content));

    if ($title === '') fail('শিরোনাম লিখুন।');
    if ($cat === '')   fail('বিভাগ বাছাই করুন।');
    if ($plainCheck === '' && !count($bodyArr)) fail('পোস্ট কনটেন্ট লিখুন।');

    $list = readPosts($postFile);
    $idx = null;
    foreach ($list as $i => $existing) {
        if (isset($existing['id']) && (string)$existing['id'] === $id) { $idx = $i; break; }
    }
    if ($idx === null) fail('খবরটি পাওয়া যায়নি।', 404);
    $old = $list[$idx];

    /* ছবি: নতুন data URL এলে নতুন ফাইল সেভ হয় ও পুরনোটি মুছে যায়;
       ফাঁকা পাঠালে ছবি সরিয়ে দেওয়া হয়; uploads/ পাথ অপরিবর্তিত পাঠালে তা-ই থাকে */
    $img = isset($old['img']) ? $old['img'] : '';
    $raw = isset($p['img']) ? (string)$p['img'] : '';
    if ($raw !== '' && strpos($raw, 'data:image/') === 0) {
        $comma = strpos($raw, ',');
        $b64   = $comma === false ? '' : substr($raw, $comma + 1);
        $bin   = base64_decode($b64, true);
        if ($bin === false) fail('ছবিটি পড়া যায়নি।');
        if (strlen($bin) > MAX_IMAGE_BYTES) fail('ছবিটি অনেক বড়।');
        if (!ensureDir($upDir)) fail('uploads ফোল্ডারে লেখার অনুমতি নেই।', 500);

        $info = @getimagesizefromstring($bin);
        if ($info === false) fail('ফাইলটি ছবি নয়।');

        if (!empty($old['img']) && strpos($old['img'], 'uploads/') === 0 && strpos($old['img'], '..') === false) {
            @unlink($base . '/' . $old['img']);
        }
        $name = $id . '-' . round(microtime(true) * 1000) . '.jpg';
        if (@file_put_contents($upDir . '/' . $name, $bin, LOCK_EX) === false)
            fail('ছবিটি সংরক্ষণ করা যায়নি।', 500);
        $img = 'uploads/' . $name;
    } elseif ($raw === '' && array_key_exists('img', $p)) {
        if (!empty($old['img']) && strpos($old['img'], 'uploads/') === 0 && strpos($old['img'], '..') === false) {
            @unlink($base . '/' . $old['img']);
        }
        $img = '';
    }

    $excerptSrc = isset($p['excerpt']) && trim((string)$p['excerpt']) !== ''
        ? $p['excerpt'] : ($bodyArr[0] ?? $plainCheck);
    $excerpt = clean($excerptSrc, 300);

    $status = (isset($p['status']) && $p['status'] === 'draft') ? 'draft' : 'published';

    $updated = [
        'id'          => $id,
        'cat'         => $cat,
        'subcat'      => clean(isset($p['subcat']) ? $p['subcat'] : '', 60),
        'title'       => $title,
        'subHeadline' => clean(isset($p['subHeadline']) ? $p['subHeadline'] : '', 240),
        'excerpt'     => $excerpt,
        'content'     => $content,
        'body'        => $bodyArr,
        'img'         => $img,
        'imgCaption'  => clean(isset($p['imgCaption']) ? $p['imgCaption'] : '', 220),
        'author'      => clean(isset($p['author']) ? $p['author'] : 'নিজস্ব প্রতিবেদক', 80),
        'keywords'    => clean_list(isset($p['keywords']) ? $p['keywords'] : []),
        'division'    => clean(isset($p['division']) ? $p['division'] : '', 40),
        'district'    => clean(isset($p['district']) ? $p['district'] : '', 60),
        'upazila'     => clean(isset($p['upazila']) ? $p['upazila'] : '', 60),
        'isLead'      => !empty($p['isLead']),
        'exclusive'   => !empty($p['exclusive']),
        'status'      => $status,
        'read'        => max(1, (int)(isset($p['read']) ? $p['read'] : 1)),
        'createdAt'   => isset($old['createdAt']) ? $old['createdAt'] : round(microtime(true) * 1000),
        'updatedAt'   => round(microtime(true) * 1000)   // সম্পাদনার সময় — খবরের পাতায় "হালনাগাদ" হিসেবে দেখায়
    ];

    if (isset($old['no'])) $updated['no'] = $old['no'];   /* সম্পাদনায় নম্বর বদলায় না */

    $list[$idx] = $updated;
    if (!writePosts($postFile, $list)) fail('সংরক্ষণ করা যায়নি।', 500);

    out(['ok' => true, 'post' => $updated]);
}

/* ---------- খসড়া থেকে প্রকাশ করা ---------------------------------------- */
if ($action === 'publish') {
    $id = clean(isset($body['id']) ? $body['id'] : '', 40);
    if ($id === '') fail('কোন খবরটি প্রকাশ করবেন তা বলা হয়নি।');

    $list = readPosts($postFile);
    $found = false;
    foreach ($list as &$p) {
        if (isset($p['id']) && (string)$p['id'] === $id) {
            $p['status'] = 'published';
            $found = true;
            break;
        }
    }
    unset($p);
    if (!$found) fail('খবরটি পাওয়া যায়নি।', 404);

    if (!writePosts($postFile, $list)) fail('সংরক্ষণ করা যায়নি।', 500);
    out(['ok' => true]);
}

/* ---------- পোস্ট মুছে ফেলা ---------------------------------------------- */
if ($action === 'delete') {
    $id = clean(isset($body['id']) ? $body['id'] : '', 40);
    if ($id === '') fail('কোন খবরটি মুছবেন তা বলা হয়নি।');

    $list = readPosts($postFile);
    $kept = [];
    $gone = null;
    foreach ($list as $p) {
        if (isset($p['id']) && (string)$p['id'] === $id) { $gone = $p; continue; }
        $kept[] = $p;
    }
    if ($gone === null) fail('খবরটি পাওয়া যায়নি।', 404);

    /* ছবিটিও মুছে ফেলা — শুধু uploads/ ফোল্ডারের ভেতরের ফাইল */
    if (!empty($gone['img']) && strpos($gone['img'], 'uploads/') === 0 && strpos($gone['img'], '..') === false) {
        @unlink($base . '/' . $gone['img']);
    }

    if (!writePosts($postFile, $kept)) fail('মুছে ফেলা যায়নি।', 500);
    out(['ok' => true]);
}

/* ---------- গ্যালারি: নতুন অ্যালবাম/ভিডিও, অ্যালবামে ছবি যোগ, মুছে ফেলা ---------
   অ্যালবামের ছবি একটি একটি করে আসে — অনেক ছবি একসাথে পাঠালে সাধারণ হোস্টিংয়ের
   আপলোড-সীমা (post_max_size) ছাড়িয়ে যেত।                                   */
if ($action === 'gallery_add') {
    $g = isset($body['item']) && is_array($body['item']) ? $body['item'] : [];
    $type  = isset($g['type']) && $g['type'] === 'video' ? 'video' : 'photo';
    $title = clean(isset($g['title']) ? $g['title'] : '', 200);
    if ($title === '') fail('শিরোনাম লিখুন।');
    if (!ensureDir($dataDir)) fail('data ফোল্ডারে লেখার অনুমতি নেই।', 500);

    $id = (string)round(microtime(true) * 1000);
    $item = ['id' => $id, 'type' => $type, 'title' => $title,
             'caption' => clean(isset($g['caption']) ? $g['caption'] : '', 500),
             'createdAt' => round(microtime(true) * 1000)];
    if ($type === 'photo') {
        $item['photos'] = [save_upload(isset($g['img']) ? $g['img'] : '', $id . '-1.jpg')];
    } else {
        $item['video'] = parse_video(isset($g['url']) ? $g['url'] : '');
        $item['thumb'] = !empty($g['thumb']) ? save_upload($g['thumb'], $id . '-0.jpg') : '';
    }
    $items = readPosts($galFile);
    array_unshift($items, $item);
    if (!writePosts($galFile, $items)) fail('সংরক্ষণ করা যায়নি।', 500);
    out(['ok' => true, 'item' => $item]);
}

if ($action === 'gallery_photo') {
    $id = clean(isset($body['id']) ? $body['id'] : '', 40);
    $items = readPosts($galFile);
    foreach ($items as &$it) {
        if ((string)$it['id'] !== $id || $it['type'] !== 'photo') continue;
        if (count($it['photos']) >= 40) fail('একটি অ্যালবামে সর্বোচ্চ ৪০টি ছবি রাখা যায়।');
        $it['photos'][] = save_upload(isset($body['img']) ? $body['img'] : '', $id . '-' . (count($it['photos']) + 1) . '.jpg');
        if (!writePosts($galFile, $items)) fail('সংরক্ষণ করা যায়নি।', 500);
        out(['ok' => true, 'item' => $it]);
    }
    unset($it);
    fail('অ্যালবামটি পাওয়া যায়নি।', 404);
}

if ($action === 'gallery_delete') {
    $id = clean(isset($body['id']) ? $body['id'] : '', 40);
    $items = readPosts($galFile);
    $kept = [];
    $gone = null;
    foreach ($items as $it) {
        if ((string)$it['id'] === $id) { $gone = $it; continue; }
        $kept[] = $it;
    }
    if ($gone === null) fail('পাওয়া যায়নি।', 404);
    remove_uploads(array_merge(isset($gone['photos']) ? $gone['photos'] : [], [isset($gone['thumb']) ? $gone['thumb'] : '']));
    if (!writePosts($galFile, $kept)) fail('মুছে ফেলা যায়নি।', 500);
    out(['ok' => true]);
}

fail('অজানা অনুরোধ।');
