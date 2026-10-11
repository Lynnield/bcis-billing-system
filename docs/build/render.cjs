// Renders the spec 9 deliverables from their Markdown/Mermaid sources:
//   docs/erd.mmd                      -> docs/erd.png, docs/erd.pdf
//   docs/*.md, tests/acceptance-...md -> matching .pdf files
// Runs inside Electron (see run.cjs) so it needs no other PDF tooling.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { marked } = require("marked");

const ROOT = path.resolve(__dirname, "..", "..");
const MERMAID = path.join(__dirname, "node_modules", "mermaid", "dist", "mermaid.min.js");
const DOCS = [
  ["docs/technical-documentation.md", "Technical Documentation", "D3"],
  ["docs/user-manual.md", "User Manual", "D4"],
  ["docs/deployment-guide.md", "Deployment Guide", "D2 / D3"],
  ["tests/acceptance-test-report.md", "Acceptance Test Report", "D5"],
];

const CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  :root { --navy: #0f2747; --accent: #1f6feb; --line: #d6dde8; --muted: #5b6678; }
  body { font: 10.5pt/1.5 "Segoe UI", Arial, sans-serif; color: #1b2330; margin: 0; }
  .cover { border-bottom: 3px solid var(--navy); padding-bottom: 10px; margin-bottom: 18px; }
  .cover .sys { color: var(--muted); font-size: 9.5pt; letter-spacing: .04em; text-transform: uppercase; }
  .cover .meta { color: var(--muted); font-size: 9pt; margin-top: 4px; }
  h1 { color: var(--navy); font-size: 22pt; margin: 4px 0 0; }
  h2 { color: var(--navy); font-size: 14pt; margin: 22px 0 8px; padding-bottom: 3px; border-bottom: 1px solid var(--line); break-after: avoid; }
  h3 { color: var(--navy); font-size: 11.5pt; margin: 16px 0 6px; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  a { color: var(--accent); text-decoration: none; }
  code { font: 9pt Consolas, "Cascadia Mono", monospace; background: #f1f4f9; padding: 0 3px; border-radius: 3px; overflow-wrap: break-word; }
  pre { background: #f1f4f9; border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; white-space: pre-wrap; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: var(--navy); color: #fff; text-align: left; font-weight: 600; }
  th, td { border: 1px solid var(--line); padding: 4px 6px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f7f9fc; }
  img { max-width: 100%; border: 1px solid var(--line); }
  blockquote { margin: 8px 0; padding: 4px 12px; border-left: 3px solid var(--accent); color: var(--muted); }
`;

function htmlPage(title, body, baseDir) {
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(baseDir + path.sep).href}">
<title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

async function loadHtml(win, html) {
  const file = path.join(os.tmpdir(), `bcis-doc-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(file, html);
  try {
    await win.loadFile(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function renderErd() {
  const src = fs.readFileSync(path.join(ROOT, "docs", "erd.mmd"), "utf8");
  const win = new BrowserWindow({ show: false, width: 1600, height: 1200, webPreferences: { offscreen: true } });
  await loadHtml(
    win,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}#out{padding:24px;display:inline-block}</style></head>
     <body><div id="out"></div><script src="${pathToFileURL(MERMAID).href}"></script></body></html>`,
  );
  const size = await win.webContents.executeJavaScript(`(async () => {
    mermaid.initialize({ startOnLoad: false, theme: "neutral", er: { useMaxWidth: false } });
    const { svg } = await mermaid.render("erd", ${JSON.stringify(src)});
    const out = document.getElementById("out");
    out.innerHTML = svg;
    const r = out.getBoundingClientRect();
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
  })()`);
  win.setContentSize(size.w, size.h);
  await new Promise((r) => setTimeout(r, 500));
  const png = await win.webContents.capturePage({ x: 0, y: 0, width: size.w, height: size.h });
  fs.writeFileSync(path.join(ROOT, "docs", "erd.png"), png.toPNG());
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: { width: size.w / 96 + 0.1, height: size.h / 96 + 0.1 },
    margins: { marginType: "none" },
  });
  fs.writeFileSync(path.join(ROOT, "docs", "erd.pdf"), pdf);
  win.destroy();
  console.log(`docs/erd.png + docs/erd.pdf (${size.w}x${size.h})`);
}

async function renderDoc([rel, title, deliverable]) {
  const srcPath = path.join(ROOT, rel);
  const md = fs.readFileSync(srcPath, "utf8").replace(/^# .*\r?\n/, "");
  const generated = new Date().toISOString().slice(0, 10);
  const cover = `<div class="cover"><div class="sys">BCIS Subscription Billing and Collection System · ${deliverable}</div>
    <h1>${title}</h1><div class="meta">Generated ${generated} from <code>${rel}</code></div></div>`;
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await loadHtml(win, htmlPage(title, cover + marked.parse(md, { gfm: true }), path.dirname(srcPath)));
  await win.webContents.executeJavaScript(
    "Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))",
  );
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="font:8pt Segoe UI,Arial;color:#5b6678;width:100%;padding:0 16mm;display:flex;justify-content:space-between">
      <span>BCIS — ${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  const out = srcPath.replace(/\.md$/, ".pdf");
  fs.writeFileSync(out, pdf);
  win.destroy();
  console.log(`${path.relative(ROOT, out)} (${Math.round(pdf.length / 1024)} KB)`);
}

app.disableHardwareAcceleration();
// Windows are created and destroyed one at a time; do not quit in between.
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    await renderErd();
    for (const doc of DOCS) await renderDoc(doc);
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
