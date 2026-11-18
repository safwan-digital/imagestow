"use strict";
/* ImageStow — all processing runs in this page. Files are never uploaded.
   Lazy third-party libraries (pinned CDN, loaded only when a tool needs them):
   - heic2any 0.0.4 (HEIC decode, heic-to-jpg only)
   - pdf-lib 1.17.1 (images-to-pdf only)
   - JSZip 3.10.1 (bulk-compress and favicon-generator ZIP downloads)
   Analytics: NOT installed yet — no ImageStow GA/GTM/Clarity property exists.
   TODO(analytics): add ImageStow's own tags here after Safwan creates the property. Do NOT reuse PDFStow IDs. */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* ---------- theme ---------- */
(function () {
  const btn = $("#themeBtn");
  if (!btn) return;
  const sync = () => { btn.textContent = document.documentElement.dataset.theme === "dark" ? "☀ Light" : "☾ Dark"; };
  sync();
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("imagestow-theme", next); } catch (e) {}
    sync();
  });
})();

/* ---------- small utils ---------- */
function fmtBytes(n) {
  if (n == null || isNaN(n)) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(/\.0$/, "") + " KB";
  return (n / (1024 * 1024)).toFixed(2).replace(/\.00$/, "") + " MB";
}
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
function baseOf(name) { const b = (name || "image").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/g, ""); return b || "image"; }
function outName(file, suffix, ext) { return "imagestow-" + baseOf(file && file.name) + (suffix ? "-" + baseOf(suffix) : "") + "." + ext; }
function mimeExt(mime) { return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime] || "png"; }
function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) {
      const iv = setInterval(() => { if (scriptReady(src)) { clearInterval(iv); res(); } }, 60);
      setTimeout(() => { clearInterval(iv); res(); }, 4000);
      return;
    }
    const s = document.createElement("script");
    s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load a needed library. Check your connection and try again."));
    if (SRI[src]) { s.integrity = SRI[src]; s.crossOrigin = "anonymous"; }
    document.head.appendChild(s);
  });
  function scriptReady(src) {
    if (src.includes("heic2any")) return !!window.heic2any;
    if (src.includes("pdf-lib")) return !!window.PDFLib;
    if (src.includes("jszip")) return !!window.JSZip;
    return true;
  }
}
const CDN = {
  heic: "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js",
  pdf: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  zip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
};
/* Subresource Integrity hashes (sha384) for the pinned CDN files above — verified against the live files 2026-11-18. */
const SRI = {
  "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js": "sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js": "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js": "sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG"
};

