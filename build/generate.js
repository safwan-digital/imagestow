"use strict";
/* ImageStow page generator. Run: node build/generate.js
   Writes the homepage, one page per tool, static pages, sitemap, robots, llms.txt, manifest, tools-data.js. */
const fs = require("fs");
const path = require("path");
const { CATS, TOOLS } = require("./tools-data");
const ROOT = path.join(__dirname, "..");
const BASE = "https://imagestow.safwan.digital";
const bySlug = Object.fromEntries(TOOLS.map(t => [t.slug, t]));

const ICONS = {
  "img-arrow": '<rect x="3" y="5" width="13" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3 17l4.5-4 3 3L14 12l2 2.5"/><path d="M19 8h5M22 5l3 3-3 3" transform="translate(-3 0)"/>',
  "phone": '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  "shapes": '<rect x="4" y="4" width="9" height="9" rx="1"/><circle cx="15.5" cy="15.5" r="4.5"/><path d="M13 8h7v7"/>',
  "doc": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>',
  "shrink": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v6H3M15 21v-6h6"/>',
  "target": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/>',
  "stack": '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  "resize": '<rect x="4" y="6" width="13" height="12" rx="1"/><path d="M17 12h6M21 9l3 3-3 3M7 6V3M4 5l3-3 3 3" transform="translate(-1 1) scale(0.92)"/>',
  "id": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5.5 17c.6-1.8 1.9-2.6 3.5-2.6s2.9.8 3.5 2.6M15 9h4M15 13h4"/>',
  "sliders": '<path d="M5 7h6M15 7h4M5 12h2M11 12h8M5 17h9M18 17h1"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>',
  "crop": '<path d="M6 2v16h16"/><path d="M2 6h16v16" transform="translate(0 0)"/><path d="M6 18H2M18 6V2" opacity="0"/>',
  "rotate": '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/>',
  "stamp": '<path d="M9 21h6M5 21h14"/><path d="M12 3a3 3 0 0 1 3 3c0 2-1 3-1 4h-4c0-1-1-2-1-4a3 3 0 0 1 3-3z"/><rect x="5" y="14" width="14" height="4" rx="1"/>',
  "eye-off": '<path d="M3 12s3.5-6 9-6c2 0 3.7.8 5.1 1.9M21 12s-3.5 6-9 6c-2 0-3.7-.8-5.1-1.9"/><path d="M4 4l16 16"/><circle cx="12" cy="12" r="2.6"/>',
  "frame": '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  "shield": '<path d="M12 3l7 3v6c0 4.5-3 7.4-7 9-4-1.6-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  "eye": '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
  "drop": '<path d="M12 3s6 6.6 6 11a6 6 0 1 1-12 0c0-4.4 6-11 6-11z"/>'
};
function icon(name, size) {
  return '<svg width="' + (size || 30) + '" height="' + (size || 30) + '" viewBox="0 0 24 24" fill="none" stroke="var(--accent3)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS["img-arrow"]) + "</svg>";
}

