/* Inicialização do Reveal e ganchos de rodapé e gráficos. */
(function () {
  const printing = /print-pdf/i.test(window.location.search);

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
    plugins: [RevealNotes],
  });

  const footSection = document.getElementById("footer-section");
  const footNum = document.getElementById("footer-num");
  const mainCount = document.querySelectorAll(".reveal .slides > section:not([data-section='Apêndice'])").length;

  function sectionOf(slide) {
    let s = slide;
    while (s && !s.dataset.section) s = s.parentElement && s.parentElement.closest("section");
    return s ? s.dataset.section : "";
  }

  function update(ev) {
    const slide = ev.currentSlide;
    const name = sectionOf(slide);
    footSection.textContent = name.toUpperCase();
    const h = Reveal.getIndices(slide).h + 1;
    footNum.textContent = name === "Apêndice" ? "A" : `${h} / ${mainCount}`;
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
