/* Gráficos da defesa (ECharts). Cada gráfico é criado quando o slide aparece
   pela primeira vez, para que a animação de entrada aconteça diante da banca. */
(function () {
  const D = window.ARGUS_DATA;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const FONT = "Inter, system-ui, sans-serif";
  const MONO = "JetBrains Mono, monospace";
  let C, axisBase, base, printMode = false;

  // Lê as cores do tema atual (claro ou escuro) a partir das variáveis CSS.
  function readTheme() {
    C = {
      text: css("--text"), muted: css("--muted"), faint: css("--faint"), line: css("--line"),
      teal: css("--teal"), blue: css("--blue"), power: css("--power"), hr: css("--hr"),
      cad: css("--cad"), alt: css("--alt"), bad: css("--bad"), anot: css("--anotacao"),
      tintAlt: css("--tint-alt"), tintTeal: css("--tint-teal"),
    };
    axisBase = {
      axisLine: { lineStyle: { color: C.line } },
      axisTick: { show: false },
      axisLabel: { color: C.muted, fontSize: 20, fontFamily: MONO },
      nameTextStyle: { color: C.muted, fontSize: 20, fontFamily: FONT },
      splitLine: { lineStyle: { color: C.line, opacity: 0.6 } },
    };
    base = {
      backgroundColor: "transparent",
      textStyle: { fontFamily: FONT, color: C.text },
      animation: !printMode,
      animationDuration: 1600,
      animationEasing: "cubicOut",
      animationDurationUpdate: 600,
      legend: { top: 0, right: 0, textStyle: { color: C.muted, fontSize: 22 }, itemWidth: 28, itemHeight: 12 },
      grid: { left: 90, right: 90, top: 70, bottom: 70 },
    };
  }
  readTheme();
  const merge = (o) => {
    const out = Object.assign({}, base, o);
    out.legend = Object.assign({}, base.legend, o.legend || {});
    // a cor da legenda vem da série: replica lineStyle.color em itemStyle
    (out.series || []).forEach((sr) => {
      const col = (sr.lineStyle && sr.lineStyle.color) || (sr.itemStyle && sr.itemStyle.color);
      if (col) sr.itemStyle = Object.assign({ color: col }, sr.itemStyle || {});
    });
    return out;
  };

  /* ---------- física: mesma bisseção de internal/service/sim/engine.go ---------- */
  function speedKmh(watts, grade, mass = 84) {
    const g = 9.81, rho = 1.225, cda = 0.32, crr = 0.005, eta = 0.96;
    const th = Math.atan(grade / 100);
    const lin = mass * g * Math.sin(th) + mass * g * Math.cos(th) * crr;
    const aero = 0.5 * rho * cda, pw = watts * eta;
    let lo = 0, hi = 40;
    for (let i = 0; i < 20 && hi - lo >= 0.01; i++) {
      const mid = (lo + hi) / 2;
      if (aero * mid ** 3 + lin * mid < pw) lo = mid; else hi = mid;
    }
    return ((lo + hi) / 2) * 3.6;
  }

  /* ---------- definições ---------- */
  // Os últimos blocos da sessão são o encerramento da gravação (picos de potência
  // ao parar); ficam fora dos gráficos.
  const G0 = D.girona, CUT = G0.km.length - 6;
  const G = Object.fromEntries(Object.entries(G0).map(([k, v]) => [k, v.slice(0, CUT)]));
  const gironaPairs = (k) => G.km.map((x, i) => [x, G[k][i]]);

  const builders = {
    // Slide 2 — gancho: a pedalada de Girona, uma camada por fragmento
    "ch-grade": (chart, step = 0, fresh = true) => {
      const L = D.leberg;
      chart.setOption(merge({
        legend: { data: ["Altitude", "Inclinação bruta", "Suavizada (±5 pts, ≤25%)"] },
        xAxis: { type: "value", min: 0, max: Math.ceil(L.total_km), interval: 5, ...axisBase, axisLabel: { ...axisBase.axisLabel, formatter: (v) => (v === 0 ? "" : v + " km"), showMaxLabel: false }, splitLine: { show: false } },
        yAxis: [
          { type: "value", name: "inclinação (%)", min: -20, max: 20, ...axisBase },
          { type: "value", name: "altitude (m)", min: 0, max: 200, ...axisBase, splitLine: { show: false } },
        ],
        series: [
          { name: "Altitude", type: "line", yAxisIndex: 1, symbol: "none", data: L.km.map((x, i) => [x, L.alt[i]]),
            lineStyle: { color: C.alt, width: 1 }, areaStyle: { color: C.tintAlt } },
          { name: "Inclinação bruta", type: "line", symbol: "none", data: step >= 1 ? L.km.map((x, i) => [x, L.raw[i]]) : [],
            lineStyle: { color: C.bad, width: 1.5, opacity: 0.75 } },
          { name: "Suavizada (±5 pts, ≤25%)", type: "line", symbol: "none", data: step >= 2 ? L.km.map((x, i) => [x, L.smooth[i]]) : [],
            lineStyle: { color: C.teal, width: 3.5 } },
        ],
      }), { notMerge: fresh });
    },

    // Slide 10 — velocidade de equilíbrio x inclinação, 200 W
    "ch-speed": (chart, step = 0, fresh = true) => {
      const grades = []; for (let g = -6; g <= 15; g += 0.5) grades.push(g);
      chart.setOption(merge({
        legend: { show: false },
        grid: { left: 100, right: 40, top: 40, bottom: 80 },
        xAxis: { type: "value", min: -6, max: 15, interval: 3, name: "inclinação (%)", nameLocation: "middle", nameGap: 46, ...axisBase },
        yAxis: { type: "value", min: 0, max: 70, name: "km/h", ...axisBase },
        series: [
          { type: "line", symbol: "none", smooth: true, data: grades.map((g) => [g, +speedKmh(200, g).toFixed(1)]),
            lineStyle: { color: C.teal, width: 4 }, areaStyle: { color: C.tintTeal },
            markPoint: { symbol: "circle", symbolSize: 14, itemStyle: { color: C.power },
              label: { color: C.text, fontFamily: MONO, fontSize: 20, position: "top", formatter: (p) => p.value + " km/h" },
              data: [0, 6, 12].map((g) => ({ coord: [g, +speedKmh(200, g).toFixed(1)], value: speedKmh(200, g).toFixed(1) })) } },
        ],
      }), { notMerge: fresh });
    },

    // Slide 11 — média x NP e as duas metades do desacoplamento
    "ch-physio": (chart, step = 0, fresh = true) => {
      const t = G.km.map((_, i) => +(i * 0.25).toFixed(2)); // blocos de 15 s -> minutos
      const end = t[t.length - 1];
      const mid = 10 + (end - 10) / 2;
      chart.setOption(merge({
        legend: { data: ["Potência", "FC"] },
        xAxis: { type: "value", min: 0, max: Math.ceil(end), name: "minutos", nameLocation: "middle", nameGap: 44, ...axisBase, splitLine: { show: false } },
        yAxis: [
          { type: "value", name: "W", min: 0, max: 200, ...axisBase },
          { type: "value", name: "bpm", min: 60, max: 180, ...axisBase, splitLine: { show: false } },
        ],
        series: [
          { name: "Potência", type: "line", symbol: "none", data: t.map((x, i) => [x, G.power[i]]),
            lineStyle: { color: C.power, width: 2.5 },
            markLine: { symbol: "none", label: { fontFamily: MONO, fontSize: 20, color: C.text, position: "insideEndTop" },
              data: [
                { yAxis: 96, lineStyle: { color: C.muted, type: "dashed", width: 2 }, label: { formatter: "média 96 W" } },
                ...(step >= 1 ? [{ yAxis: 106, lineStyle: { color: C.power, type: "solid", width: 3 }, label: { formatter: "NP 106 W", position: "insideStartTop" } }] : []),
              ] },
            markArea: { silent: true, itemStyle: { color: "rgba(127,127,127,0.10)" },
              label: { color: C.muted, fontSize: 20, fontFamily: FONT, position: "insideBottom", distance: 14 },
              data: step < 2 ? [] : [
                [{ xAxis: 0, name: "descarte" }, { xAxis: 10 }],
                [{ xAxis: 10, name: "1ª metade", itemStyle: { color: "rgba(91,141,239,0.08)" } }, { xAxis: mid }],
                [{ xAxis: mid, name: "2ª metade", itemStyle: { color: "rgba(239,79,95,0.08)" } }, { xAxis: end }],
              ] } },
          { name: "FC", type: "line", yAxisIndex: 1, symbol: "none", connectNulls: true,
            data: t.map((x, i) => [x, G.hr[i]]), lineStyle: { color: C.hr, width: 2.5 } },
        ],
      }), { notMerge: fresh });
    },

    // Slide 12 — PMC real
    "ch-pmc": (chart, step = 0, fresh = true) => {
      const P = D.pmc;
      chart.setOption(merge({
        legend: { data: ["TSS diário", "CTL (42 d)", "ATL (7 d)", "TSB"] },
        xAxis: { type: "category", data: P.data, ...axisBase, axisLabel: { ...axisBase.axisLabel,
          formatter: (v) => ({ "03": "mar", "04": "abr", "05": "mai", "06": "jun", "07": "jul", "08": "ago", "09": "set", "10": "out" })[v.slice(5, 7)],
          interval: (i, v) => v.endsWith("-01") } },
        yAxis: { type: "value", min: -40, max: 120, ...axisBase },
        series: [
          { name: "TSS diário", type: "bar", data: P.tss, itemStyle: { color: C.tintAlt }, barWidth: 2 },
          { name: "CTL (42 d)", type: "line", symbol: "none", data: P.ctl, lineStyle: { color: C.blue, width: 3.5 }, itemStyle: { color: C.blue } },
          { name: "ATL (7 d)", type: "line", symbol: "none", data: P.atl, lineStyle: { color: C.hr, width: 2.5 }, itemStyle: { color: C.hr } },
          { name: "TSB", type: "line", symbol: "none", data: P.tsb, lineStyle: { color: C.power, width: 2, type: "dashed" }, itemStyle: { color: C.power } },
        ],
      }), { notMerge: fresh });
    },
  };

  /* ---------- ciclo de vida ligado ao Reveal ---------- */
  const charts = {};
  function ensure(el) {
    const id = el.id;
    if (!builders[id]) return null;
    if (!charts[id]) charts[id] = echarts.init(el, null, { renderer: "svg" });
    return charts[id];
  }
  function buildIn(slide, step = 0) {
    slide.querySelectorAll(".chart[id]").forEach((el) => {
      const c = ensure(el);
      if (c) { c.clear(); builders[el.id](c, step, true); }
    });
  }
  function stepOf(slide) {
    // o passo é o maior data-chart-step entre os fragmentos já visíveis
    let step = 0;
    slide.querySelectorAll(".fragment.visible[data-chart-step]").forEach((el) => {
      step = Math.max(step, Number(el.dataset.chartStep) || 0);
    });
    return step;
  }

  window.ArgusCharts = {
    onSlide(slide) { buildIn(slide, stepOf(slide)); },
    onFragment(slide) {
      slide.querySelectorAll(".chart[id]").forEach((el) => {
        // sem notMerge: só a camada nova anima; a linha de potência não é redesenhada
        if (el.dataset.stepped && charts[el.id]) builders[el.id](charts[el.id], stepOf(slide), false);
      });
    },
    retheme() { // troca de tema: relê as cores e redesenha o slide atual
      readTheme();
      Object.keys(charts).forEach((id) => { charts[id].dispose(); delete charts[id]; });
    },
    buildAll() { // modo PDF: tudo de uma vez, no estado final e sem animação
      printMode = true; readTheme();
      document.querySelectorAll(".chart[id]").forEach((el) => { const c = ensure(el); if (c) builders[el.id](c, 99, true); });
    },
    speedKmh,
  };
})();