function head(o, pfx) {
  const P = pfx == null ? "../" : pfx;
  const ld = o.ld ? '<script type="application/ld+json">' + JSON.stringify(o.ld) + "</script>" : "";
  const robots = o.noindex ? '<meta name="robots" content="noindex">\n' : "";
  const canonical = o.noCanonical ? "" : `<link rel="canonical" href="${o.url}">\n`;
  const ogUrl = o.noCanonical ? "" : `<meta property="og:url" content="${o.url}">\n`;
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'${o.cspEval ? " 'unsafe-eval' 'wasm-unsafe-eval'" : ""} https://cdn.jsdelivr.net https://www.googletagmanager.com https://*.clarity.ms; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob: https://cdn.jsdelivr.net https://www.google-analytics.com https://*.google-analytics.com https://*.clarity.ms; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'">
<title>${o.title}</title>
<meta name="description" content="${o.meta}">
${robots}<meta name="theme-color" content="#1A365D">
${canonical}<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.meta}">
<meta property="og:type" content="website">
${ogUrl}
<meta property="og:image" content="${BASE}/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ImageStow — free online image tools that keep your files private">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${o.title}">
<meta name="twitter:description" content="${o.meta}">
<meta name="twitter:image" content="${BASE}/og-image.png">
<link rel="icon" href="${P}favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="${P}favicon-32.png">
<link rel="apple-touch-icon" href="${P}apple-touch-icon.png">
<link rel="stylesheet" href="${P}styles.css?v=120">
<script>try{var _t=localStorage.getItem('imagestow-theme');if(_t==='dark'||(_t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.theme='dark'}catch(e){}</script>
<script>
/* Analytics: Google Analytics (G-JVKBLYBEDG) + Microsoft Clarity (zfqhjlmxb3), ImageStow's own properties — never PDFStow's IDs.
   PDFStow v4.7.2 pattern: start only after window load + idle, so analytics never blocks rendering.
   Hostname gate: only ImageStow's real addresses report — local QA and test copies stay silent.
   These services count page visits only; images are processed in the browser and never sent anywhere. See /privacy/. */
(function(){var OK={"imagestow.safwan.digital":1,"safwan-digital.github.io":1};if(!OK[location.hostname])return;
function start(){
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag("js",new Date());gtag("config","G-JVKBLYBEDG");
var g=document.createElement("script");g.async=true;g.src="https://www.googletagmanager.com/gtag/js?id=G-JVKBLYBEDG";document.head.appendChild(g);
(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","zfqhjlmxb3");
}
function idle(){if("requestIdleCallback" in window)requestIdleCallback(start,{timeout:3000});else setTimeout(start,1200);}
if(document.readyState==="complete")idle();else window.addEventListener("load",idle);})();
</script>
${ld}
</head>`;
}
function header(P) {
  const home = P === "" ? "./" : P;
  return `<header class="site"><div class="wrap">
<a class="logo" href="${home}"><img src="${P}logo-68.png" alt="" width="34" height="34"><span class="wordmark">Image<span class="stow">Stow</span></span></a>
<nav><a href="${P}#tools">All tools</a><a class="nav-extra" href="${P}compress-image/">Compress</a><a class="nav-extra" href="${P}heic-to-jpg/">HEIC to JPG</a><a href="${P}about/">About</a><a href="${P}privacy/">Privacy</a>
<button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode" title="Toggle dark mode"><svg class="tb-ico ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg><svg class="tb-ico ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg><span class="tb-label">Dark</span></button></nav>
</div></header>`;
}
function footer(P) {
  const home = P === "" ? "./" : P;
  return `<footer class="site"><div class="wrap">
<nav><a href="${home}">All tools</a><a href="${P}about/">About</a><a href="${P}privacy/">Privacy</a><a href="${P}terms/">Terms</a><a href="${P}contact/">Contact</a><a href="https://pdfstow.safwan.digital/">PDFStow — free PDF tools</a></nav>
<div><strong>ImageStow</strong> — free image tools, private by design. Your files are processed in your browser and never uploaded.</div>
<div>Built by <a href="https://safwan.digital">Safwan.Digital</a></div>
</div></footer>
<script src="${P}tools-data.js"></script>
<script src="${P}app.js?v=120"></script>
</body></html>`;
}

function qualityCtl(def) {
  return `<div class="ctl"><label for="quality">Quality: <span class="val" id="qualityVal">${def}%</span></label><input type="range" id="quality" min="10" max="100" value="${def}"></div>`;
}
const CONTROLS = {
  convert: t => (t.q ? qualityCtl(92) : "") + `<button class="btn" id="runBtn">Convert to ${t.out.split("/")[1].toUpperCase() === "JPEG" ? "JPG" : t.out.split("/")[1].toUpperCase()}</button>`,
  heic: () => qualityCtl(92) + `<button class="btn" id="runBtn">Convert to JPG</button><p class="note">The HEIC reader library loads once, only on this tool. Large photos can take a few seconds.</p>`,
  svg: () => `<div class="ctl-row"><div class="ctl"><label for="width">PNG width (px)</label><input type="number" id="width" min="16" max="8000" placeholder="1024"></div><div class="ctl"><label>Height</label><div id="heightOut" class="heightout">—</div></div></div>
<div class="ctl"><label for="bg">Background</label><select id="bg"><option value="transparent">Transparent</option><option value="white">White</option></select></div>
<button class="btn" id="runBtn">Convert to PNG</button>`,
  pdf: () => `<div class="ctl"><label for="pageSize">Page size</label><select id="pageSize"><option value="fit">Fit each page to its image</option><option value="a4">A4 pages</option></select></div><button class="btn" id="runBtn">Make PDF</button>`,
  compress: () => qualityCtl(80) + `<p class="note" id="estimate">Estimated result will appear here.</p><button class="btn" id="runBtn">Compress image</button>`,
  target: () => `<div class="ctl"><label>Target size</label><div class="seg" role="radiogroup" aria-label="Target size">
<label><input type="radio" name="target" value="200" checked> Under 200 KB</label>
<label><input type="radio" name="target" value="100"> Under 100 KB</label>
<label><input type="radio" name="target" value="50"> Under 50 KB</label>
<label><input type="radio" name="target" value="custom"> My own size</label></div></div>
<div class="ctl hidden" id="customKbWrap"><label for="customKb">Your limit (KB)</label><input type="number" id="customKb" min="5" max="5000" value="200"></div>
<button class="btn" id="runBtn">Compress to size</button>`,
  bulk: () => qualityCtl(80) + `<button class="btn" id="runBtn">Compress all &amp; make ZIP</button>`,
  resize: () => `<div class="ctl-row"><div class="ctl"><label for="w">Width (px)</label><input type="number" id="w" min="1"></div><div class="ctl"><label for="h">Height (px)</label><input type="number" id="h" min="1"></div></div>
<div class="ctl-row"><div class="ctl"><label for="pct">Or scale by percent (%)</label><input type="number" id="pct" min="1" max="400" placeholder="e.g. 50"></div><label class="check checkend"><input type="checkbox" id="lock" checked> Keep the same shape (lock)</label></div>
<button class="btn" id="runBtn">Resize image</button>`,
  social: () => `<div class="ctl"><label for="preset">Platform size</label><select id="preset">
<option value="1080x1080">Instagram post — square (1080 × 1080)</option>
<option value="1080x1350">Instagram post — portrait (1080 × 1350)</option>
<option value="1080x1920">Instagram story / reel cover (1080 × 1920)</option>
<option value="1280x720">YouTube thumbnail (1280 × 720)</option>
<option value="1640x924">Facebook cover (1640 × 924)</option>
<option value="1200x627">LinkedIn post (1200 × 627)</option>
<option value="1080x1080">WhatsApp picture (1080 × 1080)</option></select></div>
<div class="ctl-row"><div class="ctl"><label for="mode">How should it fit?</label><select id="mode"><option value="fill">Fill — crop the edges</option><option value="fit">Fit — whole picture, colour fills gaps</option></select></div>
<div class="ctl"><label for="bgc">Gap colour (for Fit)</label><input type="color" id="bgc" value="#ffffff"></div></div>
<button class="btn" id="runBtn">Resize for social media</button>`,
  passport: () => `<div class="ctl"><label for="bgc">Background colour</label><input type="color" id="bgc" value="#ffffff"></div>
<div class="warn">Use a plain, light background and even light on your face, look straight at the camera, and check your document's official photo rules — size is only one of them.</div>
<button class="btn" id="runBtn">Make passport photo</button>`,
  editor: () => `<div class="ctl-row"><div class="ctl"><label for="bright">Brightness: <span class="val" id="brightVal">100%</span></label><input type="range" id="bright" min="40" max="160" value="100"></div>
<div class="ctl"><label for="contrast">Contrast: <span class="val" id="contrastVal">100%</span></label><input type="range" id="contrast" min="40" max="160" value="100"></div></div>
<div class="ctl-row"><div class="ctl"><label for="sat">Colour: <span class="val" id="satVal">100%</span></label><input type="range" id="sat" min="0" max="200" value="100"></div>
<div class="ctl"><label for="filter">Filter</label><select id="filter"><option value="none">None</option><option value="bw">Black &amp; white</option><option value="sepia">Sepia</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="vivid">Vivid</option></select></div></div>
<div class="ctl-row"><div class="ctl"><label for="cropratio">Crop shape</label><select id="cropratio"><option value="free">No crop</option><option value="1:1">Square (1:1)</option><option value="4:3">4:3</option><option value="3:2">3:2</option><option value="16:9">16:9</option><option value="3:4">Portrait 3:4</option></select></div>
<div class="ctl"><label>Turn &amp; flip</label><div class="btn-row"><button class="btn secondary" id="rotL" type="button">⟲ Left</button><button class="btn secondary" id="rotR" type="button">⟳ Right</button><button class="btn secondary" id="flipH" type="button">⇋ Flip ↔</button><button class="btn secondary" id="flipV" type="button">⇅ Flip ↕</button></div></div></div>
<div class="ctl-row"><div class="ctl"><label for="text">Words on the picture (optional)</label><input type="text" id="text" placeholder="e.g. Summer sale" maxlength="80"></div>
<div class="ctl"><label for="textsize">Text size</label><input type="range" id="textsize" min="3" max="14" value="6"></div></div>
<div class="ctl-row"><div class="ctl"><label for="textcolor">Text colour</label><select id="textcolor"><option value="#ffffff">White</option><option value="#13233c">Midnight</option><option value="#c5a059">Gold</option><option value="#000000">Black</option></select></div>
<div class="ctl"><label for="textpos">Text position</label><select id="textpos"><option value="bottom-center">Bottom centre</option><option value="top-center">Top centre</option><option value="middle-center">Middle</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></div></div>
<button class="btn" id="runBtn">Download edited image</button>`,
  crop: () => `<p class="note">Drag on the picture to draw the box. Drag inside it to move it; drag the gold corner to resize it.</p><button class="btn" id="runBtn">Crop &amp; download</button>`,
  rotate: () => `<div class="btn-row mb14"><button class="btn secondary" id="rotL" type="button">⟲ Turn left</button><button class="btn secondary" id="rotR" type="button">⟳ Turn right</button><button class="btn secondary" id="flipH" type="button">Flip ↔</button><button class="btn secondary" id="flipV" type="button">Flip ↕</button></div><button class="btn" id="runBtn">Download fixed image</button>`,
  watermark: () => `<div class="ctl"><label for="wmtext">Watermark words</label><input type="text" id="wmtext" placeholder="e.g. @yourshop or Your Name" maxlength="60"></div>
<div class="ctl-row"><div class="ctl"><label for="wmopacity">See-through: <span class="val" id="wmopacityVal">55%</span></label><input type="range" id="wmopacity" min="10" max="100" value="55"></div>
<div class="ctl"><label for="wmsize">Size</label><input type="range" id="wmsize" min="2" max="12" value="5"></div></div>
<div class="ctl-row"><div class="ctl"><label for="wmcolor">Colour</label><select id="wmcolor"><option value="#ffffff">White</option><option value="#000000">Black</option><option value="#c5a059">Gold</option></select></div>
<div class="ctl"><label for="wmpos">Position</label><select id="wmpos"><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="middle-center">Middle</option></select></div></div>
<button class="btn" id="runBtn">Add watermark</button>`,
  blur: () => `<div class="ctl-row"><div class="ctl"><label for="mode">Hide style</label><select id="mode"><option value="pixelate">Pixelate (mosaic)</option><option value="blur">Blur</option></select></div>
<div class="ctl"><label for="strength">Strength</label><input type="range" id="strength" min="6" max="40" value="18"></div></div>
<p class="note">Drag a box over the part to hide, then press the button below. Repeat for more areas.</p>
<div class="btn-row"><button class="btn secondary" id="applyBtn" type="button">Hide this area</button><button class="btn" id="runBtn">Download finished image</button></div>`,
  background: () => `<div class="ctl-row"><div class="ctl"><label for="bgc">Background colour</label><input type="color" id="bgc" value="#ffffff"></div>
<div class="ctl"><label for="border">Border width (px)</label><input type="range" id="border" min="0" max="200" value="0"></div></div>
<button class="btn" id="runBtn">Download with background</button>`,
  strip: () => `<button class="btn" id="runBtn">Remove metadata</button>`,
  view: () => `<p class="note">Your photo's hidden details appear below as soon as you add it. Nothing to press.</p>`,
  favicon: () => `<button class="btn" id="runBtn">Make favicons</button>`,
  picker: () => `<p class="note">Click anywhere on your image to pick its colour.</p>`
};
const CANVAS_UI = new Set(["editor", "crop", "rotate", "blur", "picker"]);

function toolPage(t) {
  const HPFX = "../";
  const url = BASE + "/" + t.slug + "/";
  const ld = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: t.name + " — ImageStow", url, applicationCategory: "MultimediaApplication", operatingSystem: "Any (web browser)", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: t.meta, publisher: { "@type": "Organization", name: "Safwan.Digital", url: "https://safwan.digital" } },
    { "@context": "https://schema.org", "@type": "HowTo", name: t.howto, step: t.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: t.faqs.map(f => ({ "@type": "Question", name: f[0], acceptedAnswer: { "@type": "Answer", text: f[1] } })) }
  ];
  const preview = CANVAS_UI.has(t.ui)
    ? '<canvas id="stage" aria-label="Your image — work area"></canvas>'
    : t.ui === "bulk" || t.ui === "pdf" ? '<div class="thumbs" id="thumbs"></div>'
    : '<img id="previewImg" alt="Preview of your image">';
  return head({ title: t.title, meta: t.meta, url, ld, cspEval: t.slug === "heic-to-jpg" }, "../") + `
<body data-tool="${t.slug}">
${header(HPFX)}
<main>
<div class="tool-head"><span class="pill">Free · No sign-up · Nothing uploaded</span>
<h1>${t.name}</h1><p>${t.answer}</p></div>
<div class="wrap"><div class="tool-shell">
<div class="drop" id="dropZone" role="button" tabindex="0" aria-label="Choose an image">
<span class="big">Tap to choose ${t.multiple ? "images" : "an image"}, or drop ${t.multiple ? "them" : "it"} here</span>
<span class="small">Your file stays on your device — it is never uploaded.</span>
<input type="file" id="fileInput" accept="${t.accept}"${t.multiple ? " multiple" : ""}>
</div>
<div class="work hidden" id="workArea">
<div class="filebar"><span class="fname" id="fileName"></span><span class="fmeta" id="fileMeta"></span></div>
<div class="preview">${preview}</div>
<div class="controls">${CONTROLS[t.ui](t)}</div>
</div>
<div class="result hidden" id="result" aria-live="polite"></div>
</div></div>
<section class="copy"><h2>${t.howto}</h2>
<ol class="steps">${t.steps.map(s => "<li>" + s + "</li>").join("")}</ol>
<h2>Questions</h2><div class="faq">
${t.faqs.map(f => "<details><summary>" + f[0] + "</summary><p>" + f[1] + "</p></details>").join("\n")}
</div>
<h2>Related tools</h2><div class="related">${t.related.map(s => '<a href="../' + s + '/">' + bySlug[s].name + "</a>").join("")}</div>
</section>
</main>
${footer(HPFX)}`;
}

