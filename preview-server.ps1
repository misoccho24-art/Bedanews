# =====================================================================
#  বেদা নিউজ — লোকাল টেস্ট সার্ভার (উইন্ডোজ, কিছু ইনস্টল করতে হয় না)
#  ---------------------------------------------------------------------
#  ডান-ক্লিক করে "Run with PowerShell" চাপুন।
#
#  ফোন থেকেও দেখতে চাইলে:
#    → স্ক্রিপ্টটি "Run as Administrator" দিয়ে চালান।
#    → চালু হলে পর্দায় যে নেটওয়ার্ক ঠিকানা দেখাবে (যেমন http://192.168.0.5:5599)
#      সেটি ফোনের ব্রাউজারে লিখুন। ফোন ও পিসি একই ওয়াই-ফাইতে থাকতে হবে।
#    → তখন পিসি থেকে পোস্ট করলে ফোনেও দেখা যাবে, কারণ দুটি ডিভাইসই
#      একই সার্ভারে যুক্ত।
#
#  এটি api/posts.php-এর মতো একই কাজ করে (পোস্ট data/posts.json-এ জমা হয়,
#  ছবি uploads/ ফোল্ডারে)। ফলে PHP ছাড়াই পুরো সাইটটি আসল আচরণে চালানো ও
#  পরীক্ষা করা যায়। আসল হোস্টিংয়ে PHP ফাইলটিই কাজ করবে।
# =====================================================================

param(
  [string]$Root = $PSScriptRoot,
  [int]$Port = 5599,
  [string]$AdminPassword = '56631',
  [switch]$LocalOnly              # শুধু এই পিসিতে সীমাবদ্ধ রাখতে চাইলে
)

# বাংলা লেখা যেন কনসোলে ঠিকভাবে দেখায়
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$dataDir  = Join-Path $Root "data"
$upDir    = Join-Path $Root "uploads"
$postFile = Join-Path $dataDir "posts.json"
$viewFile = Join-Path $dataDir "views.json"   # খবর কতবার পড়া হয়েছে — api/posts.php-এর মতো
$script:Tokens = New-Object System.Collections.Generic.List[string]  # একাধিক ডিভাইস একসাথে লগইন থাকতে পারে

# ---- এই পিসির নেটওয়ার্ক (ওয়াই-ফাই/ল্যান) ঠিকানা বের করা ----
function Get-LanAddress {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
          Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
          Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { return $ip }
  } catch {}
  try {
    return (
      [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
      Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notmatch '^(127\.|169\.254\.)' } |
      Select-Object -First 1
    ).IPAddressToString
  } catch { return $null }
}

$lan = Get-LanAddress
$listener = New-Object System.Net.HttpListener
$sharedOnNetwork = $false

# সব নেটওয়ার্ক ইন্টারফেসে শোনার চেষ্টা (এতে ফোন থেকেও ঢোকা যায়)।
# এর জন্য অ্যাডমিনিস্ট্রেটর অনুমতি লাগে; না থাকলে শুধু এই পিসিতে চলবে।
if (-not $LocalOnly) {
  try {
    $listener.Prefixes.Add("http://+:$Port/")
    $listener.Start()
    $sharedOnNetwork = $true
  } catch {
    $listener.Close()
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
  }
} else {
  $listener.Prefixes.Add("http://localhost:$Port/")
  $listener.Start()
}

Write-Output ""
Write-Output "  বেদা নিউজ — টেস্ট সার্ভার চালু"
Write-Output "  ---------------------------------------------------------"
Write-Output "  এই পিসিতে :  http://localhost:$Port"

if ($sharedOnNetwork -and $lan) {
  Write-Output "  ফোন/অন্য ডিভাইসে :  http://${lan}:$Port"
  Write-Output ""
  Write-Output "  ফোন ও পিসি একই ওয়াই-ফাইতে রাখুন। প্রথমবার উইন্ডোজ ফায়ারওয়াল"
  Write-Output "  অনুমতি চাইলে 'Allow access' চাপুন।"
} else {
  Write-Output ""
  Write-Output "  ** ফোন থেকে এখন ঢোকা যাবে না **"
  Write-Output "  সার্ভারটি শুধু এই পিসিতে সীমাবদ্ধ (অ্যাডমিন অনুমতি নেই)।"
  Write-Output "  ফোনেও দেখতে চাইলে স্ক্রিপ্টটি বন্ধ করে PowerShell-এ ডান-ক্লিক"
  Write-Output "  করে 'Run as Administrator' দিয়ে আবার চালান।"
}
Write-Output "  ---------------------------------------------------------"
Write-Output "  বন্ধ করতে এই উইন্ডোতে Ctrl+C চাপুন।"
Write-Output ""

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".gif"  = "image/gif"
  ".ico"  = "image/x-icon"
}

