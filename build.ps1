# ===================================================================
#  Sofira Blueprints — static site builder (no Node/Python needed)
#  Usage:  powershell -ExecutionPolicy Bypass -File build.ps1
#  Edits go in /src and /data. The finished website is written to /public.
# ===================================================================
param([string]$SiteUrl = "https://sofira-blueprints.github.io")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$src   = Join-Path $root "src"
$out   = Join-Path $root "public"
$utf8  = New-Object System.Text.UTF8Encoding $false
$today = (Get-Date).ToString("yyyy-MM-dd")

function Read-Text($p)   { [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }
function Write-Text($p,$t){ $d = Split-Path -Parent $p; if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }; [IO.File]::WriteAllText($p, $t, $utf8) }
function Esc($s)          { if ($null -eq $s) { "" } else { [System.Net.WebUtility]::HtmlEncode([string]$s) } }

$headPartial   = Read-Text "$src\partials\head.html"
$headerPartial = Read-Text "$src\partials\header.html"
$footerPartial = Read-Text "$src\partials\footer.html"
$pages = New-Object System.Collections.ArrayList

# ---------- image size cache (prevents layout shift) ----------
$sizeCache = @{}
function Img-Size($rel) {
  if ($sizeCache.ContainsKey($rel)) { return $sizeCache[$rel] }
  $p = Join-Path $out ($rel -replace '/', '\')
  $s = @(1600, 900)
  if (Test-Path $p) { try { $im = [System.Drawing.Image]::FromFile($p); $s = @($im.Width, $im.Height); $im.Dispose() } catch {} }
  $sizeCache[$rel] = $s; return $s
}

# ---------- page assembly ----------
function Build-Page([string]$raw, [string]$relPath, [hashtable]$extra) {
  $meta = @{ title = "Sofira Blueprints"; description = ""; nav = ""; ogtype = "website"; image = "assets/brand/og-image.jpg" }
  $m = [regex]::Match($raw, '(?s)^\s*<!--meta(.*?)-->')
  if ($m.Success) {
    foreach ($line in ($m.Groups[1].Value -split "`n")) {
      $i = $line.IndexOf(':'); if ($i -gt 0) { $meta[$line.Substring(0,$i).Trim()] = $line.Substring($i+1).Trim() }
    }
    $raw = $raw.Substring($m.Length)
  }
  if ($extra) { foreach ($k in $extra.Keys) { $meta[$k] = $extra[$k] } }

  $pageHead = ""; $hm = [regex]::Match($raw, '(?s)<!--head-->(.*?)<!--/head-->')
  if ($hm.Success) { $pageHead = $hm.Groups[1].Value.Trim(); $raw = $raw.Remove($hm.Index, $hm.Length) }
  $pageScripts = ""; $sm = [regex]::Match($raw, '(?s)<!--scripts-->(.*?)<!--/scripts-->')
  if ($sm.Success) { $pageScripts = $sm.Groups[1].Value.Trim(); $raw = $raw.Remove($sm.Index, $sm.Length) }

  $depth  = ($relPath.Split('/').Count - 1)
  $prefix = ("../" * $depth)
  $urlPath = if ($relPath -eq "index.html") { "/" } else { "/" + $relPath }
  $canonical = $SiteUrl.TrimEnd('/') + $urlPath
  $ogImage = $SiteUrl.TrimEnd('/') + "/" + $meta.image

  $header = $headerPartial
  if ($meta.nav) { $header = $header.Replace("data-nav=""$($meta.nav)""", "data-nav=""$($meta.nav)"" aria-current=""page""") }

  $html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$(Esc $meta.title)</title>
<meta name="description" content="$(Esc $meta.description)">
<link rel="canonical" href="$canonical">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="$($meta.ogtype)">
<meta property="og:site_name" content="Sofira Blueprints">
<meta property="og:title" content="$(Esc $meta.title)">
<meta property="og:description" content="$(Esc $meta.description)">
<meta property="og:url" content="$canonical">
<meta property="og:image" content="$ogImage">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(Esc $meta.title)">
<meta name="twitter:description" content="$(Esc $meta.description)">
<meta name="twitter:image" content="$ogImage">
$headPartial
$pageHead
</head>
<body data-page="$($meta.nav)">
$header
<main id="main">
$raw
</main>
$footerPartial
<script src="{{root}}assets/js/config.js"></script>
<script src="{{root}}assets/js/site.js" defer></script>
$pageScripts
</body>
</html>
"@
  foreach ($k in $script:tokens.Keys) { $html = $html.Replace("{{" + $k + "}}", $script:tokens[$k]) }
  $html = $html.Replace("{{root}}", $prefix).Replace("{{site}}", $SiteUrl.TrimEnd('/')).Replace("{{canonical}}", $canonical).Replace("{{today}}", $today)
  Write-Text (Join-Path $out ($relPath -replace '/', '\')) $html
  [void]$pages.Add(@{ path = $urlPath; pri = $(if ($depth -eq 0) { "0.9" } else { "0.7" }) })
}

# ---------- case studies ----------
$cases = (Read-Text "$root\data\cases.json" | ConvertFrom-Json)
$icon = @{ trigger="bolt"; email="mail"; wait="clock"; branch="branch"; action="cog"; sms="message"; goal="flag"; tag="tag"; crm="users"; webhook="link"; ai="sparkle"; page="layout"; cart="cart" }
$cap  = @{ trigger="Trigger"; email="Email"; wait="Delay"; branch="Condition"; action="Action"; sms="SMS"; goal="Goal"; tag="Tag"; crm="CRM"; webhook="Integration"; ai="AI step"; page="Page"; cart="Checkout" }
$catNames = @{ email="Email & Newsletters"; crm="CRM & Pipelines"; automation="Automation & Integrations"; funnels="Funnels & Pages"; deliverability="Deliverability & Compliance"; ai="AI & Outreach" }

function Flow-Html($steps, [string]$cls) {
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append("<ol class=""flow $cls"" data-flow aria-label=""Automation blueprint"">")
  $n = 0
  foreach ($s in $steps) {
    $n++; $t = [string]$s.t; if (-not $icon.ContainsKey($t)) { $t = "action" }
    [void]$sb.Append("<li class=""flow__node"" data-type=""$t"" style=""--i:$n""><span class=""flow__icon"" aria-hidden=""true""><svg><use href=""#i-$($icon[$t])""/></svg></span><span class=""flow__text""><small>$($cap[$t])</small>$(Esc $s.label)</span></li>")
  }
  [void]$sb.Append("</ol>"); $sb.ToString()
}
function Chips($arr, [string]$cls) { ($arr | ForEach-Object { "<li>$(Esc $_)</li>" }) -join "" | ForEach-Object { "<ul class=""chips $cls"">$_</ul>" } }
function Img-Tag($img, [string]$cls, [string]$loading) {
  $sz = Img-Size $img.src
  "<img class=""$cls"" src=""{{root}}$($img.src)"" alt=""$(Esc $img.alt)"" width=""$($sz[0])"" height=""$($sz[1])"" loading=""$loading"" decoding=""async"">"
}

$cards = New-Object Text.StringBuilder; $featured = New-Object Text.StringBuilder; $top3 = New-Object Text.StringBuilder; $featCount = 0
$platformSet = New-Object System.Collections.Generic.SortedSet[string]
for ($i = 0; $i -lt $cases.Count; $i++) {
  $c = $cases[$i]; foreach ($p in $c.platforms) { [void]$platformSet.Add($p) }
  $pkeys = ($c.platforms | ForEach-Object { ($_.ToLower() -replace '[^a-z0-9]+','-') }) -join " "
  $media = if ($c.images.Count -gt 0) { Img-Tag $c.images[0] "case-card__img" "lazy" } else { "<div class=""case-card__blueprint"">" + (Flow-Html ($c.steps | Select-Object -First 4) "flow--mini") + "</div>" }
  $num = "{0:D2}" -f ($i + 1)
  $card = @"
<article class="case-card" data-reveal data-cat="$($c.category)" data-platforms="$pkeys" data-search="$(Esc (($c.title + ' ' + $c.summary + ' ' + ($c.platforms -join ' ') + ' ' + $c.industry).ToLower()))">
  <a class="case-card__link" href="{{root}}work/$($c.slug).html" data-case="$($c.slug)" data-cursor="View">
    <div class="case-card__media">$media<span class="case-card__num">$num</span></div>
    <div class="case-card__body">
      <span class="case-card__cat">$($catNames[$c.category])</span>
      <h3 class="case-card__title">$(Esc $c.title)</h3>
      <p class="case-card__sum">$(Esc $c.summary)</p>
      $(Chips $c.platforms "chips--sm")
    </div>
  </a>
</article>
"@
  [void]$cards.Append($card)
  if ($c.featured) { [void]$featured.Append($card); $featCount++; if ($featCount -le 3) { [void]$top3.Append($card) } }
}
$filterBtns = ($platformSet | ForEach-Object { "<button class=""filter"" type=""button"" data-platform=""$(($_.ToLower() -replace '[^a-z0-9]+','-'))"" aria-pressed=""false"">$(Esc $_)</button>" }) -join ""

# ---------- blog posts ----------
$posts = @((Read-Text "$root\data\posts.json" | ConvertFrom-Json) | Where-Object { -not $_.draft } | Sort-Object { [datetime]$_.date } -Descending)
$culture = [Globalization.CultureInfo]::GetCultureInfo("en-GB")
function Date-Text($d) { ([datetime]$d).ToString("d MMM yyyy", $culture) }
function Post-Card($p, [string]$extraCls) {
  $sz = Img-Size $p.image
  $search = Esc (($p.title + ' ' + $p.description + ' ' + $p.label).ToLower())
@"
<a class="post-card $extraCls" href="{{root}}blog/$($p.slug).html" data-post-cat="$($p.category)" data-search="$search" data-reveal>
  <div class="post-card__art post-card__art--img"><img class="post-card__img" src="{{root}}$($p.image)" alt="" width="$($sz[0])" height="$($sz[1])" loading="lazy" decoding="async"><span class="post-card__tag">$(Esc $p.label)</span></div>
  <div class="post-card__body"><span class="post-card__date">$(Date-Text $p.date) &middot; $($p.read) min read</span><h3>$(Esc $p.title)</h3><p>$(Esc $p.description)</p><span class="link-arrow">Read article <svg><use href="#i-arrow"/></svg></span></div>
</a>
"@
}
$feat = $posts[0]; $fsz = Img-Size $feat.image
$postFeatured = @"
<a class="post-feature" href="{{root}}blog/$($feat.slug).html" data-reveal>
  <div class="post-card__art"><img class="post-feature__img" src="{{root}}$($feat.image)" alt="" width="$($fsz[0])" height="$($fsz[1])"><span class="post-card__tag">Latest &middot; $(Esc $feat.label)</span></div>
  <div class="post-card__body"><span class="post-card__date">$(Date-Text $feat.date) &middot; $($feat.read) min read</span><h2>$(Esc $feat.title)</h2><p>$(Esc $feat.description)</p><span class="link-arrow">Read the article <svg><use href="#i-arrow"/></svg></span></div>
</a>
"@
$postCards = ($posts | Select-Object -Skip 1 | ForEach-Object { Post-Card $_ "" }) -join ""
$postLatest = ($posts | Select-Object -First 3 | ForEach-Object { Post-Card $_ "" }) -join ""
$postLd = (@{ "@context"="https://schema.org"; "@type"="Blog"; name="Sofira Blueprints blog"; url="$SiteUrl/blog.html"; blogPost=@($posts | ForEach-Object { @{ "@type"="BlogPosting"; headline=$_.title; url="$SiteUrl/blog/$($_.slug).html"; datePublished=$_.date; image="$SiteUrl/$($_.image)" } }) } | ConvertTo-Json -Depth 5 -Compress)

$script:tokens = @{
  case_cards = $cards.ToString()
  case_cards_featured = $featured.ToString()
  case_cards_top3 = $top3.ToString()
  case_count = [string]$cases.Count
  case_platform_filters = $filterBtns
  post_featured = $postFeatured
  post_cards = $postCards
  post_cards_latest = $postLatest
  post_count = [string]$posts.Count
  post_ld = $postLd
}

# ---------- build normal pages ----------
Get-ChildItem "$src\pages" -Recurse -Filter *.html | ForEach-Object {
  $rel = $_.FullName.Substring(("$src\pages\").Length) -replace '\\', '/'
  Build-Page (Read-Text $_.FullName) $rel $null
  Write-Host "  page  $rel"
}

# ---------- build case study pages ----------
$caseTpl = Read-Text "$src\templates\case.html"
for ($i = 0; $i -lt $cases.Count; $i++) {
  $c = $cases[$i]; $prev = $cases[($i - 1 + $cases.Count) % $cases.Count]; $next = $cases[($i + 1) % $cases.Count]
  $hero = if ($c.images.Count -gt 0) { "<div class=""shot"" data-reveal><div class=""shot__bar"" aria-hidden=""true""><i></i><i></i><i></i><span>$(Esc ($c.platforms -join ' · '))</span></div><button class=""shot__btn"" type=""button"" data-lightbox=""0"" aria-label=""Enlarge image: $(Esc $c.images[0].alt)"">" + (Img-Tag $c.images[0] "shot__img" "eager") + "</button></div>" } else { "<div class=""blueprint-panel"" data-reveal>" + (Flow-Html $c.steps "flow--hero") + "</div>" }
  $gallery = ""
  if ($c.images.Count -gt 1) {
    $g = New-Object Text.StringBuilder
    for ($k = 1; $k -lt $c.images.Count; $k++) { [void]$g.Append("<figure class=""gallery__item"" data-reveal><button type=""button"" data-lightbox=""$k"" aria-label=""Enlarge image: $(Esc $c.images[$k].alt)"">" + (Img-Tag $c.images[$k] "" "lazy") + "</button><figcaption>$(Esc $c.images[$k].alt)</figcaption></figure>") }
    $gallery = "<section class=""case-sec""><div class=""case-sec__label""><span class=""mono"">FIG. 03</span><h2>Inside the build</h2></div><div class=""gallery"">$($g.ToString())</div></section>"
  }
  $lightboxData = ($c.images | ForEach-Object { @{ src = $_.src; alt = $_.alt } }) | ConvertTo-Json -Compress
  if ($c.images.Count -eq 1) { $lightboxData = "[$lightboxData]" }; if ($c.images.Count -eq 0) { $lightboxData = "[]" }
  $results = ($c.results | ForEach-Object { "<div class=""metric"" data-reveal><strong>$(Esc $_.value)</strong><span>$(Esc $_.label)</span></div>" }) -join ""
  $deliv = ($c.deliverables | ForEach-Object { "<li><svg><use href=""#i-check""/></svg><span>$(Esc $_)</span></li>" }) -join ""
  $quote = if ($c.quote) { "<blockquote class=""case-quote"" data-reveal><p>&ldquo;$(Esc $c.quote.text)&rdquo;</p><footer><span class=""stars"" aria-label=""$($c.quote.stars) out of 5 stars"">$(([string][char]0x2605) * [int]$c.quote.stars)</span> $(Esc $c.quote.by)</footer></blockquote>" } else { "" }
  $ld = @{ "@context"="https://schema.org"; "@type"="CreativeWork"; name=$c.title; headline=$c.title; description=$c.summary; about=$c.services; keywords=($c.platforms -join ', '); author=@{ "@type"="Person"; name="Sofiat Adedeji"; url="$SiteUrl/about.html" }; publisher=@{ "@type"="Organization"; name="Sofira Blueprints"; url=$SiteUrl }; url="$SiteUrl/work/$($c.slug).html" } | ConvertTo-Json -Depth 5 -Compress
  $bc = @{ "@context"="https://schema.org"; "@type"="BreadcrumbList"; itemListElement=@(@{ "@type"="ListItem"; position=1; name="Home"; item="$SiteUrl/" }, @{ "@type"="ListItem"; position=2; name="Case Studies"; item="$SiteUrl/work.html" }, @{ "@type"="ListItem"; position=3; name=$c.title; item="$SiteUrl/work/$($c.slug).html" }) } | ConvertTo-Json -Depth 5 -Compress
  $body = $caseTpl
  $map = @{
    "c.slug"=$c.slug; "c.title"=(Esc $c.title); "c.summary"=(Esc $c.summary); "c.client"=(Esc $c.client); "c.industry"=(Esc $c.industry)
    "c.category"=$catNames[$c.category]; "c.platforms"=(Chips $c.platforms ""); "c.services"=(Esc ($c.services -join ' · '))
    "c.challenge"=(Esc $c.challenge); "c.approach"=(Esc $c.approach); "c.outcome"=(Esc $c.outcome); "c.flow"=(Flow-Html $c.steps "flow--case")
    "c.results"=$results; "c.deliverables"=$deliv; "c.hero"=$hero; "c.gallery"=$gallery; "c.quote"=$quote; "c.num"=("{0:D2}" -f ($i+1)); "c.total"=[string]$cases.Count
    "c.prev.slug"=$prev.slug; "c.prev.title"=(Esc $prev.title); "c.next.slug"=$next.slug; "c.next.title"=(Esc $next.title)
    "c.lightbox"=$lightboxData; "c.jsonld"=$ld; "c.breadcrumb"=$bc
  }
  foreach ($k in $map.Keys) { $body = $body.Replace("{{" + $k + "}}", [string]$map[$k]) }
  $ogimg = if ($c.images.Count -gt 0) { $c.images[0].src } else { "assets/brand/og-image.jpg" }
  Build-Page $body "work/$($c.slug).html" @{ title = "$($c.title) $([char]0x2014) Case Study | Sofira Blueprints"; description = $c.summary; nav = "work"; ogtype = "article"; image = $ogimg }
}
Write-Host "  cases $($cases.Count) case-study pages"

# ---------- build generated blog posts ----------
$postTpl = Read-Text "$src\templates\post.html"
$made = 0
foreach ($p in ($posts | Where-Object { -not $_.static })) {
  $sz = Img-Size $p.image
  $toc = (($p.sections | ForEach-Object { "<li><a href=""#$($_.id)"">$(Esc $_.h)</a></li>" }) -join "") + "<li><a href=""#faq"">FAQ</a></li>"
  $bodyHtml = ($p.sections | ForEach-Object { "<h2 id=""$($_.id)"">$(Esc $_.h)</h2>$($_.html)" }) -join "`n"
  $faqHtml = ($p.faqs | ForEach-Object { "<h3>$(Esc $_.q)</h3><p>$(Esc $_.a)</p>" }) -join ""
  $related = @($posts | Where-Object { $_.slug -ne $p.slug -and $_.category -eq $p.category } | Select-Object -First 3)
  if ($related.Count -lt 3) { $related += @($posts | Where-Object { $_.slug -ne $p.slug -and $_.category -ne $p.category } | Select-Object -First (3 - $related.Count)) }
  $ld = @{ "@context"="https://schema.org"; "@type"="BlogPosting"; headline=$p.title; description=$p.description; image="$SiteUrl/$($p.image)"; datePublished=$p.date; dateModified=$today; author=@{ "@type"="Person"; name="Sofiat Adedeji"; url="$SiteUrl/about.html" }; publisher=@{ "@type"="Organization"; name="Sofira Blueprints"; url="$SiteUrl/"; logo=@{ "@type"="ImageObject"; url="$SiteUrl/assets/brand/icon-512.png" } }; mainEntityOfPage="$SiteUrl/blog/$($p.slug).html" } | ConvertTo-Json -Depth 5 -Compress
  $faqld = @{ "@context"="https://schema.org"; "@type"="FAQPage"; mainEntity=@($p.faqs | ForEach-Object { @{ "@type"="Question"; name=$_.q; acceptedAnswer=@{ "@type"="Answer"; text=$_.a } } }) } | ConvertTo-Json -Depth 6 -Compress
  $bc = @{ "@context"="https://schema.org"; "@type"="BreadcrumbList"; itemListElement=@(@{ "@type"="ListItem"; position=1; name="Home"; item="$SiteUrl/" }, @{ "@type"="ListItem"; position=2; name="Blog"; item="$SiteUrl/blog.html" }, @{ "@type"="ListItem"; position=3; name=$p.title; item="$SiteUrl/blog/$($p.slug).html" }) } | ConvertTo-Json -Depth 5 -Compress
  $body = $postTpl
  $map = @{
    "p.title"=(Esc $p.title); "p.label"=(Esc $p.label); "p.date"=$p.date; "p.dateText"=(Date-Text $p.date); "p.read"=[string]$p.read
    "p.image"=$p.image; "p.imageAlt"=(Esc $p.title); "p.w"=[string]$sz[0]; "p.h"=[string]$sz[1]; "p.answer"=(Esc $p.answer)
    "p.toc"=$toc; "p.body"=$bodyHtml; "p.faqs"=$faqHtml; "p.related"=(($related | ForEach-Object { Post-Card $_ "" }) -join "")
    "p.ld"=$ld; "p.faqld"=$faqld; "p.breadcrumb"=$bc
  }
  foreach ($k in $map.Keys) { $body = $body.Replace("{{" + $k + "}}", [string]$map[$k]) }
  Build-Page $body "blog/$($p.slug).html" @{ title = "$($p.title) | Sofira Blueprints"; description = $p.description; nav = "blog"; ogtype = "article"; image = $p.image }
  $made++
}
Write-Host "  posts $made generated articles ($($posts.Count) on the blog)"

# ---------- sitemap ----------
$sm = New-Object Text.StringBuilder
[void]$sm.Append("<?xml version=""1.0"" encoding=""UTF-8""?>`n<urlset xmlns=""http://www.sitemaps.org/schemas/sitemap/0.9"">`n")
foreach ($p in ($pages | Where-Object { $_.path -ne "/404.html" })) { [void]$sm.Append("  <url><loc>$($SiteUrl.TrimEnd('/'))$($p.path)</loc><lastmod>$today</lastmod><priority>$($p.pri)</priority></url>`n") }
[void]$sm.Append("</urlset>`n")
Write-Text "$out\sitemap.xml" $sm.ToString()
Write-Host "Done: $($pages.Count) pages written to /public"