function homePage() {
  const HPFX = "";
  const url = BASE + "/";
  const ld = [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "ImageStow", url, applicationCategory: "MultimediaApplication", operatingSystem: "Any (web browser)", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: "Free image tools — compress, resize, convert and edit images right in your browser. Private by design: files never leave your device. No sign-up.", publisher: { "@type": "Organization", name: "Safwan.Digital", url: "https://safwan.digital" } }];
  const sections = CATS.map(c => {
    const cards = TOOLS.filter(t => t.cat === c.id).map(t =>
      `<a class="card" data-slug="${t.slug}" href="${t.slug}/"><span class="ic">${icon(t.icon)}</span><h3>${t.name}</h3><p>${t.desc}</p></a>`).join("\n");
    return `<section class="cat" id="cat-${c.id}"><h2>${c.name}</h2><p>${c.blurb}</p><div class="grid">${cards}</div></section>`;
  }).join("\n");
  return head({ title: "ImageStow — Free Image Tools Online, Private by Design", meta: "Free image tools — compress, resize, convert, edit and clean images right in your browser. Private by design: files never leave your device. No sign-up.", url, ld }, "") + `
<body>
${header(HPFX)}
<main>
<div class="hero"><span class="pill">Free · No sign-up · Nothing uploaded</span>
<h1>Image tools that keep<br>your photos <em>yours.</em></h1>
<p>Compress, resize, convert and edit images right in your browser. Your files are never uploaded — everything happens on your device.</p>
<div class="search-wrap"><input type="search" id="toolSearch" placeholder="Search tools — try “shrink to 200kb” or “iphone photo”" aria-label="Search tools"><div class="search-results hidden" id="searchResults"></div></div>
</div>
<div class="wrap" id="tools">
${sections}
<section class="copy flush"><h2>Why your photos stay private here</h2>
<p>Most free image sites make you upload your photo to their server before they will touch it. ImageStow does the work inside your browser instead — the same technology that shows you this page also compresses and converts your images. Close the tab and nothing remains. There is no account, no upload queue and no copy of your picture anywhere but your device.</p>
<h2>The most-loved tools</h2>
<p><a href="compress-to-size/">Compress to a Target Size</a> gets a photo under the 200 KB limit that forms and portals demand. <a href="heic-to-jpg/">HEIC to JPG</a> opens iPhone photos anywhere. <a href="remove-metadata/">Remove Photo Metadata</a> strips the hidden location data most people never knew their photos carried. And when a job needs a PDF instead, our sister site <a href="https://pdfstow.safwan.digital/">PDFStow</a> does it the same private way.</p></section>
</div>
</main>
${footer(HPFX)}`;
}

