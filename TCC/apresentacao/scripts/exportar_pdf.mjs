// Gera o PDF de contingência (uma página por clique) a partir do deck, offline.
// Uso (em TCC/apresentacao):  npm install  &&  npm run pdf
// Usa o Chromium do Playwright já instalado ou o indicado em $CHROME.
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(dir, "argus-cyclist-defesa.pdf");
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
// garante que nada depende de rede
await page.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue() : r.abort()));
await page.goto(pathToFileURL(path.join(dir, "index.html")).href + "?print-pdf");
await page.waitForFunction(() => document.querySelectorAll(".pdf-page").length > 10 && document.fonts.status === "loaded");
await page.waitForTimeout(1500); // gráficos (sem animação no modo PDF)
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log("PDF gerado:", path.relative(process.cwd(), out));