/* ---------- image engine ---------- */
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("That file could not be read as an image. Try a different image file."));
    img.src = src;
  });
}
async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try { const img = await loadImage(url); return { img, url }; }
  catch (e) { URL.revokeObjectURL(url); throw e; }
}
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function canvasBlob(canvas, type, q) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("Your browser could not create that file. Try a smaller image.")), type, q));
}
/* Draw img into a fresh canvas at w×h. opts: bg (flatten colour), filter, drawExtra(ctx,w,h) */
function renderCanvas(img, w, h, opts) {
  opts = opts || {};
  const c = makeCanvas(w, h), ctx = c.getContext("2d", { willReadFrequently: !!opts.readPixels });
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, c.width, c.height); }
  if (opts.filter) ctx.filter = opts.filter;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.filter = "none";
  if (opts.drawExtra) opts.drawExtra(ctx, c.width, c.height);
  return c;
}
async function encodeImage(img, opts) {
  opts = opts || {};
  const w = opts.w || img.naturalWidth, h = opts.h || img.naturalHeight;
  const type = opts.type || "image/png";
  const bg = opts.bg || (type === "image/jpeg" ? "#ffffff" : undefined);
  const c = renderCanvas(img, w, h, { bg, filter: opts.filter, drawExtra: opts.drawExtra });
  return canvasBlob(c, type, opts.q);
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ---------- JPEG segment strip (metadata removal, lossless) ---------- */
function stripJpegMetadata(u8) {
  if (u8.length < 2 || u8[0] !== 0xFF || u8[1] !== 0xD8) throw new Error("Not a JPEG file.");
  const out = [u8[0], u8[1]];
  let i = 2;
  while (i + 4 <= u8.length) {
    if (u8[i] !== 0xFF) break;
    const marker = u8[i + 1];
    if (marker === 0xDA) { for (let j = i; j < u8.length; j++) out.push(u8[j]); return new Uint8Array(out); } // SOS: copy rest
    if (marker === 0xD9) break;
    if (marker >= 0xD0 && marker <= 0xD7 || marker === 0x01) { out.push(u8[i], u8[i + 1]); i += 2; continue; }
    const len = (u8[i + 2] << 8) + u8[i + 3];
    if (i + 2 + len > u8.length) { for (let j = i; j < u8.length; j++) out.push(u8[j]); return new Uint8Array(out); } // malformed tail: keep the rest untouched
    const isApp = marker >= 0xE0 && marker <= 0xEF;
    const keep = marker === 0xE0 || marker === 0xE2 || marker === 0xEE; // keep JFIF (APP0), ICC colour profile (APP2), Adobe (APP14)
    const drop = (isApp && !keep) || marker === 0xFE; // drop other APPn (EXIF/XMP/etc.) + comments
    if (!drop) for (let j = i; j < i + 2 + len; j++) out.push(u8[j]);
    i += 2 + len;
  }
  return new Uint8Array(out);
}

/* ---------- EXIF / TIFF parser ---------- */
function parseJpegExif(u8) {
  const out = { found: false };
  if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return out;
  let i = 2;
  while (i + 4 <= u8.length) {
    if (u8[i] !== 0xFF) break;
    const marker = u8[i + 1];
    if (marker === 0xDA || marker === 0xD9) break;
    const len = (u8[i + 2] << 8) + u8[i + 3];
    if (marker === 0xE1 && i + 10 <= u8.length &&
        u8[i + 4] === 0x45 && u8[i + 5] === 0x78 && u8[i + 6] === 0x69 && u8[i + 7] === 0x66 && u8[i + 8] === 0 && u8[i + 9] === 0) {
      try { Object.assign(out, parseTiff(u8, i + 10)); out.found = true; } catch (e) { /* broken EXIF: report not found */ }
      return out;
    }
    i += 2 + len;
  }
  return out;
}
function parseTiff(u8, base) {
  const le = u8[base] === 0x49 && u8[base + 1] === 0x49;
  const u16 = o => le ? u8[base + o] + (u8[base + o + 1] << 8) : (u8[base + o] << 8) + u8[base + o + 1];
  const u32 = o => le ? (u16(o) + u16(o + 2) * 65536) >>> 0 : (u16(o) * 65536 + u16(o + 2)) >>> 0;
  const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  function readValue(type, count, rawOff) {
    const size = (typeSize[type] || 1) * count;
    const off = size <= 4 ? rawOff : u32(rawOff);
    const at = base + off;
    if (type === 2) { let s = ""; for (let k = 0; k < count; k++) { const ch = u8[at + k]; if (ch === 0) break; s += String.fromCharCode(ch); } return s.trim(); }
    if (type === 3) { const a = []; for (let k = 0; k < count; k++) a.push(u16(off + k * 2)); return count === 1 ? a[0] : a; }
    if (type === 4) { const a = []; for (let k = 0; k < count; k++) a.push(u32(off + k * 4)); return count === 1 ? a[0] : a; }
    if (type === 5 || type === 10) {
      const a = [];
      for (let k = 0; k < count; k++) {
        const n = type === 5 ? u32(off + k * 8) : (function (o) { const v = u32(o); return v > 0x7FFFFFFF ? v - 0x100000000 : v; })(off + k * 8);
        const d = type === 5 ? u32(off + k * 8 + 4) : (function (o) { const v = u32(o); return v > 0x7FFFFFFF ? v - 0x100000000 : v; })(off + k * 8 + 4);
        a.push(d === 0 ? 0 : n / d);
      }
      return a;
    }
    return undefined;
  }
  function readIFD(off) {
    const map = {};
    if (!off || base + off + 2 > u8.length) return map;
    const n = u16(off);
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12;
      if (base + e + 12 > u8.length) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      try { map[tag] = readValue(type, count, e + 8); } catch (err) {}
      if (tag === 0x8769 || tag === 0x8825 || tag === 0xA005) map["ptr_" + tag.toString(16)] = u32(e + 8);
    }
    return map;
  }
  const res = {};
  const ifd0 = readIFD(u32(4));
  if (ifd0[0x010F]) res.make = String(ifd0[0x010F]);
  if (ifd0[0x0110]) res.model = String(ifd0[0x0110]);
  if (ifd0[0x0132]) res.dateTime = String(ifd0[0x0132]);
  if (ifd0[0x0131]) res.software = String(ifd0[0x0131]);
  if (ifd0[0x013B]) res.artist = String(ifd0[0x013B]);
  const exifOff = ifd0["ptr_8769"];
  if (exifOff) {
    const ex = readIFD(exifOff);
    if (ex[0x9003]) res.dateOriginal = String(ex[0x9003]);
    if (ex[0xA002]) res.pixelWidth = ex[0xA002];
    if (ex[0xA003]) res.pixelHeight = ex[0xA003];
  }
  const gpsOff = ifd0["ptr_8825"];
  if (gpsOff) {
    const g = readIFD(gpsOff);
    const dms = a => Array.isArray(a) && a.length >= 3 ? a[0] + a[1] / 60 + a[2] / 3600 : null;
    const lat = dms(g[2]), lng = dms(g[4]);
    if (lat != null) res.gpsLat = (g[1] === "S" ? -lat : lat);
    if (lng != null) res.gpsLng = (g[3] === "W" ? -lng : lng);
  }
  return res;
}
async function readMetadata(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const meta = { fileName: file.name, fileSize: file.size, fileType: file.type || ("image/" + extOf(file.name)), exif: null };
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    const ex = parseJpegExif(buf);
    if (ex.found) meta.exif = ex;
  } else if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    meta.pngWidth = (buf[16] << 24) + (buf[17] << 16) + (buf[18] << 8) + buf[19];
    meta.pngHeight = (buf[20] << 24) + (buf[21] << 16) + (buf[22] << 8) + buf[23];
  }
  return meta;
}
function metadataRows(meta, dims) {
  const rows = [];
  rows.push(["File name", meta.fileName]);
  rows.push(["File size", fmtBytes(meta.fileSize)]);
  rows.push(["File type", meta.fileType]);
  const w = (meta.exif && meta.exif.pixelWidth) || meta.pngWidth || (dims && dims.w);
  const h = (meta.exif && meta.exif.pixelHeight) || meta.pngHeight || (dims && dims.h);
  if (w && h) rows.push(["Image size", w + " × " + h + " pixels"]);
  if (meta.exif) {
    const e = meta.exif;
    if (e.make) rows.push(["Camera maker", e.make]);
    if (e.model) rows.push(["Camera / phone model", e.model]);
    if (e.dateOriginal || e.dateTime) rows.push(["Date taken", e.dateOriginal || e.dateTime]);
    if (e.software) rows.push(["Software", e.software]);
    if (e.artist) rows.push(["Artist", e.artist]);
    if (e.gpsLat != null && e.gpsLng != null) rows.push(["GPS location", e.gpsLat.toFixed(6) + ", " + e.gpsLng.toFixed(6)]);
  }
  return rows;
}
function hasHiddenMetadata(meta) {
  if (!meta.exif) return false;
  const e = meta.exif;
  return !!(e.make || e.model || e.dateTime || e.dateOriginal || e.software || e.artist || e.gpsLat != null);
}

/* ---------- compress to a target size ---------- */
async function encodeAtScale(img, scale, type, q) {
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  return encodeImage(img, { w, h, type, q });
}
async function compressToTarget(img, targetBytes, type) {
  type = type || "image/jpeg";
  const scales = [1, 0.85, 0.7, 0.55, 0.42, 0.32, 0.24, 0.18, 0.13];
  for (const s of scales) {
    let lo = 0.05, hi = 0.92, best = null;
    const top = await encodeAtScale(img, s, type, hi);
    if (top.size <= targetBytes) return { blob: top, reached: true, quality: hi, scale: s };
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2;
      const b = await encodeAtScale(img, s, type, q);
      if (b.size <= targetBytes) { best = { blob: b, quality: q }; lo = q; } else hi = q;
    }
    if (best) return { blob: best.blob, reached: true, quality: best.quality, scale: s };
  }
  const floor = await encodeAtScale(img, 0.1, type, 0.06);
  return { blob: floor, reached: floor.size <= targetBytes, quality: 0.06, scale: 0.1 };
}

/* ---------- shared page state + shell wiring ---------- */
const state = { files: [], img: null, url: null, extra: {} };
function showError(msg) {
  const r = $("#result"); if (!r) return;
  r.classList.remove("hidden");
  r.innerHTML = '<p class="err" role="alert">' + msg + "</p>";
}
function resultBox(html) {
  const r = $("#result");
  r.classList.remove("hidden");
  r.innerHTML = html;
  return r;
}
function dlButton(blob, name, label) {
  const a = document.createElement("a");
  a.className = "btn"; a.textContent = label || ("Download " + name);
  a.href = URL.createObjectURL(blob); a.download = name;
  return a;
}
function statsHtml(items) {
  return '<div class="stats">' + items.map(it => "<div><b>" + it[1] + "</b><span>" + it[0] + "</span></div>").join("") + "</div>";
}
function wireShell(onFiles) {
  const input = $("#fileInput"), drop = $("#dropZone");
  if (!input) return;
  const pick = files => {
    const list = Array.from(files || []).filter(f => f && (f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|svg)$/i.test(f.name)));
    if (!list.length) { showError("That is not an image file. Pick a JPG, PNG, WebP, GIF, SVG or HEIC image."); return; }
    state.files = list;
    state.extra = {};
    $("#workArea").classList.remove("hidden");
    const f = list[0];
    $("#fileName").textContent = list.length > 1 ? list.length + " images picked" : f.name;
    $("#fileMeta").textContent = list.length > 1 ? "Total " + fmtBytes(list.reduce((a, b) => a + b.size, 0)) : fmtBytes(f.size) + (f.type ? " · " + f.type : "");
    $("#result").classList.add("hidden"); $("#result").innerHTML = "";
    onFiles && onFiles(list);
  };
  input.addEventListener("change", () => pick(input.files));
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => pick(e.dataTransfer.files));
  return pick;
}
async function loadPreview(file) {
  if (state.url) URL.revokeObjectURL(state.url);
  try {
    const { img, url } = await fileToImage(file);
    state.img = img; state.url = url;
    const pv = $("#previewImg");
    if (pv) pv.src = url;
    return img;
  } catch (e) {
    /* A file that cannot be read must not leave an empty work area with live controls behind. */
    const w = $("#workArea"); if (w) w.classList.add("hidden");
    throw e;
  }
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { if (!btn.dataset.label) btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = label || "Working…"; }
  else { btn.disabled = false; if (btn.dataset.label) { btn.textContent = btn.dataset.label; delete btn.dataset.label; } }
}