function prosePage(slug, title, meta, h1, bodyHtml) {
  const HPFX = "../";
  const url = BASE + "/" + slug + "/";
  const ld = [{ "@context": "https://schema.org", "@type": "WebPage", name: title, url, description: meta, isPartOf: { "@type": "WebSite", name: "ImageStow", url: BASE + "/" } }];
  return head({ title, meta, url, ld }, "../") + `
<body>
${header(HPFX)}
<main><div class="prose"><h1>${h1}</h1>${bodyHtml}</div></main>
${footer(HPFX)}`;
}

function write(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log("wrote", rel, content.length);
}

/* ---- generate ---- */
write("index.html", homePage());
for (const t of TOOLS) write(path.join(t.slug, "index.html"), toolPage(t));

write("privacy/index.html", prosePage("privacy", "Privacy — How ImageStow Handles Your Files | ImageStow", "How ImageStow handles your files: they are never uploaded, never stored and never shared. Everything runs in your browser, on your device.", "Privacy, in plain words", `
<p><strong>Your images are never uploaded.</strong> Every ImageStow tool runs inside your web browser, on your device. When you pick an image, your browser reads it, does the work in the page, and gives you the result to download. No copy of your image is sent to us or stored anywhere.</p>
<h2>What does leave your device</h2>
<p>Only program code, never your files:</p>
<ul><li>The pages, design and tool code of this website itself.</li><li>On three tools only, a well-known open-source library is downloaded once so your browser can do the job: the HEIC reader (HEIC to JPG), the PDF maker (Images to PDF), and the ZIP maker (Bulk Compress and Favicon Generator). These libraries run on your device; they do not receive your images.</li></ul>
<h2>What we store</h2>
<p>One small setting on your device: your light/dark theme choice, kept in your browser's local storage. There are no accounts and no sign-ups, and we show no advertising. The visit counters below do set cookies of their own, run by Google and Microsoft.</p>
<h2>Counting visits</h2>
<p>We use two well-known services — <strong>Google Analytics</strong> and <strong>Microsoft Clarity</strong> — to count visits and see how this site is used: which pages and tools people open, what they click, how far they scroll, the kind of device and browser, and a rough location (country or city, never an exact address). We read those numbers to learn which tools are loved, which are confusing, and what to fix next.</p>
<p><strong>Your images are never part of this.</strong> They are processed inside your browser and never uploaded, so there is nothing about them for anyone to track — no picture, no file name, nothing. The counters only ever see that a page was visited, never the files you work on.</p>
<h2>When you close the tab</h2>
<p>The images you were working on are gone with it. Your downloads are yours — check them before sharing, because a downloaded copy carries whatever you put in it.</p>
<p>Questions? Write to <a href="mailto:mail@safwan.digital">mail@safwan.digital</a>.</p>`));

