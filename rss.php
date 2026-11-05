<?php
/* =====================================================================
   RSS ফিড — সাইটের ঠিকানা/rss.php (বা /rss, /feed)
   ---------------------------------------------------------------------
   সাম্প্রতিক ৩০টি প্রকাশিত খবর, যেগুলোতে অ্যাডমিনে "RSS" চিহ্ন দেওয়া আছে
   (নতুন খবরে চিহ্নটি আগে থেকেই দেওয়া থাকে; পুরোনো খবরও ফিডে থাকে)।
   গুগল নিউজ, ফিড রিডার, অন্য সাইট এই ঠিকানা থেকে খবর নিতে পারে।
   ===================================================================== */

$postFile = __DIR__ . '/data/posts.json';
$list = is_file($postFile) ? json_decode((string)@file_get_contents($postFile), true) : [];
if (!is_array($list)) $list = [];

$list = array_values(array_filter($list, function ($p) {
    return (!isset($p['status']) || $p['status'] !== 'draft') && empty($p['trashed']) && (!isset($p['rss']) || $p['rss']);
}));
usort($list, function ($a, $b) { return ($b['createdAt'] ?? 0) <=> ($a['createdAt'] ?? 0); });
$list = array_slice($list, 0, 30);

/* বিভাগের বাংলা নাম — js/data.js (বা বিল্ড করা js/core.*.js) থেকে পড়া; না পেলে slug */
$catNames = [];
foreach (array_merge(glob(__DIR__ . '/js/data.js') ?: [], glob(__DIR__ . '/js/core.*.js') ?: []) as $f) {
    if (preg_match_all('/\{\s*slug:\s*"([\w-]+)",\s*name:\s*"([^"]+)"\s*\}/u', (string)@file_get_contents($f), $m, PREG_SET_ORDER)) {
        foreach ($m as $row) $catNames[$row[1]] = $row[2];
        break;
    }
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443')
      || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && stripos($_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false)
      || (isset($_SERVER['HTTP_CF_VISITOR']) && stripos($_SERVER['HTTP_CF_VISITOR'], 'https') !== false);
$origin = ($https ? 'https://' : 'http://') . (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
$x = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_XML1, 'UTF-8'); };

header('Content-Type: application/rss+xml; charset=utf-8');
header('Cache-Control: public, max-age=300');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>বেদা নিউজ</title>
  <link><?php echo $x($origin . '/'); ?></link>
  <description>দেশ ও বিশ্বের সর্বশেষ খবর।</description>
  <language>bn</language>
  <atom:link href="<?php echo $x($origin . '/rss.php'); ?>" rel="self" type="application/rss+xml"/>
  <lastBuildDate><?php echo date(DATE_RSS, $list ? (int)(($list[0]['updatedAt'] ?? $list[0]['createdAt'] ?? 0) / 1000) : time()); ?></lastBuildDate>
<?php foreach ($list as $p):
    $url = $origin . '/article.html?' . (isset($p['no']) ? 'n=' . (int)$p['no'] : 'id=' . rawurlencode((string)$p['id']));
    $img = (!empty($p['img']) && strpos($p['img'], 'uploads/') === 0 && strpos($p['img'], '..') === false && is_file(__DIR__ . '/' . $p['img']))
         ? $p['img'] : '';
    $cat = isset($p['cat']) ? ($catNames[$p['cat']] ?? $p['cat']) : '';
?>
  <item>
    <title><?php echo $x($p['title'] ?? ''); ?></title>
    <link><?php echo $x($url); ?></link>
    <guid isPermaLink="true"><?php echo $x($url); ?></guid>
    <pubDate><?php echo date(DATE_RSS, (int)(($p['createdAt'] ?? 0) / 1000)); ?></pubDate>
<?php if ($cat !== ''): ?>    <category><?php echo $x($cat); ?></category>
<?php endif; ?>
<?php if (!empty($p['author'])): ?>    <dc:creator><?php echo $x($p['author']); ?></dc:creator>
<?php endif; ?>
    <description><?php echo $x($p['excerpt'] ?? ''); ?></description>
<?php if ($img !== ''): ?>    <enclosure url="<?php echo $x($origin . '/' . $img); ?>" length="<?php echo (int)@filesize(__DIR__ . '/' . $img); ?>" type="image/jpeg"/>
    <media:content url="<?php echo $x($origin . '/' . $img); ?>" medium="image"/>
<?php endif; ?>
  </item>
<?php endforeach; ?>
</channel>
</rss>
