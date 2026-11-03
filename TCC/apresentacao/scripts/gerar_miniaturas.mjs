// Miniaturas do guia de estudo: um JPG por slide, com todos os cliques já dados.
// Uso (em TCC/apresentacao):  node scripts/gerar_miniaturas.mjs
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(dir, "guia", "img");
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route("**/*", (r) => (r.request().url().startsWith("file://") ? r.continue() : r.abort()));
await page.goto(pathToFileURL(path.join(dir, "index.html")).href + "?tema=claro");
await page.waitForFunction(() => window.Reveal && Reveal.isReady() && document.fonts.status === "loaded");
const total = await page.evaluate(() => Reveal.getTotalSlides());
for (let h = 0; h < total; h++) {
  // slide com o impostor (Bluetooth): guarda também o estado antes do desfoque
  if (await page.evaluate((h) => !!Reveal.getSlide(h).querySelector(".spoof"), h)) {
    await page.evaluate((h) => { Reveal.slide(h, 0); while (Reveal.nextFragment()); Reveal.prevFragment(); }, h);
    await page.waitForTimeout(2800);
    await page.screenshot({ path: path.join(out, `slide-${String(h + 1).padStart(2, "0")}-antes.jpg`), type: "jpeg", quality: 82 });
  }
  await page.evaluate((h) => { Reveal.slide(h, 0); while (Reveal.nextFragment()); }, h);
  // slides com entrada automática (sem cliques): espera todos os itens aparecerem
  await page.waitForFunction((h) => { const s = Reveal.getSlide(h);
    return [...s.querySelectorAll(".auto-reveal .auto, .auto-reveal.auto")].every((el) => el.classList.contains("visible")); }, h, { timeout: 20000 });
  await page.waitForTimeout(2800); // animações de entrada e gráficos
  const nome = `slide-${String(h + 1).padStart(2, "0")}.jpg`;
  await page.screenshot({ path: path.join(out, nome), type: "jpeg", quality: 82 });
  console.log(nome);
}
await browser.close();
