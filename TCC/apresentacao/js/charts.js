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
      tintBlue: css("--tint-blue"), tintNeutral: css("--tint-neutral"), tintPower: css("--tint-power"), calc: css("--calculado"), bg2: css("--bg-2"),
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

    // Slide 11: dois painéis com o mesmo eixo de tempo (potência em cima, FC embaixo),
    // sem eixo duplo. Média = medido (neutro); NP = calculado (azul dos selos).
    "ch-physio": (chart, step = 0, fresh = true) => {
      const t = G.km.map((_, i) => +(i * 0.25).toFixed(2)); // blocos de 15 s -> minutos
      const end = t[t.length - 1];
      const mid = 10 + (end - 10) / 2;
      const L = 100, R = 150; // margens: rótulos das linhas ficam à direita, fora dos dados
      const xBase = (gi, show) => ({ type: "value", gridIndex: gi, min: 0, max: Math.ceil(end), interval: 10, ...axisBase,
        axisLabel: { ...axisBase.axisLabel, show }, splitLine: { show: false },
        name: show ? "minutos" : "", nameLocation: "middle", nameGap: 44 });
      const panelTitle = (top, text, color) => ({ left: L - 2, top, text: "{m|━} " + text,
        textStyle: { color: C.text, fontSize: 24, fontWeight: 600, fontFamily: FONT, rich: { m: { color, fontSize: 24 } } } });
      const faixas = step < 2 ? [] : [
        [{ xAxis: 0, name: "descarte", itemStyle: { color: C.tintNeutral } }, { xAxis: 10 }],
        [{ xAxis: 10, name: "1ª metade", itemStyle: { color: "transparent" } }, { xAxis: mid }],
        [{ xAxis: mid, name: "2ª metade · Pw:FC −8,3%", itemStyle: { color: C.tintBlue } }, { xAxis: end }],
      ];
      const faixasSemRotulo = faixas.map(([a, b]) => [{ ...a, name: "" }, b]);
      chart.setOption(merge({
        legend: { show: false },
        title: [panelTitle(0, "Potência (W)", C.power), panelTitle(372, "Frequência cardíaca (bpm)", C.hr)],
        grid: [
          { left: L, right: R, top: 50, height: 270 },
          { left: L, right: R, top: 422, height: 210 },
        ],
        tooltip: { trigger: "axis", backgroundColor: C.bg2, borderColor: C.line, textStyle: { color: C.text, fontFamily: MONO, fontSize: 18 },
          axisPointer: { type: "line", lineStyle: { color: C.faint } },
          valueFormatter: (v) => (v == null ? "–" : Math.round(v)) },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        xAxis: [xBase(0, false), xBase(1, true)],
        yAxis: [
          { type: "value", gridIndex: 0, min: 0, max: 150, interval: 50, ...axisBase },
          { type: "value", gridIndex: 1, min: 60, max: 180, interval: 40, ...axisBase, axisLabel: { ...axisBase.axisLabel, showMinLabel: false } },
        ],
        series: [
          { name: "Potência", type: "line", xAxisIndex: 0, yAxisIndex: 0, symbol: "none", data: t.map((x, i) => [x, G.power[i]]),
            lineStyle: { color: C.power, width: 2 },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: C.tintPower }, { offset: 1, color: "rgba(0,0,0,0)" }] } },
            markLine: { symbol: "none", silent: true, label: { fontFamily: MONO, fontSize: 20, color: C.text, position: "end", distance: 12 },
              data: [
                { yAxis: 96, lineStyle: { color: C.muted, type: "dashed", width: 2 }, label: { formatter: "média 96", color: C.muted, offset: [0, 12] } },
                ...(step >= 1 ? [{ yAxis: 106, lineStyle: { color: C.calc, type: "solid", width: 3 }, label: { formatter: "NP 106", color: C.calc, fontWeight: 700, offset: [0, -12] } }] : []),
              ] },
            markArea: { silent: true, label: { color: C.muted, fontSize: 20, fontFamily: FONT, position: "insideTop", distance: 8 }, data: faixas } },
          { name: "FC", type: "line", xAxisIndex: 1, yAxisIndex: 1, symbol: "none", connectNulls: true,
            data: t.map((x, i) => [x, G.hr[i]]), lineStyle: { color: C.hr, width: 2 },
            markLine: { symbol: "none", silent: true, label: { fontFamily: MONO, fontSize: 20, color: C.muted, position: "end", distance: 12, formatter: "média 139" },
              data: [{ yAxis: 139, lineStyle: { color: C.muted, type: "dashed", width: 2 } }] },
            markArea: { silent: true, label: { show: false }, data: faixasSemRotulo } },
        ],
      }), { notMerge: fresh });
    },

    // Metodologia: construção (commits) e avaliação (sessões) por semana, dois painéis
    "ch-dsr": (chart, step = 0, fresh = true) => {
      const W = D.dsr, show = step >= 1 || printMode;
      const MES = { "01": "jan", "02": "fev", "03": "mar", "04": "abr", "05": "mai", "06": "jun", "07": "jul", "08": "ago", "09": "set", "10": "out" };
      let ultimo = "";
      const rotulo = W.semana.map((d) => { const m = d.slice(5, 7); if (m === ultimo) return ""; ultimo = m; return MES[m]; });
      const L = 110, R = 40;
      const x = (gi, labels) => ({ type: "category", gridIndex: gi, data: W.semana, ...axisBase,
        axisLabel: { ...axisBase.axisLabel, show: labels, interval: 0, formatter: (_, i) => rotulo[i] }, axisTick: { show: false } });
      const marco = (dia, texto) => {
        const i = W.semana.findIndex((s, k) => s <= dia && (k === W.semana.length - 1 || W.semana[k + 1] > dia));
        return { xAxis: W.semana[i], label: { formatter: texto } };
      };
      const titulo = (top, text, color) => ({ left: L - 4, top, text: "{m|■} " + text,
        textStyle: { color: C.text, fontSize: 22, fontWeight: 600, fontFamily: FONT, rich: { m: { color, fontSize: 20 } } } });
      chart.setOption(merge({
        legend: { show: false },
        title: [titulo(0, `Construção · commits por semana (${W.total_commits})`, C.blue),
                titulo(250, `Avaliação · sessões de treino por semana (${W.total_sessoes})`, C.teal)],
        grid: [{ left: L, right: R, top: 70, height: 150 }, { left: L, right: R, top: 300, height: 90 }],
        tooltip: { trigger: "axis", backgroundColor: C.bg2, borderColor: C.line, textStyle: { color: C.text, fontFamily: MONO, fontSize: 18 } },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        xAxis: [x(0, false), x(1, true)],
        yAxis: [
          { type: "value", gridIndex: 0, max: 32, interval: 15, ...axisBase },
          { type: "value", gridIndex: 1, max: 8, interval: 4, ...axisBase },
        ],
        series: [
          { name: "commits", type: "bar", xAxisIndex: 0, yAxisIndex: 0, data: show ? W.commits : W.commits.map(() => 0),
            itemStyle: { color: C.blue, borderRadius: [4, 4, 0, 0] }, barCategoryGap: "25%",
            markLine: { symbol: "none", silent: true, lineStyle: { color: C.faint, type: "dashed", width: 1.5 },
              label: { position: "end", color: C.text, fontFamily: FONT, fontSize: 19, fontWeight: 600 },
              data: [marco("2026-01-20", "INPI"), marco("2026-03-08", "Android"), marco("2026-05-27", "IA local")] } },
          { name: "sessões", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: show ? W.sessoes : W.sessoes.map(() => 0),
            itemStyle: { color: C.teal, borderRadius: [4, 4, 0, 0] }, barCategoryGap: "25%" },
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