function Send-Bytes($ctx, [byte[]]$bytes, [string]$type, [int]$code) {
  try {
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = $type
    $ctx.Response.Headers["Cache-Control"] = "no-store"
    # দৈর্ঘ্য আগে জানিয়ে দিলে "exceed the Content-Length" সমস্যা হয় না
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    # ব্রাউজার সংযোগ কেটে দিলে (পেজ বদল/রিফ্রেশ) এখানে আসে — উপেক্ষা করা যায়
  }
}

function Send-Json($ctx, $obj, [int]$code = 200) {
  $json = $obj | ConvertTo-Json -Depth 12 -Compress
  Send-Bytes $ctx ([System.Text.Encoding]::UTF8.GetBytes($json)) "application/json; charset=utf-8" $code
}

function Read-Posts {
  if (-not (Test-Path $postFile)) { return @() }
  try {
    $raw = Get-Content $postFile -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
    $list = $raw | ConvertFrom-Json
    if ($null -eq $list) { return @() }
    return @($list)
  } catch { return @() }
}

# ---- গ্যালারি (ফটো অ্যালবাম ও ভিডিও) — api/posts.php-এর মতো ----
$galFile = Join-Path $dataDir "gallery.json"
function Read-Gallery {
  if (-not (Test-Path $galFile)) { return @() }
  try {
    $raw = Get-Content $galFile -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
    $list = $raw | ConvertFrom-Json
    if ($null -eq $list) { return @() }
    return @($list)
  } catch { return @() }
}
function Write-Gallery($list) {
  if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force $dataDir | Out-Null }
  $json = ConvertTo-Json @($list) -Depth 12
  [System.IO.File]::WriteAllText($galFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}
# data URL ছবি uploads/-এ সেভ; ভুল হলে $null
function Save-Upload([string]$raw, [string]$name) {
  if (-not $raw.StartsWith("data:image/")) { return $null }
  $comma = $raw.IndexOf(',')
  if ($comma -lt 0) { return $null }
  try {
    $bin = [Convert]::FromBase64String($raw.Substring($comma + 1))
    if ($bin.Length -gt 3MB) { return $null }
    if (-not (Test-Path $upDir)) { New-Item -ItemType Directory -Force $upDir | Out-Null }
    [System.IO.File]::WriteAllBytes((Join-Path $upDir $name), $bin)
    return "uploads/$name"
  } catch { return $null }
}
# ভিডিওর লিংক — শুধু YouTube ও Facebook; না মিললে $null
function Parse-Video([string]$url) {
  $url = $url.Trim()
  if ($url -notmatch '^https?://' -or $url.Length -gt 500) { return $null }
  $m = [regex]::Match($url, '(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})', 'IgnoreCase')
  if ($m.Success) { return [ordered]@{ kind = "youtube"; id = $m.Groups[1].Value } }
  try { $h = ([Uri]$url).Host.ToLower() } catch { return $null }
  if ($h -match '(^|\.)(facebook\.com|fb\.watch)$') { return [ordered]@{ kind = "facebook"; url = $url } }
  return $null
}

function Write-Posts($list) {
  if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force $dataDir | Out-Null }
  $json = ConvertTo-Json @($list) -Depth 12
  [System.IO.File]::WriteAllText($postFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

# পড়ার সংখ্যা: { "id": সংখ্যা } — হ্যাশটেবল হিসেবে ফেরত
function Read-Views {
  $h = @{}
  if (Test-Path $viewFile) {
    try {
      $obj = (Get-Content $viewFile -Raw -Encoding UTF8) | ConvertFrom-Json
      if ($obj) { foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = [int]$p.Value } }
    } catch {}
  }
  return $h
}

