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
    // nos slides com entrada automática, as teclas de navegação pulam os fragmentos:
    // o teclado só troca de slide (as demais teclas seguem o padrão do Reveal)
    keyboard: (window.ArgusTeclado = {
      39: (e) => (e.shiftKey ? Reveal.slide(Number.MAX_VALUE) : Reveal.right({ skipFragments: pular(e) })), // →
      37: (e) => (e.shiftKey ? Reveal.slide(0) : Reveal.left({ skipFragments: pular(e) })),                 // ←
      32: (e) => (Reveal.isOverview() ? Reveal.toggleOverview() : e.shiftKey ? Reveal.prev({ skipFragments: pular(e) }) : Reveal.next({ skipFragments: pular(e) })), // espaço
      34: (e) => Reveal.next({ skipFragments: pular(e) }), 78: (e) => Reveal.next({ skipFragments: pular(e) }), // PgDn, N
      33: (e) => Reveal.prev({ skipFragments: pular(e) }), 80: (e) => Reveal.prev({ skipFragments: pular(e) }), // PgUp, P
    }), // guardado em window.ArgusTeclado: a galeria desliga o teclado ao abrir e o devolve ao fechar
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

  function ehAuto(slide) { return !!slide && (slide.hasAttribute("data-auto-fragmentos") || slide.classList.contains("auto-reveal")); }
  function pular(e) { return (e && e.altKey) || ehAuto(Reveal.getCurrentSlide()); }

  // Entrada automática por fragmentos (slides 4, 5, 6, 7, 8 e 11): ao entrar, esconde
  // todos os fragmentos e os mostra sozinhos, um passo a cada data-auto-fragmentos ms.
  let fragTimer = null;
  function autoFragmentos(slide) {
    clearTimeout(fragTimer);
    if (!slide.hasAttribute("data-auto-fragmentos")) return;
    const passo = Number(slide.dataset.autoFragmentos) || 1400;
    Reveal.navigateFragment(-1); // ao voltar de um slide seguinte, recomeça do zero
    const proximo = () => {
      if (Reveal.getCurrentSlide() !== slide) return;
      if (Reveal.nextFragment()) fragTimer = setTimeout(proximo, passo);
    };
    fragTimer = setTimeout(proximo, 400);
  }

  // Entrada automática (slide 12): os itens .auto aparecem um por um, em ordem de
  // data-ordem, a cada data-intervalo ms; o teclado só troca de slide.
  let autoTimers = [];
  function autoReveal(slide) {
    autoTimers.forEach(clearTimeout); autoTimers = [];
    document.querySelectorAll(".auto-reveal .auto.visible").forEach((el) => el.classList.remove("visible"));
    if (!slide.classList.contains("auto-reveal")) return;
    const passo = Number(slide.dataset.intervalo) || 1100;
    const itens = [...slide.querySelectorAll(".auto")].sort((a, b) => a.dataset.ordem - b.dataset.ordem);
    itens.forEach((el, i) => autoTimers.push(setTimeout(() => {
      el.classList.add("visible");
      if (el.dataset.chartStep) window.ArgusCharts.onFragment(slide);
    }, 350 + i * passo)));
  }

  function update(ev) {
    const slide = ev.currentSlide;
    autoReveal(slide);
    if (!printing) autoFragmentos(slide);
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