/* ---------- region selector (crop + blur) ---------- */
function freshStage() {
  const old = $("#stage");
  if (!old) return null;
  const c = old.cloneNode(false); // clone drops old pointer listeners — each selector starts clean
  old.replaceWith(c);
  return c;
}
function makeRegionSelector(canvas, img) {
  const MAXW = 760, MAXH = 520;
  const scale = Math.min(MAXW / img.naturalWidth, MAXH / img.naturalHeight, 1);
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let rect = { x: img.naturalWidth * 0.2, y: img.naturalHeight * 0.2, w: img.naturalWidth * 0.6, h: img.naturalHeight * 0.6 };
  let drag = null;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const x = rect.x * scale, y = rect.y * scale, w = rect.w * scale, h = rect.h * scale;
    ctx.fillStyle = "rgba(7,13,26,.45)";
    ctx.fillRect(0, 0, canvas.width, y); ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
    ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, canvas.width - x - w, h);
    ctx.strokeStyle = "#c5a059"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#c5a059";
    ctx.fillRect(x + w - 7, y + h - 7, 14, 14);
  }
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width) / scale, y: (e.clientY - r.top) * (canvas.height / r.height) / scale };
  }
  canvas.addEventListener("pointerdown", e => {
    const p = pos(e); canvas.setPointerCapture(e.pointerId);
    const hx = rect.x + rect.w, hy = rect.y + rect.h;
    if (Math.abs(p.x - hx) < 26 / scale && Math.abs(p.y - hy) < 26 / scale) drag = { mode: "resize" };
    else if (p.x >= rect.x && p.x <= hx && p.y >= rect.y && p.y <= hy) drag = { mode: "move", dx: p.x - rect.x, dy: p.y - rect.y };
    else drag = { mode: "new", x0: p.x, y0: p.y };
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = pos(e);
    if (drag.mode === "move") {
      rect.x = Math.min(Math.max(0, p.x - drag.dx), img.naturalWidth - rect.w);
      rect.y = Math.min(Math.max(0, p.y - drag.dy), img.naturalHeight - rect.h);
    } else if (drag.mode === "resize") {
      rect.w = Math.min(Math.max(20, p.x - rect.x), img.naturalWidth - rect.x);
      rect.h = Math.min(Math.max(20, p.y - rect.y), img.naturalHeight - rect.y);
    } else {
      rect.x = Math.min(drag.x0, p.x); rect.y = Math.min(drag.y0, p.y);
      rect.w = Math.abs(p.x - drag.x0); rect.h = Math.abs(p.y - drag.y0);
    }
    draw();
  });
  canvas.addEventListener("pointerup", () => { drag = null; });
  draw();
  return { getRect: () => ({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(1, Math.round(rect.w)), h: Math.max(1, Math.round(rect.h)) }), redraw: draw, canvas, ctx, scale };
}

/* ================= TOOL IMPLEMENTATIONS ================= */
const SLUG = document.body.dataset.tool || "";
const val = id => { const el = $(id); return el ? el.value : ""; };
const num = (id, d) => { const v = parseFloat(val(id)); return isNaN(v) ? d : v; };
const checked = id => { const el = $(id); return !!(el && el.checked); };

function simpleConvert(outMime) {
  wireShell(async files => {
    try { await loadPreview(files[0]); } catch (e) { showError(e.message); }
  });
  const btn = $("#runBtn");
  if (btn) btn.addEventListener("click", async () => {
    if (!state.img) return showError("Pick an image first.");
    busy(btn, true);
    try {
      const q = $("#quality") ? num("#quality", 92) / 100 : undefined;
      const blob = await encodeImage(state.img, { type: outMime, q, bg: outMime === "image/jpeg" ? "#ffffff" : undefined });
      const name = outName(state.files[0], "", mimeExt(outMime));
      const r = resultBox(statsHtml([["Before", fmtBytes(state.files[0].size)], ["After", fmtBytes(blob.size)], ["New size", state.img.naturalWidth + " × " + state.img.naturalHeight]]));
      r.appendChild(dlButton(blob, name));
    } catch (e) { showError(e.message); }
    busy(btn, false);
  });
  const q = $("#quality"), qv = $("#qualityVal");
  if (q && qv) q.addEventListener("input", () => qv.textContent = q.value + "%");
}