write("about/index.html", prosePage("about", "About ImageStow — Free Image Tools by Safwan.Digital", "ImageStow is a free set of image tools by Safwan.Digital that runs entirely in your browser — compress, resize, convert and edit with nothing uploaded.", "About ImageStow", `
<p>ImageStow is a free set of image tools that runs entirely in your browser: compress, resize, convert, edit and clean up images without uploading them anywhere.</p>
<p>It was built because the popular free tools all ask for the same thing — your photo, uploaded to their server, often with a batch limit or a sign-up wall. Your photos are personal. A picture of your ID, your product, your family should not need a trip to a stranger's server just to make it smaller.</p>
<h2>The Stow family</h2>
<p>ImageStow's sister site is <a href="https://pdfstow.safwan.digital/">PDFStow</a>, free PDF tools built on the same rule: the work happens on your device, private by design.</p>
<p>Both are built by <a href="https://safwan.digital">Safwan.Digital</a>.</p>`));

write("terms/index.html", prosePage("terms", "ImageStow Terms — Simple, Plain-Word Rules | ImageStow", "The simple terms for using ImageStow's free browser image tools: free for personal and business use, your files stay yours, results are yours to check.", "Terms, in plain words", `
<p>ImageStow is free to use for personal and business work. There is no account and no payment.</p>
<h2>Your files, your responsibility</h2>
<p>Your images never leave your device, so we never see them and cannot recover them. Keep your own copies of anything important. Check a result before you rely on it — for official documents, like passport photos, the issuing authority's rules decide what is accepted, and this site can only get the size and format right.</p>
<h2>No promises we cannot keep</h2>
<p>The tools are provided as they are, without a warranty. Browsers differ, and a rare file may not convert — the tool will tell you plainly when that happens. We may improve, add or remove tools over time.</p>
<p>Questions? <a href="mailto:mail@safwan.digital">mail@safwan.digital</a>.</p>`));

