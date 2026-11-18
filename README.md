# ImageStow — Free Image Tools, Private by Design

**Live:** https://imagestow.safwan.digital/

ImageStow is a complete image toolkit in the spirit of the classic online image suites — rebuilt with a clean, modern interface (light + dark mode) and one big difference:

> 🔒 **100% client-side. Your files are never uploaded — everything runs in your browser.** No login, no storage — processing happens entirely on your device. (The honest details are on the site's Privacy page, `/privacy/`.)

## ✨ 25 working tools

**Convert:** JPG to PNG · PNG to JPG · JPG to WebP · PNG to WebP · WebP to JPG · WebP to PNG · HEIC to JPG · SVG to PNG · Images to PDF
**Compress & Resize:** Compress Image · Compress to a Target Size (200 KB / 100 KB / 50 KB / custom) · Bulk Compress (ZIP) · Resize Image · Resize for Social Media · Passport Photo Size
**Edit:** Image Editor · Crop · Rotate & Flip · Add Watermark · Blur / Pixelate Part of an Image · Add Border / Background
**Privacy & Utility:** Remove Photo Metadata (EXIF/GPS) · View Photo Metadata · Favicon Generator · Colour Picker from Image

No mock tools: every card in the app runs a real operation. Honest limits are labelled on the tool itself (see `BUILD-REPORT` notes in the project plan — e.g. some HEIC variants cannot be decoded in a browser, and compress-to-size reports honestly when a target cannot be reached).

## 🛠 Tech

Plain `index.html` + `app.js` + `styles.css` per tool page, generated from `build/tools-data.js` by `node build/generate.js` — no build step needed to run the site. Image processing uses the native Canvas API. Pinned CDN libraries, loaded lazily only on the tools that need them: heic2any (HEIC decode), pdf-lib (Images to PDF), JSZip (bulk downloads).

## 🚀 Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## 🔐 Privacy

Files are processed in-memory in your browser tab and discarded when you close it. ImageStow has no backend and makes no upload requests with your images.

## 📄 License

MIT © Safwan Digital
