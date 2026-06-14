param(
  [string]$Output = "marketing/xiangyun-douyin-poster-1440x2560.png"
)

Add-Type -AssemblyName System.Drawing

$width = 1440
$height = 2560
$outPath = Join-Path (Resolve-Path ".") $Output
$outDir = Split-Path -Parent $outPath
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(247, 244, 238))

function Color([string]$hex, [int]$alpha = 255) {
  $hex = $hex.TrimStart("#")
  $r = [Convert]::ToInt32($hex.Substring(0, 2), 16)
  $g2 = [Convert]::ToInt32($hex.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($hex.Substring(4, 2), 16)
  return [System.Drawing.Color]::FromArgb($alpha, $r, $g2, $b)
}

function Brush([string]$hex, [int]$alpha = 255) {
  return New-Object System.Drawing.SolidBrush((Color $hex $alpha))
}

function Pen([string]$hex, [float]$width = 1, [int]$alpha = 255) {
  return New-Object System.Drawing.Pen((Color $hex $alpha), $width)
}

function Font([float]$size, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  return New-Object System.Drawing.Font("Microsoft YaHei UI", $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function RoundRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function FillRoundRect($brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = RoundRectPath $x $y $w $h $r
  $g.FillPath($brush, $path)
  $path.Dispose()
}

function StrokeRoundRect($pen, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = RoundRectPath $x $y $w $h $r
  $g.DrawPath($pen, $path)
  $path.Dispose()
}

function DrawText([string]$text, [float]$x, [float]$y, [float]$w, [float]$h, $font, $brush, [string]$align = "Near") {
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::$align
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
  $sf.Trimming = [System.Drawing.StringTrimming]::Word
  $sf.FormatFlags = 0
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $g.DrawString($text, $font, $brush, $rect, $sf)
  $sf.Dispose()
}

function DrawCenterText([string]$text, [float]$x, [float]$y, [float]$w, [float]$h, $font, $brush) {
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $g.DrawString($text, $font, $brush, $rect, $sf)
  $sf.Dispose()
}

function DrawShadowCard([float]$x, [float]$y, [float]$w, [float]$h, [float]$r, [string]$fill = "#fffefa", [int]$alpha = 232) {
  FillRoundRect (Brush "#0d1717" 20) ($x + 14) ($y + 24) $w $h $r
  FillRoundRect (Brush $fill $alpha) $x $y $w $h $r
  StrokeRoundRect (Pen "#b98745" 1 38) $x $y $w $h $r
}

# Background wash
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
  (Color "#faf7f0"),
  (Color "#eaf1ee"),
  [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)
$g.FillRectangle($bgBrush, 0, 0, $width, $height)
$bgBrush.Dispose()

# Grid
$gridPen = Pen "#315e5b" 1 12
for ($x = 0; $x -le $width; $x += 54) { $g.DrawLine($gridPen, $x, 0, $x, $height) }
for ($y = 0; $y -le $height; $y += 54) { $g.DrawLine($gridPen, 0, $y, $width, $y) }
$gridPen.Dispose()

# Soft orbit shapes
$orbitPen1 = Pen "#0f403f" 84 24
$orbitPen2 = Pen "#b98745" 62 34
$g.DrawEllipse($orbitPen1, 840, 360, 980, 980)
$g.DrawEllipse($orbitPen2, -420, 1230, 820, 820)
$orbitPen1.Dispose()
$orbitPen2.Dispose()

# Fonts and brushes
$brandFont = Font 34 ([System.Drawing.FontStyle]::Bold)
$eyebrowFont = Font 26 ([System.Drawing.FontStyle]::Bold)
$h1Font = Font 108 ([System.Drawing.FontStyle]::Bold)
$h1AccentFont = Font 108 ([System.Drawing.FontStyle]::Bold)
$subtitleFont = Font 42 ([System.Drawing.FontStyle]::Bold)
$chipFont = Font 27 ([System.Drawing.FontStyle]::Bold)
$labelFont = Font 23 ([System.Drawing.FontStyle]::Bold)
$smallFont = Font 24 ([System.Drawing.FontStyle]::Bold)
$cardTitleFont = Font 36 ([System.Drawing.FontStyle]::Bold)
$bodyFont = Font 24 ([System.Drawing.FontStyle]::Regular)

$dark = Brush "#101d1d"
$muted = Brush "#4b5d59"
$brandBrush = Brush "#0f6768"
$goldBrush = Brush "#b98745"
$white = Brush "#ffffff"

# Topline
FillRoundRect (Brush "#0f4f4d") 116 150 78 78 22
DrawCenterText "向云" 116 150 78 78 (Font 23 ([System.Drawing.FontStyle]::Bold)) $white
DrawText "Token向云" 216 171 320 60 $brandFont $brandBrush
FillRoundRect (Brush "#fffefa" 224) 1044 151 280 76 38
StrokeRoundRect (Pen "#b98745" 1 62) 1044 151 280 76 38
DrawCenterText "AI API 接入指南上线" 1044 151 280 76 $eyebrowFont (Brush "#3f504c")

# Hero
DrawText "AI 接口接入" 116 345 1110 130 $h1Font $dark
DrawText "变得更简单" 116 470 1110 130 $h1AccentFont $goldBrush
DrawText "统一网关、余额充值、API 密钥配置，一页搞定 Codex、Claude Code、Gemini CLI、OpenCode 常用接入。" 116 635 1040 150 $subtitleFont $muted

# Chips
$chips = @("仅支持余额充值", "支付宝已开启", "OpenAI 兼容接口")
$chipX = 116
foreach ($chip in $chips) {
  $w = 240
  if ($chip.Length -ge 9) { $w = 288 }
  FillRoundRect (Brush "#fffefa" 226) $chipX 842 $w 66 33
  StrokeRoundRect (Pen "#b98745" 1 56) $chipX 842 $w 66 33
  DrawCenterText $chip $chipX 842 $w 66 $chipFont $brandBrush
  $chipX += $w + 22
}

# Gateway card
DrawShadowCard 116 1040 760 510 34
FillRoundRect (Brush "#ffbd64") 158 1083 18 18 9
FillRoundRect (Brush "#62c7bd") 188 1083 18 18 9
FillRoundRect (Brush "#6a93e8") 218 1083 18 18 9
DrawText "Sub2API Gateway" 520 1073 290 50 $smallFont (Brush "#746b5f")

$endpoints = @(
  @("Base URL", "https://kkflow.org/v1"),
  @("Gemini", "/v1beta"),
  @("API Key", "sk-••••••")
)
$ey = 1154
foreach ($ep in $endpoints) {
  FillRoundRect (Brush "#f4f0e8") 158 $ey 676 76 22
  StrokeRoundRect (Pen "#b98745" 1 30) 158 $ey 676 76 22
  DrawText $ep[0] 186 ($ey + 20) 220 46 $smallFont $dark
  DrawText $ep[1] 418 ($ey + 20) 390 46 $smallFont $brandBrush
  $ey += 104
}

# Step stack
function DrawStepCard([float]$x, [float]$y, [string]$num, [string]$title, [string]$note, [bool]$highlight = $false) {
  if ($highlight) {
    FillRoundRect (Brush "#10201d" 18) ($x + 14) ($y + 24) 500 170 30
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.RectangleF($x, $y, 500, 170)),
      (Color "#0f4f4d"),
      (Color "#1b706d"),
      [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    FillRoundRect $grad $x $y 500 170 30
    $grad.Dispose()
    DrawText $num ($x + 34) ($y + 26) 120 34 (Font 22 ([System.Drawing.FontStyle]::Bold)) (Brush "#ffffff")
    DrawText $title ($x + 34) ($y + 60) 430 50 (Font 36 ([System.Drawing.FontStyle]::Bold)) (Brush "#ffffff")
    DrawText $note ($x + 34) ($y + 116) 430 42 (Font 24) (Brush "#e7fbf7")
  } else {
    DrawShadowCard $x $y 500 170 30
    DrawText $num ($x + 34) ($y + 26) 120 34 (Font 22 ([System.Drawing.FontStyle]::Bold)) (Brush "#9b7c4d")
    DrawText $title ($x + 34) ($y + 60) 430 50 (Font 36 ([System.Drawing.FontStyle]::Bold)) (Brush "#10201d")
    DrawText $note ($x + 34) ($y + 116) 430 42 (Font 24) (Brush "#4f665f")
  }
}

DrawStepCard 824 1170 "01" "注册登录" "创建账号，进入会员中心。" $true
DrawStepCard 824 1370 "02" "余额充值" "当前支持支付宝支付。" $false
DrawStepCard 824 1570 "03" "创建密钥" "复制到客户端即可调用。" $false

# Feature cards
$features = @(
  @("A", "文档清楚", "从注册到调用，按步骤配置。"),
  @("B", "客户端友好", "覆盖 Codex、Claude、Gemini。"),
  @("C", "快速验证", "模型列表与接口示例齐全。")
)
$fx = 116
foreach ($f in $features) {
  DrawShadowCard $fx 1900 378 216 32
  DrawText $f[0] ($fx + 34) 1934 70 42 (Font 30 ([System.Drawing.FontStyle]::Bold)) $goldBrush
  DrawText $f[1] ($fx + 34) 1992 300 45 (Font 31 ([System.Drawing.FontStyle]::Bold)) $dark
  DrawText $f[2] ($fx + 34) 2046 300 64 (Font 22) (Brush "#526964")
  $fx += 402
}

# CTA
FillRoundRect (Brush "#0d1717") 116 2228 1208 174 34
DrawText "新手配置指南已上线" 156 2263 560 46 (Font 32 ([System.Drawing.FontStyle]::Bold)) $white
DrawText "保存这张图，按指南完成第一把 API Key。" 156 2318 650 42 (Font 23 ([System.Drawing.FontStyle]::Bold)) (Brush "#d8c6a3")
FillRoundRect (Brush "#ffffff" 24) 946 2266 338 98 24
StrokeRoundRect (Pen "#b98745" 1 44) 946 2266 338 98 24
DrawCenterText "kkflow.org/guide/" 946 2266 338 98 (Font 28 ([System.Drawing.FontStyle]::Bold)) (Brush "#f1d9aa")

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Host $outPath