const IMPL = {
  /* ----- convert family ----- */
  "jpg-to-png": () => simpleConvert("image/png"),
  "png-to-jpg": () => simpleConvert("image/jpeg"),
  "jpg-to-webp": () => simpleConvert("image/webp"),
  "png-to-webp": () => simpleConvert("image/webp"),
  "webp-to-jpg": () => simpleConvert("image/jpeg"),
  "webp-to-png": () => simpleConvert("image/png"),

  "heic-to-jpg": () => {
    wireShell(async files => {
      const pv = $("#previewImg"); if (pv) pv.removeAttribute("src");
      resultBox('<p class="note">HEIC file picked: <b>' + escapeHtml(files[0].name) + "</b> (" + fmtBytes(files[0].size) + '). Press the button to convert it.</p>');
    });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.files.length) return showError("Pick a HEIC photo first.");
      busy(btn, true, "Loading HEIC reader…");
      try {
        await loadScriptOnce(CDN.heic);
        if (!window.heic2any) throw new Error("The HEIC reader did not load.");
        busy(btn, true, "Converting… big photos can take a few seconds.");
        const q = num("#quality", 92) / 100;
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Timed out")), 120000));
        let out = await Promise.race([window.heic2any({ blob: state.files[0], toType: "image/jpeg", quality: q }), timeout]);
        if (Array.isArray(out)) out = out[0];
        const { img, url } = await fileToImage(new File([out], "x.jpg", { type: "image/jpeg" }));
        state.img = img; state.url = url;
        const pv = $("#previewImg"); if (pv) pv.src = url;
        const name = outName(state.files[0], "", "jpg");
        const r = resultBox(statsHtml([["Before", fmtBytes(state.files[0].size)], ["After (JPG)", fmtBytes(out.size)], ["Size", img.naturalWidth + " × " + img.naturalHeight]]));
        r.appendChild(dlButton(out, name));
      } catch (err) {
        showError("We could not convert this HEIC photo in your browser. Some HEIC photos (like Live Photos) cannot be read here, or the extra code this tool needs did not download. Check your connection and try again, try a different photo, or save the photo as JPG in your phone's Photos app first.");
      }
      busy(btn, false);
    });
    const q = $("#quality"), qv = $("#qualityVal");
    if (q && qv) q.addEventListener("input", () => qv.textContent = q.value + "%");
  },

  "svg-to-png": () => {
    let svgText = "", ratio = 1, vbW = 0, vbH = 0;
    wireShell(async files => {
      try {
        svgText = await files[0].text();
        const m = /viewBox\s*=\s*"([\d.\s-]+)"/.exec(svgText);
        const wm = /width\s*=\s*"(\d+(?:\.\d+)?)"/.exec(svgText), hm = /height\s*=\s*"(\d+(?:\.\d+)?)"/.exec(svgText);
        if (m) { const p = m[1].trim().split(/\s+/).map(Number); vbW = p[2]; vbH = p[3]; }
        else if (wm && hm) { vbW = Number(wm[1]); vbH = Number(hm[1]); }
        if (!vbW || !vbH) throw new Error("This SVG file does not say how big it is, so we cannot size the PNG. Open it in an SVG editor, set its size (the viewBox setting), save it and try again.");
        ratio = vbH / vbW;
        const wEl = $("#width"); if (wEl && !wEl.value) wEl.value = Math.round(vbW) || 1024;
        await loadPreview(files[0]);
        updateH();
      } catch (e) { showError(e.message); }
    });
    function updateH() { const w = num("#width", 1024); const el = $("#heightOut"); if (el) el.textContent = Math.round(w * ratio) + " px tall"; }
    const wEl = $("#width"); if (wEl) wEl.addEventListener("input", updateH);
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!svgText) return showError("Pick an SVG file first.");
      busy(btn, true);
      try {
        const w = Math.max(16, num("#width", 1024));
        const h = Math.round(w * ratio);
        const blobUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
        const img = await loadImage(blobUrl);
        const bg = val("#bg") === "white" ? "#ffffff" : undefined;
        const out = await encodeImage(img, { w, h, type: "image/png", bg });
        URL.revokeObjectURL(blobUrl);
        const r = resultBox(statsHtml([["PNG size", w + " × " + h], ["File size", fmtBytes(out.size)]]));
        r.appendChild(dlButton(out, outName(state.files[0], "", "png")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "images-to-pdf": () => {
    wireShell(files => {
      const t = $("#thumbs");
      if (t) { t.innerHTML = ""; files.forEach(f => { const i = document.createElement("img"); i.src = URL.createObjectURL(f); i.alt = f.name; t.appendChild(i); }); }
    });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.files.length) return showError("Pick at least one image first.");
      busy(btn, true, "Loading PDF maker…");
      try {
        await loadScriptOnce(CDN.pdf);
        if (!window.PDFLib) throw new Error("The PDF library did not load. Check your connection and try again.");
        busy(btn, true, "Making your PDF…");
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.create();
        const a4 = val("#pageSize") === "a4";
        for (const f of state.files) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          let emb, dims;
          if (f.type === "image/png" || extOf(f.name) === "png") { emb = await doc.embedPng(bytes); dims = emb.scale(1); }
          else {
            const { img } = await fileToImage(f);
            const jb = await encodeImage(img, { type: "image/jpeg", q: 0.92 });
            emb = await doc.embedJpg(new Uint8Array(await jb.arrayBuffer())); dims = emb.scale(1);
          }
          if (a4) {
            const page = doc.addPage([595.28, 841.89]);
            const s = Math.min((595.28 - 56) / dims.width, (841.89 - 56) / dims.height, 1);
            page.drawImage(emb, { x: (595.28 - dims.width * s) / 2, y: (841.89 - dims.height * s) / 2, width: dims.width * s, height: dims.height * s });
          } else {
            const page = doc.addPage([dims.width * 0.75, dims.height * 0.75]);
            page.drawImage(emb, { x: 0, y: 0, width: dims.width * 0.75, height: dims.height * 0.75 });
          }
        }
        const pdfBytes = await doc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const r = resultBox(statsHtml([["Pages", String(state.files.length)], ["PDF size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, "imagestow-images.pdf", "Download PDF"));
      } catch (err) { showError(err.message || "Something went wrong making the PDF."); }
      busy(btn, false);
    });
  },

  /* ----- compress / resize ----- */
  "compress-image": () => {
    let estimateTimer = null;
    wireShell(async files => { try { await loadPreview(files[0]); estimate(); } catch (e) { showError(e.message); } });
    function outType() {
      const f = state.files[0];
      const t = f && f.type;
      return t === "image/png" || t === "image/webp" ? t : "image/jpeg";
    }
    async function estimate() {
      if (!state.img) return;
      const q = num("#quality", 80) / 100;
      try {
        const b = await encodeImage(state.img, { type: outType(), q });
        const el = $("#estimate");
        if (el) el.textContent = "Estimated result: " + fmtBytes(b.size) + " (from " + fmtBytes(state.files[0].size) + ")";
        state.extra.lastBlob = b;
      } catch (e) {}
    }
    const q = $("#quality"), qv = $("#qualityVal");
    if (q) q.addEventListener("input", () => { qv.textContent = q.value + "%"; clearTimeout(estimateTimer); estimateTimer = setTimeout(estimate, 220); });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const blob = await encodeImage(state.img, { type: outType(), q: num("#quality", 80) / 100 });
        const before = state.files[0].size;
        const pct = Math.max(0, Math.round((1 - blob.size / before) * 100));
        const name = outName(state.files[0], "compressed", mimeExt(outType()));
        const r = resultBox(statsHtml([["Before", fmtBytes(before)], ["After", fmtBytes(blob.size)], ["Saved", pct + "%"]]));
        if (blob.size >= before) { const w = document.createElement("p"); w.className = "note"; w.textContent = outType() === "image/png" ? "This copy is not smaller than the original. PNG has no quality setting to lower — for a smaller file, convert the image to JPG or WebP instead." : "This copy is not smaller than the original — the original was already well compressed. Try a lower quality setting."; r.appendChild(w); }
        r.appendChild(dlButton(blob, name));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "compress-to-size": () => {
    wireShell(async files => { try { await loadPreview(files[0]); } catch (e) { showError(e.message); } });
    $$('input[name="target"]').forEach(r => r.addEventListener("change", () => {
      const custom = document.querySelector('input[name="target"]:checked');
      $("#customKbWrap").classList.toggle("hidden", !(custom && custom.value === "custom"));
    }));
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      const sel = document.querySelector('input[name="target"]:checked');
      const kb = sel && sel.value === "custom" ? num("#customKb", 200) : num("input[name=target]:checked", NaN) || parseFloat(sel ? sel.value : "200");
      const target = Math.max(5, kb) * 1024;
      busy(btn, true, "Squeezing to under " + kb + " KB…");
      try {
        const res = await compressToTarget(state.img, target, "image/jpeg");
        const name = outName(state.files[0], "under-" + Math.round(kb) + "kb", "jpg");
        const items = [["Target", "under " + kb + " KB"], ["Result", fmtBytes(res.blob.size)], ["Before", fmtBytes(state.files[0].size)]];
        if (res.scale < 1) items.push(["Image size", Math.round(state.img.naturalWidth * res.scale) + " × " + Math.round(state.img.naturalHeight * res.scale)]);
        const r = resultBox(statsHtml(items));
        if (!res.reached) { const w = document.createElement("p"); w.className = "warn"; w.textContent = "We could not get this image under " + kb + " KB without making it tiny and blurry. This is the smallest good-quality copy we could make (" + fmtBytes(res.blob.size) + "). Try a higher target, or resize the image first."; r.appendChild(w); }
        else { const ok = document.createElement("p"); ok.className = "saved"; ok.textContent = "Done — your copy is under " + kb + " KB."; r.appendChild(ok); }
        r.appendChild(dlButton(res.blob, name));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "bulk-compress": () => {
    wireShell(files => {
      const t = $("#thumbs");
      if (t) { t.innerHTML = ""; files.forEach(f => { const i = document.createElement("img"); i.src = URL.createObjectURL(f); i.alt = f.name; t.appendChild(i); }); }
    });
    const q = $("#quality"), qv = $("#qualityVal");
    if (q && qv) q.addEventListener("input", () => qv.textContent = q.value + "%");
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.files.length) return showError("Pick at least one image first.");
      busy(btn, true, "Loading ZIP maker…");
      try {
        await loadScriptOnce(CDN.zip);
        if (!window.JSZip) throw new Error("The ZIP library did not load. Check your connection and try again.");
        const quality = num("#quality", 80) / 100;
        const zip = new window.JSZip();
        let before = 0, after = 0, done = 0;
        const lines = [];
        for (const f of state.files) {
          busy(btn, true, "Compressing " + (done + 1) + " of " + state.files.length + "…");
          try {
            const { img } = await fileToImage(f);
            const type = f.type === "image/webp" ? "image/webp" : f.type === "image/png" ? "image/png" : "image/jpeg";
            const b = await encodeImage(img, { type, q: quality });
            zip.file(outName(f, "compressed", mimeExt(type)), b);
            before += f.size; after += b.size; done++;
            lines.push(f.name + ": " + fmtBytes(f.size) + " → " + fmtBytes(b.size));
          } catch (err) { lines.push(f.name + ": skipped (could not be read)"); }
        }
        if (!done) throw new Error("None of those images could be read. Try JPG, PNG or WebP images instead.");
        busy(btn, true, "Zipping…");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const r = resultBox(statsHtml([["Images", String(done)], ["Before (total)", fmtBytes(before)], ["After (total)", fmtBytes(after)]]));
        const pre = document.createElement("pre"); pre.className = "note"; pre.textContent = lines.join("\n"); r.appendChild(pre);
        r.appendChild(dlButton(zipBlob, "imagestow-compressed-images.zip", "Download ZIP of " + done + " images"));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "resize-image": () => {
    wireShell(async files => {
      try {
        const img = await loadPreview(files[0]);
        $("#w").value = img.naturalWidth; $("#h").value = img.naturalHeight;
        state.extra.ratio = img.naturalWidth / img.naturalHeight;
      } catch (e) { showError(e.message); }
    });
    function syncFrom(changed) {
      if (!state.img) return;
      const ratio = state.extra.ratio || 1;
      if (changed === "pct") {
        const p = num("#pct", 100) / 100;
        $("#w").value = Math.max(1, Math.round(state.img.naturalWidth * p));
        $("#h").value = Math.max(1, Math.round(state.img.naturalHeight * p));
        return;
      }
      if (!checked("#lock")) return;
      if (changed === "w") $("#h").value = Math.max(1, Math.round(num("#w", 1) / ratio));
      else $("#w").value = Math.max(1, Math.round(num("#h", 1) * ratio));
    }
    ["w", "h", "pct"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("input", () => syncFrom(id)); });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const w = Math.max(1, num("#w", state.img.naturalWidth)), h = Math.max(1, num("#h", state.img.naturalHeight));
        const f = state.files[0];
        const type = f.type === "image/png" || f.type === "image/webp" ? f.type : "image/jpeg";
        const blob = await encodeImage(state.img, { w, h, type, q: 0.92 });
        const r = resultBox(statsHtml([["New size", w + " × " + h], ["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(f, w + "x" + h, mimeExt(type))));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "resize-social": () => {
    wireShell(async files => { try { await loadPreview(files[0]); } catch (e) { showError(e.message); } });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const [tw, th] = val("#preset").split("x").map(Number);
        const img = state.img;
        const mode = val("#mode");
        let canvas;
        if (mode === "fit") {
          canvas = makeCanvas(tw, th);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = val("#bgc") || "#ffffff"; ctx.fillRect(0, 0, tw, th);
          const s = Math.min(tw / img.naturalWidth, th / img.naturalHeight);
          ctx.drawImage(img, (tw - img.naturalWidth * s) / 2, (th - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        } else {
          const s = Math.max(tw / img.naturalWidth, th / img.naturalHeight);
          const sw = tw / s, sh = th / s;
          canvas = makeCanvas(tw, th);
          canvas.getContext("2d").drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, tw, th);
        }
        const blob = await canvasBlob(canvas, "image/jpeg", 0.92);
        const label = $("#preset").selectedOptions[0].textContent.replace(/\s+/g, "-").toLowerCase();
        const r = resultBox(statsHtml([["New size", tw + " × " + th], ["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(state.files[0], label, "jpg")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "passport-photo": () => {
    wireShell(async files => { try { await loadPreview(files[0]); } catch (e) { showError(e.message); } });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick a photo first.");
      busy(btn, true);
      try {
        const TW = 413, TH = 531, img = state.img;
        const s = Math.max(TW / img.naturalWidth, TH / img.naturalHeight);
        const sw = TW / s, sh = TH / s;
        const canvas = makeCanvas(TW, TH);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = val("#bgc") || "#ffffff"; ctx.fillRect(0, 0, TW, TH);
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, Math.max(0, (img.naturalHeight - sh) / 2 - img.naturalHeight * 0.08), sw, sh, 0, 0, TW, TH);
        const blob = await canvasBlob(canvas, "image/jpeg", 0.95);
        const r = resultBox(statsHtml([["Print size", "35 × 45 mm"], ["Pixels", "413 × 531 (300 dpi)"], ["File size", fmtBytes(blob.size)]]));
        const n = document.createElement("p"); n.className = "note"; n.textContent = "The photo is centre-cropped to the passport ratio, with the crop lifted slightly so heads are not cut. Check your face is fully inside before you print or upload it."; r.appendChild(n);
        r.appendChild(dlButton(blob, outName(state.files[0], "passport-35x45mm", "jpg")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  /* ----- edit ----- */
  "image-editor": () => {
    const ed = { angle: 0, flipH: false, flipV: false };
    wireShell(async files => { try { await loadPreview(files[0]); drawPreview(); } catch (e) { showError(e.message); } });
    function filterStr() {
      const b = num("#bright", 100), c = num("#contrast", 100), s = num("#sat", 100);
      let f = "brightness(" + b + "%) contrast(" + c + "%) saturate(" + s + "%)";
      const p = val("#filter");
      if (p === "bw") f += " grayscale(100%)";
      else if (p === "sepia") f += " sepia(55%)";
      else if (p === "warm") f += " sepia(28%) saturate(115%)";
      else if (p === "cool") f += " hue-rotate(12deg) saturate(92%)";
      else if (p === "vivid") f += " saturate(135%) contrast(108%)";
      return f;
    }
    function cropRect(W, H) {
      const r = val("#cropratio");
      if (r === "free") return { x: 0, y: 0, w: W, h: H };
      const [rw, rh] = r.split(":").map(Number);
      let w = W, h = W * rh / rw;
      if (h > H) { h = H; w = H * rw / rh; }
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }
    function render(targetW) {
      const img = state.img;
      const rot = ((ed.angle % 180) + 180) % 180 !== 0;
      const SW = rot ? img.naturalHeight : img.naturalWidth;
      const SH = rot ? img.naturalWidth : img.naturalHeight;
      const base = makeCanvas(SW, SH);
      const bctx = base.getContext("2d", { willReadFrequently: true });
      bctx.translate(SW / 2, SH / 2);
      bctx.rotate(ed.angle * Math.PI / 180);
      bctx.scale(ed.flipH ? -1 : 1, ed.flipV ? -1 : 1);
      bctx.filter = filterStr();
      bctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const cr = cropRect(SW, SH);
      const out = makeCanvas(cr.w, cr.h);
      const octx = out.getContext("2d", { willReadFrequently: true });
      octx.drawImage(base, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
      const txt = val("#text").trim();
      if (txt) {
        const fs = Math.max(14, out.width * num("#textsize", 6) / 100);
        octx.font = "700 " + fs + "px Arial, sans-serif";
        octx.fillStyle = val("#textcolor") || "#ffffff";
        octx.strokeStyle = "rgba(0,0,0,.45)"; octx.lineWidth = Math.max(2, fs / 12);
        const pos = val("#textpos");
        const tw = octx.measureText(txt).width;
        const x = pos.includes("left") ? fs * 0.5 : pos.includes("right") ? out.width - tw - fs * 0.5 : (out.width - tw) / 2;
        const y = pos.startsWith("top") ? fs * 1.4 : pos.startsWith("middle") ? out.height / 2 : out.height - fs * 0.5;
        octx.strokeText(txt, x, y); octx.fillText(txt, x, y);
      }
      if (targetW && out.width > targetW) {
        const pv = makeCanvas(targetW, Math.round(out.height * targetW / out.width));
        pv.getContext("2d").drawImage(out, 0, 0, pv.width, pv.height);
        return pv;
      }
      return out;
    }
    function drawPreview() {
      if (!state.img) return;
      const stage = $("#stage");
      const pv = render(760);
      stage.width = pv.width; stage.height = pv.height;
      stage.getContext("2d").drawImage(pv, 0, 0);
    }
    ["bright", "contrast", "sat"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("input", () => { $("#" + id + "Val").textContent = el.value + "%"; drawPreview(); }); });
    ["filter", "cropratio", "textcolor", "textpos"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("change", drawPreview); });
    ["text", "textsize"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("input", drawPreview); });
    $("#rotL").addEventListener("click", () => { ed.angle -= 90; drawPreview(); });
    $("#rotR").addEventListener("click", () => { ed.angle += 90; drawPreview(); });
    $("#flipH").addEventListener("click", () => { ed.flipH = !ed.flipH; drawPreview(); });
    $("#flipV").addEventListener("click", () => { ed.flipV = !ed.flipV; drawPreview(); });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const out = render(0);
        const blob = await canvasBlob(out, "image/jpeg", 0.92);
        const r = resultBox(statsHtml([["New size", out.width + " × " + out.height], ["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(state.files[0], "edited", "jpg")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "crop-image": () => {
    let sel = null;
    wireShell(async files => {
      try {
        const img = await loadPreview(files[0]);
        sel = makeRegionSelector(freshStage(), img);
      } catch (e) { showError(e.message); }
    });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img || !sel) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const r = sel.getRect();
        const c = makeCanvas(r.w, r.h);
        c.getContext("2d").drawImage(state.img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        const f = state.files[0];
        const type = f.type === "image/png" || f.type === "image/webp" ? f.type : "image/jpeg";
        const blob = await canvasBlob(c, type, 0.92);
        const box = resultBox(statsHtml([["Cropped size", r.w + " × " + r.h], ["File size", fmtBytes(blob.size)]]));
        box.appendChild(dlButton(blob, outName(f, "cropped", mimeExt(type))));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "rotate-flip": () => {
    const st = { angle: 0, flipH: false, flipV: false };
    wireShell(async files => { try { await loadPreview(files[0]); draw(); } catch (e) { showError(e.message); } });
    function render() {
      const img = state.img;
      const rot = ((st.angle % 180) + 180) % 180 !== 0;
      const W = rot ? img.naturalHeight : img.naturalWidth, H = rot ? img.naturalWidth : img.naturalHeight;
      const c = makeCanvas(W, H), ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.translate(W / 2, H / 2); ctx.rotate(st.angle * Math.PI / 180);
      ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return c;
    }
    function draw() {
      if (!state.img) return;
      const stage = $("#stage");
      const c = render();
      const s = Math.min(760 / c.width, 520 / c.height, 1);
      stage.width = Math.round(c.width * s); stage.height = Math.round(c.height * s);
      stage.getContext("2d").drawImage(c, 0, 0, stage.width, stage.height);
    }
    $("#rotL").addEventListener("click", () => { st.angle -= 90; draw(); });
    $("#rotR").addEventListener("click", () => { st.angle += 90; draw(); });
    $("#flipH").addEventListener("click", () => { st.flipH = !st.flipH; draw(); });
    $("#flipV").addEventListener("click", () => { st.flipV = !st.flipV; draw(); });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const c = render();
        const f = state.files[0];
        const type = f.type === "image/png" || f.type === "image/webp" ? f.type : "image/jpeg";
        const blob = await canvasBlob(c, type, 0.92);
        const r = resultBox(statsHtml([["New size", c.width + " × " + c.height], ["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(f, "rotated", mimeExt(type))));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "add-watermark": () => {
    wireShell(async files => { try { await loadPreview(files[0]); } catch (e) { showError(e.message); } });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      const txt = val("#wmtext").trim();
      if (!txt) return showError("Type the watermark words first.");
      busy(btn, true);
      try {
        const img = state.img;
        const fs = Math.max(12, img.naturalWidth * num("#wmsize", 5) / 100);
        const blob = await encodeImage(img, {
          type: "image/jpeg", q: 0.92,
          drawExtra(ctx, W, H) {
            ctx.font = "700 " + fs + "px Arial, sans-serif";
            ctx.globalAlpha = num("#wmopacity", 55) / 100;
            ctx.fillStyle = val("#wmcolor") || "#ffffff";
            const tw = ctx.measureText(txt).width, m = fs * 0.6;
            const pos = val("#wmpos");
            const x = pos.includes("left") ? m : pos.includes("right") ? W - tw - m : (W - tw) / 2;
            const y = pos.startsWith("top") ? m + fs : pos.startsWith("middle") ? H / 2 : H - m;
            ctx.fillText(txt, x, y);
            ctx.globalAlpha = 1;
          }
        });
        const r = resultBox(statsHtml([["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(state.files[0], "watermarked", "jpg")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
    const o = $("#wmopacity"), ov = $("#wmopacityVal");
    if (o && ov) o.addEventListener("input", () => ov.textContent = o.value + "%");
  },

  "blur-part": () => {
    let sel = null;
    const applied = [];
    wireShell(async files => {
      try {
        const img = await loadPreview(files[0]);
        applied.length = 0;
        sel = makeRegionSelector(freshStage(), img);
        state.extra.baseCanvas = renderCanvas(img, img.naturalWidth, img.naturalHeight, {});
      } catch (e) { showError(e.message); }
    });
    $("#applyBtn").addEventListener("click", async () => {
      if (!sel || !state.img) return showError("Pick an image first.");
      const r = sel.getRect();
      const base = state.extra.baseCanvas, ctx = base.getContext("2d", { willReadFrequently: true });
      const mode = val("#mode"), strength = num("#strength", 18);
      if (mode === "pixelate") {
        const px = Math.max(6, strength);
        const tw = Math.max(1, Math.round(r.w / px)), th = Math.max(1, Math.round(r.h / px));
        const tmp = makeCanvas(tw, th);
        tmp.getContext("2d").drawImage(base, r.x, r.y, r.w, r.h, 0, 0, tw, th);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.w, r.h);
        ctx.imageSmoothingEnabled = true;
      } else {
        // blur an expanded patch and copy only the middle back, so the edges of the hidden area are fully blurred, not see-through
        const pad = strength;
        const sx = Math.max(0, r.x - pad), sy = Math.max(0, r.y - pad);
        const sw = Math.min(base.width - sx, r.w + pad * 2), sh = Math.min(base.height - sy, r.h + pad * 2);
        const tmp = makeCanvas(sw, sh);
        const tctx = tmp.getContext("2d", { willReadFrequently: true });
        tctx.filter = "blur(" + strength + "px)";
        tctx.drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh);
        ctx.drawImage(tmp, r.x - sx, r.y - sy, r.w, r.h, r.x, r.y, r.w, r.h);
      }
      applied.push(r);
      // refresh the selector with a snapshot of the updated image, so the next box is picked on what you see
      try {
        const snap = await loadImage(base.toDataURL("image/png"));
        sel = makeRegionSelector(freshStage(), snap);
      } catch (e) {}
      resultBox('<p class="saved">' + applied.length + " area" + (applied.length > 1 ? "s" : "") + ' hidden. Drag another box to hide more, or download.</p>');
    });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      if (!applied.length) return showError("Drag a box over the part to hide, then press “Hide this area” first.");
      busy(btn, true);
      try {
        const blob = await canvasBlob(state.extra.baseCanvas, "image/jpeg", 0.92);
        const r = resultBox(statsHtml([["Areas hidden", String(applied.length)], ["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(state.files[0], "hidden", "jpg")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "add-background": () => {
    wireShell(async files => { try { await loadPreview(files[0]); draw(); } catch (e) { showError(e.message); } });
    function render() {
      const img = state.img, bw = num("#border", 0);
      const c = makeCanvas(img.naturalWidth + bw * 2, img.naturalHeight + bw * 2);
      const ctx = c.getContext("2d");
      ctx.fillStyle = val("#bgc") || "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, bw, bw);
      return c;
    }
    function draw() {
      if (!state.img) return;
      const pv = $("#previewImg");
      if (pv) pv.src = render().toDataURL("image/png");
    }
    ["bgc", "border"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("input", draw); });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image first.");
      busy(btn, true);
      try {
        const c = render();
        const blob = await canvasBlob(c, "image/png");
        const r = resultBox(statsHtml([["New size", c.width + " × " + c.height], ["File size", fmtBytes(blob.size)]]));
        r.appendChild(dlButton(blob, outName(state.files[0], "background", "png")));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  /* ----- privacy & utility ----- */
  "remove-metadata": () => {
    wireShell(async files => {
      try {
        try { await loadPreview(files[0]); } catch (e) {}
        const meta = await readMetadata(files[0]);
        state.extra.meta = meta;
        const rows = metadataRows(meta, null);
        let html = '<table class="meta">' + rows.map(r => "<tr><td>" + escapeHtml(r[0]) + "</td><td>" + escapeHtml(String(r[1])) + "</td></tr>").join("") + "</table>";
        html += hasHiddenMetadata(meta)
          ? '<p class="warn">This photo carries hidden details (see above). Press the button to get a clean copy with them removed.</p>'
          : '<p class="note">We found no camera, date or GPS details hidden in this file. You can still download a freshly made clean copy.</p>';
        resultBox(html);
      } catch (e) { showError("We could not read that file. Try a different photo."); }
    });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      const f = state.files[0];
      if (!f) return showError("Pick a photo first.");
      busy(btn, true);
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        let blob, note;
        if (buf[0] === 0xFF && buf[1] === 0xD8) {
          const clean = stripJpegMetadata(buf);
          const check = parseJpegExif(clean);
          if (check.found) throw new Error("The hidden details could not be fully removed from this file. Try a different copy of the photo.");
          blob = new Blob([clean], { type: "image/jpeg" });
          note = "Done the lossless way: the photo pixels were not touched at all — only the hidden detail blocks were cut out of the file.";
        } else {
          const { img } = await fileToImage(f);
          const type = f.type === "image/webp" ? "image/webp" : "image/png";
          blob = await encodeImage(img, { type, q: 0.95 });
          note = "Done by making a fresh copy of the picture — a new file carries none of the old hidden details.";
        }
        const r = resultBox(statsHtml([["Before", fmtBytes(f.size)], ["Clean copy", fmtBytes(blob.size)]]) + '<p class="saved">Hidden details removed.</p><p class="note">' + note + "</p>");
        r.appendChild(dlButton(blob, outName(f, "clean", mimeExt(blob.type)), "Download clean copy"));
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "view-metadata": () => {
    wireShell(async files => {
      try {
        const meta = await readMetadata(files[0]);
        let dims = null;
        try { const got = await fileToImage(files[0]); dims = { w: got.img.naturalWidth, h: got.img.naturalHeight }; const pv = $("#previewImg"); if (pv) pv.src = got.url; state.img = got.img; state.url = got.url; } catch (e) {}
        const rows = metadataRows(meta, dims);
        let html = '<table class="meta">' + rows.map(r => "<tr><td>" + escapeHtml(r[0]) + "</td><td>" + escapeHtml(String(r[1])) + "</td></tr>").join("") + "</table>";
        if (meta.exif && meta.exif.gpsLat != null) html += '<p class="warn">This photo reveals exactly where it was taken. Use Remove Photo Metadata before you share it.</p>';
        else if (!hasHiddenMetadata(meta)) html += '<p class="note">No hidden camera, date or GPS details were found in this file — only the basic file facts above.</p>';
        resultBox(html);
      } catch (e) { showError("We could not read that file. Try a different photo."); }
    });
  },

  "favicon-generator": () => {
    wireShell(async files => { try { await loadPreview(files[0]); } catch (e) { showError(e.message); } });
    $("#runBtn").addEventListener("click", async e => {
      const btn = e.currentTarget;
      if (!state.img) return showError("Pick an image or logo first.");
      busy(btn, true, "Making icons…");
      try {
        const sizes = [16, 32, 48, 180, 192, 512];
        const img = state.img;
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const blobs = {};
        for (const sz of sizes) {
          const c = makeCanvas(sz, sz);
          c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, sz, sz);
          blobs[sz] = await canvasBlob(c, "image/png");
        }
        state.extra.favicons = blobs;
        const r = resultBox('<p class="saved">Your icons are ready.</p><div class="dl-list" id="favList"></div>');
        const list = $("#favList", r);
        if (s < 512) { const n = document.createElement("p"); n.className = "note"; n.textContent = "Your image is " + img.naturalWidth + " × " + img.naturalHeight + " px, so the bigger icons are enlarged copies and may look soft. For crisp icons, start from an image at least 512 × 512 px."; r.appendChild(n); }
        sizes.forEach(sz => { const b = dlButton(blobs[sz], "imagestow-favicon-" + sz + ".png", "Download " + sz + " × " + sz); b.className = "btn secondary"; list.appendChild(b); });
        const zipBtn = document.createElement("button");
        zipBtn.className = "btn"; zipBtn.textContent = "Download all as ZIP";
        zipBtn.addEventListener("click", async () => {
          busy(zipBtn, true, "Zipping…");
          try {
            await loadScriptOnce(CDN.zip);
            if (!window.JSZip) throw new Error("no zip");
            const zip = new window.JSZip();
            sizes.forEach(sz => zip.file("favicon-" + sz + ".png", blobs[sz]));
            const zb = await zip.generateAsync({ type: "blob" });
            downloadBlob(zb, "imagestow-favicons.zip");
          } catch (err) { showError("The ZIP could not be made — download the sizes one by one instead."); }
          busy(zipBtn, false);
        });
        r.appendChild(zipBtn);
      } catch (err) { showError(err.message); }
      busy(btn, false);
    });
  },

  "colour-picker": () => {
    let stage = null;
    wireShell(async files => {
      try {
        const img = await loadPreview(files[0]);
        stage = $("#stage");
        const sc = Math.min(760 / img.naturalWidth, 520 / img.naturalHeight, 1);
        stage.width = Math.round(img.naturalWidth * sc); stage.height = Math.round(img.naturalHeight * sc);
        stage.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, stage.width, stage.height);
        resultBox('<p class="note">Now click anywhere on your image to pick a colour.</p>');
      } catch (e) { showError(e.message); }
    });
    document.addEventListener("click", e => {
      if (!stage || e.target !== stage || !state.img) return;
      const r = stage.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) * (stage.width / r.width));
      const y = Math.floor((e.clientY - r.top) * (stage.height / r.height));
      const d = stage.getContext("2d", { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
      const hex = "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      const rgb = "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
      const box = resultBox('<p style="font-size:18px"><span class="swatch" style="background:' + hex + '"></span><b>' + hex + "</b> &nbsp; " + rgb + '</p><p class="note">Picked at ' + Math.round(x * state.img.naturalWidth / stage.width) + ", " + Math.round(y * state.img.naturalHeight / stage.height) + " in the full-size image.</p>");
      const cp = document.createElement("button");
      cp.className = "btn small"; cp.textContent = "Copy HEX";
      cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(hex); cp.textContent = "Copied " + hex; }
        catch (err) { cp.textContent = hex + " — copy it by hand"; }
      });
      box.appendChild(cp);
    });
  }
};
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- homepage search ---------- */
(function () {
  const input = $("#toolSearch");
  if (!input || !window.ISTOOLS) return;
  const box = $("#searchResults");
  const cards = $$(".card[data-slug]");
  function norm(s) { return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function matches(tool, q) {
    const hay = norm(tool.name + " " + tool.slug.replace(/-/g, " ") + " " + (tool.keys || ""));
    if (hay.includes(q)) return true;
    return q.split(" ").every(w => !w || hay.includes(w));
  }
  input.addEventListener("input", () => {
    const q = norm(input.value);
    let shown = 0;
    cards.forEach(c => {
      const t = window.ISTOOLS.find(x => x.slug === c.dataset.slug);
      const ok = !q || (t && matches(t, q));
      c.classList.toggle("hide", !ok);
      if (ok) shown++;
    });
    $$(".cat").forEach(cat => {
      const any = $$(".card:not(.hide)", cat).length > 0;
      cat.classList.toggle("hidden", !any);
    });
    if (box) {
      if (!q) { box.classList.add("hidden"); box.innerHTML = ""; return; }
      const hits = window.ISTOOLS.filter(t => matches(t, q)).slice(0, 6);
      const appScript = document.querySelector('script[src*="app.js"]');
      const base = appScript ? (appScript.getAttribute("src") || "").replace(/app\.js(?:\?.*)?$/, "") : "";
      box.innerHTML = hits.length ? hits.map(t => '<a href="' + base + t.slug + '/">' + t.name + "</a>").join("") : '<div class="none">No tool matches that yet. Try “compress”, “resize” or “convert”.</div>';
      box.classList.remove("hidden");
    }
  });
  document.addEventListener("click", e => { if (box && !e.target.closest(".search-wrap")) box.classList.add("hidden"); });
})();

/* ---------- init ---------- */
if (SLUG && IMPL[SLUG]) {
  try { IMPL[SLUG](); } catch (e) { showError("This tool hit a problem starting up. Reload the page and try again."); }
}

/* Test/QA surface — the same real functions the tools use. */
window.IS = {
  version: "1.0.0",
  parseJpegExif, stripJpegMetadata, readMetadata, metadataRows, hasHiddenMetadata,
  loadImage, fileToImage, encodeImage, encodeAtScale, compressToTarget, canvasBlob, makeCanvas, fmtBytes
};
