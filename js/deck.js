/* Inicialização do Reveal e ganchos de rodapé e gráficos. */
(function () {
  const printing = /print-pdf/i.test(window.location.search);

  // Tema: claro por padrão; ?tema=escuro ou a tecla T alternam (lembrado no navegador).
  const root = document.documentElement;
  function storedTheme() { try { return localStorage.getItem("argus-tema"); } catch (e) { return null; } }
  function setTheme(t) {
    if (t === "escuro") root.setAttribute("data-tema", "escuro"); else root.removeAttribute("data-tema");
    try { localStorage.setItem("argus-tema", t); } catch (e) { /* armazenamento indisponível */ }
  }
  const qs = new URLSearchParams(window.location.search).get("tema");
  setTheme(qs || (printing ? "claro" : storedTheme()) || "claro");
  window.ArgusCharts.retheme(); // charts.js leu as cores antes de o tema ser aplicado

  Reveal.initialize({
    width: 1920,
    height: 1080,
    margin: 0,
    minScale: 0.2,
    maxScale: 2.0,
    center: false,
    hash: true,
    controls: false,
    progress: true,
    slideNumber: false,
    transition: "fade",
    transitionSpeed: "fast",
    backgroundTransition: "none",
    // ?print-pdf gera uma página por clique (fragmento): espelha a apresentação
    pdfSeparateFragments: true,
    // ritmo do ensaio: cada slide tem data-timing (s); a visão do apresentador (S)
    // compara o tempo decorrido com o planejado
    defaultTiming: 60,
    plugins: [RevealNotes],
  });

  Reveal.addKeyBinding({ keyCode: 84, key: "T", description: "Alternar tema claro/escuro" }, () => {
    setTheme(root.getAttribute("data-tema") === "escuro" ? "claro" : "escuro");
    window.ArgusCharts.retheme();
    window.ArgusCharts.onSlide(Reveal.getCurrentSlide());
  });

  const footer = document.querySelector(".deck-footer");
  const footNum = document.getElementById("footer-num");
  const total = document.querySelectorAll(".reveal .slides > section").length;

  function update(ev) {
    const slide = ev.currentSlide;
    footNum.textContent = `${Reveal.getIndices(slide).h + 1} / ${total}`;
    // capa e agradecimentos sem rodapé
    const bare = Reveal.getIndices(slide).h === 0 || slide.classList.contains("thanks");
    footer.style.visibility = bare ? "hidden" : "visible";
    window.ArgusCharts.onSlide(slide);
  }

  Reveal.on("ready", (ev) => {
    if (printing) { window.ArgusCharts.buildAll(); return; }
    update(ev);
  });
  Reveal.on("slidechanged", update);
  Reveal.on("fragmentshown", () => window.ArgusCharts.onFragment(Reveal.getCurrentSlide()));
  Reveal.on("fragmenthidden", () => window.ArgusCharts.onFragment(Reveal.getCurrentSlide()));
  window.addEventListener("resize", () => {
    document.querySelectorAll(".chart[id]").forEach((el) => {
      const c = echarts.getInstanceByDom(el); if (c) c.resize();
    });
  });
})();
