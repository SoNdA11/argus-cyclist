// Converte guia/GUIA-DE-ESTUDO.html (gerado pelo pandoc) em PDF com o Chromium do Playwright.
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "guia");
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue() : r.abort()));
await p.goto(pathToFileURL(path.join(dir, "GUIA-DE-ESTUDO.html")).href, { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: path.join(dir, "GUIA-DE-ESTUDO.pdf"), format: "A4", printBackground: true,
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#7d8ca6">Argus Cyclist · guia de estudo · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" } });
await b.close();
console.log("guia/GUIA-DE-ESTUDO.pdf gerado");