function Write-Views($h) {
  if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force $dataDir | Out-Null }
  $json = $h | ConvertTo-Json -Compress
  if (-not $json -or $h.Count -eq 0) { $json = "{}" }
  [System.IO.File]::WriteAllText($viewFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

# পোস্ট কনটেন্টে শুধু নির্দিষ্ট কিছু ট্যাগ অনুমোদিত — বাকি সব সরানো হয়
# (ভেতরের লেখা থেকে যায়), api/posts.php-এর sanitize_rich()-এর সমমানের
# হোয়াইটলিস্ট যুক্তি, যাতে লোকাল টেস্ট আসল সার্ভারের আচরণ ঠিকভাবে দেখায়।
function Sanitize-Rich([string]$html) {
  if (-not $html) { return "" }
  $html = [regex]::Replace($html, '(?is)<(script|style|iframe|object|embed)[^>]*>.*?</\1>', '')
  $html = [regex]::Replace($html, '(?is)<(script|style|iframe|object|embed)[^>]*/?>', '')

  $allowed = @('p','br','b','strong','i','em','u','ul','ol','li','a','blockquote','mark','h3')
  $pattern = [regex]'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>'
  $sb = New-Object System.Text.StringBuilder
  $last = 0
  foreach ($m in $pattern.Matches($html)) {
    $sb.Append($html.Substring($last, $m.Index - $last)) | Out-Null
    $closing = $m.Groups[1].Value -ne ""
    $tag = $m.Groups[2].Value.ToLower()
    $attrs = $m.Groups[3].Value
    if ($allowed -contains $tag) {
      if ($closing) {
        [void]$sb.Append("</$tag>")
      } elseif ($tag -eq "a") {
        $href = ""
        $hm = [regex]::Match($attrs, 'href\s*=\s*"([^"]*)"')
        if (-not $hm.Success) { $hm = [regex]::Match($attrs, "href\s*=\s*'([^']*)'") }
        if ($hm.Success) { $href = $hm.Groups[1].Value.Trim() }
        if ($href -match '^(https?:|mailto:)') {
          $safe = [System.Net.WebUtility]::HtmlEncode($href)
          [void]$sb.Append("<a href=`"$safe`" target=`"_blank`" rel=`"noopener noreferrer`">")
        } else {
          [void]$sb.Append("<a>")
        }
      } else {
        [void]$sb.Append("<$tag>")
      }
    }
    # অনুমোদিত না হলে ট্যাগ বাদ যায়, ভেতরের লেখা এমনিতেই টেক্সটে থেকে যায়
    $last = $m.Index + $m.Length
  }
  [void]$sb.Append($html.Substring($last))
  return $sb.ToString()
}

function Clean-List($arr, [int]$maxItems = 8) {
  $out = @()
  foreach ($x in @($arr)) {
    $s = ("" + $x).Trim()
    if ($s) { $out += $s }
    if ($out.Count -ge $maxItems) { break }
  }
  return , $out
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')

    # ---------------- API ----------------
    if ($path -eq "api/posts.php") {

      # GET ?gallery=1 — ফটো অ্যালবাম ও ভিডিওর তালিকা, নতুনগুলো আগে
      if ($ctx.Request.HttpMethod -eq "GET" -and $null -ne $ctx.Request.QueryString["gallery"]) {
        $items = @(Read-Gallery | Sort-Object { [int64]$_.createdAt } -Descending)
        Send-Json $ctx @{ ok = $true; items = $items }
        $ctx.Response.Close(); continue
      }

      if ($ctx.Request.HttpMethod -eq "GET") {
        $qToken = $ctx.Request.QueryString["token"]
        $authed = (-not [string]::IsNullOrEmpty($qToken)) -and $script:Tokens.Contains([string]$qToken)
        $all = @(Read-Posts)
        # নম্বরহীন পুরোনো খবরে প্রথমবারেই নম্বর বসে (api/posts.php-এর number_posts()-এর মতো)
        $maxNo = 0
        foreach ($q in $all) { if ($null -ne $q.no) { $maxNo = [Math]::Max($maxNo, [int]$q.no) } }
        $unnumbered = @($all | Where-Object { $null -eq $_.no } | Sort-Object { [int64]$_.createdAt })
        if ($unnumbered.Count -gt 0) {
          foreach ($q in $unnumbered) { $maxNo++; $q | Add-Member -NotePropertyName no -NotePropertyValue $maxNo -Force }
          Write-Posts $all
        }
        if (-not $authed) {
          $all = @($all | Where-Object { $_.status -ne "draft" })
        }
        # প্রতিটি খবরের সঙ্গে পড়ার সংখ্যা (শুধু পাঠানোর সময়)
        $views = Read-Views
        foreach ($q in $all) {
          $n = 0; if ($views.ContainsKey([string]$q.id)) { $n = $views[[string]$q.id] }
          $q | Add-Member -NotePropertyName views -NotePropertyValue $n -Force
        }
        Send-Json $ctx @{ ok = $true; posts = $all }
        $ctx.Response.Close(); continue
      }

      if ($ctx.Request.HttpMethod -ne "POST") {
        Send-Json $ctx @{ ok = $false; error = "অনুমোদিত নয়।" } 405
        $ctx.Response.Close(); continue
      }

      $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
      $bodyRaw = $reader.ReadToEnd(); $reader.Close()
      try { $body = $bodyRaw | ConvertFrom-Json } catch { $body = $null }

      if ($null -eq $body) {
        Send-Json $ctx @{ ok = $false; error = "অনুরোধটি বোঝা যায়নি।" } 400
        $ctx.Response.Close(); continue
      }

      # ---- লগইন (শুধু পাসওয়ার্ড) ----
      if ($body.action -eq "login") {
        $passOk  = ([string]$body.password).Trim() -ceq $AdminPassword
        if (-not $passOk) {
          Start-Sleep -Milliseconds 400
          Send-Json $ctx @{ ok = $false; error = "পাসওয়ার্ড ঠিক নয়।" } 401
        } else {
          $newToken = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
          $script:Tokens.Add($newToken)
          if ($script:Tokens.Count -gt 20) { $script:Tokens.RemoveAt(0) }  # পুরোনো টোকেন ছেঁটে ফেলা
          Send-Json $ctx @{ ok = $true; token = $newToken }
        }
        $ctx.Response.Close(); continue
      }

      # ---- খবর পড়া হলো: পড়ার সংখ্যা ১ বাড়ানো (লগইন লাগে না) ----
      if ($body.action -eq "view") {
        $vid = [string]$body.id
        $post = @(Read-Posts) | Where-Object { [string]$_.id -eq $vid -and $_.status -ne "draft" } | Select-Object -First 1
        if ($vid -notmatch '^[A-Za-z0-9_-]{1,40}$' -or -not $post) {
          Send-Json $ctx @{ ok = $false; error = "খবরটি পাওয়া যায়নি।" } 404
        } else {
          $views = Read-Views
          $count = 1; if ($views.ContainsKey($vid)) { $count = $views[$vid] + 1 }
          $views[$vid] = $count
          Write-Views $views
          Send-Json $ctx @{ ok = $true; views = $count }
        }
        $ctx.Response.Close(); continue
      }

      # ---- এর পরের সব কাজে টোকেন লাগবে ----
      if ([string]::IsNullOrEmpty([string]$body.token) -or -not $script:Tokens.Contains([string]$body.token)) {
        Send-Json $ctx @{ ok = $false; error = "আবার লগইন করুন।" } 401
        $ctx.Response.Close(); continue
      }

      # ---- নতুন পোস্ট ----
      if ($body.action -eq "create") {
        $p = $body.post
        $title = ("" + $p.title).Trim()
        $cat   = ("" + $p.cat).Trim()

        $content = Sanitize-Rich("" + $p.content)
        $paras = @()
        if (-not $content -and $p.body) {
          foreach ($x in @($p.body)) { $t = ("" + $x).Trim(); if ($t) { $paras += $t } }
        }
        $plainCheck = ([regex]::Replace($content, '<[^>]*>', '')).Trim()

        if (-not $title) { Send-Json $ctx @{ ok=$false; error="শিরোনাম লিখুন।" } 400; $ctx.Response.Close(); continue }
        if (-not $cat)   { Send-Json $ctx @{ ok=$false; error="বিভাগ বাছাই করুন।" } 400; $ctx.Response.Close(); continue }
        if (-not $plainCheck -and $paras.Count -eq 0) { Send-Json $ctx @{ ok=$false; error="পোস্ট কনটেন্ট লিখুন।" } 400; $ctx.Response.Close(); continue }

        $id = [string][int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())

        $img = ""
        $rawImg = "" + $p.img
        if ($rawImg.StartsWith("data:image/")) {
          $comma = $rawImg.IndexOf(',')
          if ($comma -ge 0) {
            try {
              $bin = [Convert]::FromBase64String($rawImg.Substring($comma + 1))
              if (-not (Test-Path $upDir)) { New-Item -ItemType Directory -Force $upDir | Out-Null }
              [System.IO.File]::WriteAllBytes((Join-Path $upDir "$id.jpg"), $bin)
              $img = "uploads/$id.jpg"
            } catch { $img = "" }
          }
        }

        $excerpt = if ($p.excerpt) { "" + $p.excerpt } elseif ($paras.Count -gt 0) { $paras[0] } else { $plainCheck }
        $readMin = 1
        if ($p.read) { $readMin = [int]$p.read }
        $status = if (("" + $p.status) -eq "draft") { "draft" } else { "published" }

        $post = [ordered]@{
          id          = $id
          cat         = $cat
          subcat      = "" + $p.subcat
          title       = $title
          subHeadline = "" + $p.subHeadline
          excerpt     = $excerpt
          content     = $content
          body        = @($paras)
          img         = $img
          imgCaption  = "" + $p.imgCaption
          author      = $(if ($p.author) { "" + $p.author } else { "নিজস্ব প্রতিবেদক" })
          keywords    = Clean-List $p.keywords
          division    = "" + $p.division
          district    = "" + $p.district
          upazila     = "" + $p.upazila
          isLead      = [bool]$p.isLead
          exclusive   = [bool]$p.exclusive
          status      = $status
          read        = [Math]::Max(1, $readMin)
          createdAt   = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        }

        # স্থায়ী ক্রমিক নম্বর — api/posts.php-এর মতো: নম্বরহীন পুরোনো খবরে আগে (পুরোনোটা আগে) নম্বর বসে
        $existing = @(Read-Posts)
        $maxNo = 0
        foreach ($q in $existing) { if ($null -ne $q.no) { $maxNo = [Math]::Max($maxNo, [int]$q.no) } }
        foreach ($q in @($existing | Where-Object { $null -eq $_.no } | Sort-Object { [int64]$_.createdAt })) {
          $maxNo++
          $q | Add-Member -NotePropertyName no -NotePropertyValue $maxNo -Force
        }
        $post['no'] = $maxNo + 1
        $list = @($post) + $existing
        Write-Posts $list
        Send-Json $ctx @{ ok = $true; post = $post }
        $ctx.Response.Close(); continue
      }

      # ---- পোস্ট সম্পাদনা (এডিট) ----
      if ($body.action -eq "update") {
        $id = "" + $body.id
        $p = $body.post
        $all = @(Read-Posts)
        $idx = -1
        for ($k = 0; $k -lt $all.Count; $k++) { if (("" + $all[$k].id) -eq $id) { $idx = $k; break } }
        if ($idx -lt 0) {
          Send-Json $ctx @{ ok = $false; error = "খবরটি পাওয়া যায়নি।" } 404
          $ctx.Response.Close(); continue
        }
        $old = $all[$idx]

        $title = ("" + $p.title).Trim()
        $cat   = ("" + $p.cat).Trim()

        $content = Sanitize-Rich("" + $p.content)
        $paras = @()
        if (-not $content -and $p.body) {
          foreach ($x in @($p.body)) { $t = ("" + $x).Trim(); if ($t) { $paras += $t } }
        }
        $plainCheck = ([regex]::Replace($content, '<[^>]*>', '')).Trim()

        if (-not $title) { Send-Json $ctx @{ ok=$false; error="শিরোনাম লিখুন।" } 400; $ctx.Response.Close(); continue }
        if (-not $cat)   { Send-Json $ctx @{ ok=$false; error="বিভাগ বাছাই করুন।" } 400; $ctx.Response.Close(); continue }
        if (-not $plainCheck -and $paras.Count -eq 0) { Send-Json $ctx @{ ok=$false; error="পোস্ট কনটেন্ট লিখুন।" } 400; $ctx.Response.Close(); continue }

        $img = "" + $old.img
        $rawImg = "" + $p.img
        if ($rawImg.StartsWith("data:image/")) {
          $comma = $rawImg.IndexOf(',')
          if ($comma -ge 0) {
            try {
              $bin = [Convert]::FromBase64String($rawImg.Substring($comma + 1))
              if ($old.img -and ("" + $old.img).StartsWith("uploads/")) {
                $oldFile = Join-Path $Root (("" + $old.img) -replace '/', '\')
                if (Test-Path $oldFile) { Remove-Item -Force $oldFile -ErrorAction SilentlyContinue }
              }
              if (-not (Test-Path $upDir)) { New-Item -ItemType Directory -Force $upDir | Out-Null }
              $newName = "$id-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).jpg"
              [System.IO.File]::WriteAllBytes((Join-Path $upDir $newName), $bin)
              $img = "uploads/$newName"
            } catch { }
          }
        } elseif (-not $rawImg) {
          if ($old.img -and ("" + $old.img).StartsWith("uploads/")) {
            $oldFile = Join-Path $Root (("" + $old.img) -replace '/', '\')
            if (Test-Path $oldFile) { Remove-Item -Force $oldFile -ErrorAction SilentlyContinue }
          }
          $img = ""
        }

        $excerpt = if ($p.excerpt) { "" + $p.excerpt } elseif ($paras.Count -gt 0) { $paras[0] } else { $plainCheck }
        $readMin = 1
        if ($p.read) { $readMin = [int]$p.read }
        $status = if (("" + $p.status) -eq "draft") { "draft" } else { "published" }

        $updated = [ordered]@{
          id          = $id
          cat         = $cat
          subcat      = "" + $p.subcat
          title       = $title
          subHeadline = "" + $p.subHeadline
          excerpt     = $excerpt
          content     = $content
          body        = @($paras)
          img         = $img
          imgCaption  = "" + $p.imgCaption
          author      = $(if ($p.author) { "" + $p.author } else { "নিজস্ব প্রতিবেদক" })
          keywords    = Clean-List $p.keywords
          division    = "" + $p.division
          district    = "" + $p.district
          upazila     = "" + $p.upazila
          isLead      = [bool]$p.isLead
          exclusive   = [bool]$p.exclusive
          status      = $status
          read        = [Math]::Max(1, $readMin)
          createdAt   = $old.createdAt
          updatedAt   = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        }

        if ($null -ne $old.no) { $updated['no'] = $old.no }
        $all[$idx] = $updated
        Write-Posts $all
        Send-Json $ctx @{ ok = $true; post = $updated }
        $ctx.Response.Close(); continue
      }

      # ---- খসড়া থেকে প্রকাশ করা ----
      if ($body.action -eq "publish") {
        $id = "" + $body.id
        $all = @(Read-Posts)
        $found = $false
        $updated = @()
        foreach ($item in $all) {
          if (("" + $item.id) -eq $id) {
            $item.status = "published"
            $found = $true
          }
          $updated += $item
        }
        if (-not $found) {
          Send-Json $ctx @{ ok = $false; error = "খবরটি পাওয়া যায়নি।" } 404
          $ctx.Response.Close(); continue
        }
        Write-Posts $updated
        Send-Json $ctx @{ ok = $true }
        $ctx.Response.Close(); continue
      }

      # ---- পোস্ট মুছে ফেলা ----
      if ($body.action -eq "delete") {
        $id = "" + $body.id
        $all = @(Read-Posts)
        $gone = $all | Where-Object { ("" + $_.id) -eq $id } | Select-Object -First 1
        if (-not $gone) {
          Send-Json $ctx @{ ok = $false; error = "খবরটি পাওয়া যায়নি।" } 404
          $ctx.Response.Close(); continue
        }
        $kept = @($all | Where-Object { ("" + $_.id) -ne $id })
        if ($gone.img -and ("" + $gone.img).StartsWith("uploads/")) {
          $f = Join-Path $Root ($gone.img -replace '/', '\')
          if (Test-Path $f) { Remove-Item -Force $f -ErrorAction SilentlyContinue }
        }
        Write-Posts $kept
        Send-Json $ctx @{ ok = $true }
        $ctx.Response.Close(); continue
      }

      # ---- গ্যালারি: নতুন অ্যালবাম/ভিডিও ----
      if ($body.action -eq "gallery_add") {
        $g = $body.item
        $title = ("" + $g.title).Trim()
        $gid = [string][int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        $err = $null
        $item = [ordered]@{ id = $gid; type = $(if ($g.type -eq "video") { "video" } else { "photo" }); title = $title
                            caption = ("" + $g.caption).Trim(); createdAt = [int64]$gid }
        if (-not $title) { $err = "শিরোনাম লিখুন।" }
        elseif ($item.type -eq "photo") {
          $pth = Save-Upload ("" + $g.img) "$gid-1.jpg"
          if ($pth) { $item.photos = @($pth) } else { $err = "ছবিটি সংরক্ষণ করা যায়নি।" }
        } else {
          $v = Parse-Video ("" + $g.url)
          if ($v) {
            $item.video = $v
            $item.thumb = ""
            if ($g.thumb) { $t = Save-Upload ("" + $g.thumb) "$gid-0.jpg"; if ($t) { $item.thumb = $t } }
          } else { $err = "শুধু YouTube বা Facebook ভিডিওর লিংক দেওয়া যাবে।" }
        }
        if ($err) { Send-Json $ctx @{ ok = $false; error = $err } 400 }
        else {
          Write-Gallery (@($item) + @(Read-Gallery))
          Send-Json $ctx @{ ok = $true; item = $item }
        }
        $ctx.Response.Close(); continue
      }

      # ---- গ্যালারি: অ্যালবামে আরেকটি ছবি ----
      if ($body.action -eq "gallery_photo") {
        $items = @(Read-Gallery)
        $it = $items | Where-Object { ("" + $_.id) -eq ("" + $body.id) -and $_.type -eq "photo" } | Select-Object -First 1
        if (-not $it) { Send-Json $ctx @{ ok = $false; error = "অ্যালবামটি পাওয়া যায়নি।" } 404 }
        elseif (@($it.photos).Count -ge 40) { Send-Json $ctx @{ ok = $false; error = "একটি অ্যালবামে সর্বোচ্চ ৪০টি ছবি রাখা যায়।" } 400 }
        else {
          $pth = Save-Upload ("" + $body.img) ("{0}-{1}.jpg" -f $it.id, (@($it.photos).Count + 1))
          if (-not $pth) { Send-Json $ctx @{ ok = $false; error = "ছবিটি সংরক্ষণ করা যায়নি।" } 400 }
          else {
            $it.photos = @($it.photos) + $pth
            Write-Gallery $items
            Send-Json $ctx @{ ok = $true; item = $it }
          }
        }
        $ctx.Response.Close(); continue
      }

      # ---- গ্যালারি: মুছে ফেলা (ছবির ফাইলসহ) ----
      if ($body.action -eq "gallery_delete") {
        $items = @(Read-Gallery)
        $gone = $items | Where-Object { ("" + $_.id) -eq ("" + $body.id) } | Select-Object -First 1
        if (-not $gone) { Send-Json $ctx @{ ok = $false; error = "পাওয়া যায়নি।" } 404 }
        else {
          foreach ($f in @($gone.photos) + @($gone.thumb)) {
            if ($f -and ("" + $f).StartsWith("uploads/") -and -not ("" + $f).Contains("..")) {
              $fp = Join-Path $Root (("" + $f) -replace '/', '\')
              if (Test-Path $fp) { Remove-Item -Force $fp -ErrorAction SilentlyContinue }
            }
          }
          Write-Gallery @($items | Where-Object { ("" + $_.id) -ne ("" + $body.id) })
          Send-Json $ctx @{ ok = $true }
        }
        $ctx.Response.Close(); continue
      }

      Send-Json $ctx @{ ok = $false; error = "অজানা অনুরোধ।" } 400
      $ctx.Response.Close(); continue
    }

    # ---------------- স্ট্যাটিক ফাইল ----------------
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
    # টাইপ করা /admin ও পুরোনো লিংক আসল ফাইলে পাঠানো — আসল হোস্টিংয়ে .htaccess একই কাজ করে
    $to = $null
    if ($path -match '^admin(71)?/?$') { $to = "/admin71.html" }
    elseif ($path -match '^[A-Za-z0-9_-]+/article/(\d+)/?$') { $to = "/article.html?n=" + $Matches[1] }
    elseif ($path -match '^topic/([A-Za-z0-9_-]+)/?$') { $to = "/category.html?cat=" + $Matches[1] }
    if ($to) {
      $ctx.Response.Redirect($to)
      $ctx.Response.Close(); continue
    }
    $file = Join-Path $Root ($path -replace '/', '\')

    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ct = $types[$ext]
      if (-not $ct) { $ct = "application/octet-stream" }
      Send-Bytes $ctx ([System.IO.File]::ReadAllBytes($file)) $ct 200
    } else {
      Send-Bytes $ctx ([System.Text.Encoding]::UTF8.GetBytes("404 not found: $path")) "text/plain; charset=utf-8" 404
    }
    $ctx.Response.Close()
  } catch {
    Write-Output ("error: " + $_.Exception.Message)
    try { $ctx.Response.Close() } catch {}
  }
}