write("contact/index.html", prosePage("contact", "Contact ImageStow — Questions & Feedback | ImageStow", "Contact ImageStow and Safwan.Digital by email — tell us which tool you used and what happened, and we will take a look. Please do not email images.", "Contact", `
<p>The fastest way to reach us is email:</p>
<p class="bigmail"><a href="mailto:mail@safwan.digital"><strong>mail@safwan.digital</strong></a></p>
<p>Tell us which tool you used and what happened, and we will take a look. Please do not email us your images — the tools run in your browser precisely so your files never have to travel.</p>
<p>ImageStow is built by <a href="https://safwan.digital">Safwan.Digital</a>.</p>`));

write("404.html", head({ title: "Page not found — ImageStow", meta: "That page does not exist. Browse all free ImageStow tools instead.", url: BASE + "/404.html", noindex: true, noCanonical: true }, "/") + `
<body>${header("/")}<main><div class="prose"><h1>That page is not here</h1><p>The link may be old or mistyped. <a href="/">See all the image tools</a> instead.</p></div></main>${footer("/")}`);

const urls = ["/", ...TOOLS.map(t => "/" + t.slug + "/"), "/privacy/", "/about/", "/terms/", "/contact/"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + urls.map(u => `<url><loc>${BASE}${u}</loc></url>`).join("\n") + "\n</urlset>\n");
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
write("llms.txt", `# ImageStow — Free Image Tools, Private by Design\n\n> Free image tools that run 100% in the browser: files are never uploaded, no sign-up. Built by Safwan.Digital. Sister site: PDFStow (PDF tools, same rule).\n\n## Tools\n` + TOOLS.map(t => `- [${t.name}](${BASE}/${t.slug}/): ${t.desc}`).join("\n") + `\n\n## Pages\n- [About](${BASE}/about/)\n- [Privacy](${BASE}/privacy/)\n- [Terms](${BASE}/terms/)\n- [Contact](${BASE}/contact/)\n`);
write("manifest.json", JSON.stringify({ name: "ImageStow — Free Image Tools", short_name: "ImageStow", description: "Free image tools in your browser. Private by design.", start_url: ".", scope: ".", display: "standalone", background_color: "#070d1a", theme_color: "#1A365D", icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }] }, null, 2));
write("tools-data.js", "window.ISTOOLS = " + JSON.stringify(TOOLS.map(t => ({ slug: t.slug, name: t.name, cat: t.cat, desc: t.desc, keys: t.keys }))) + ";\n");
console.log("DONE:", TOOLS.length, "tools,", urls.length, "sitemap URLs");
