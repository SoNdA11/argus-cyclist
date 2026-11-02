/* Galeria das funcionalidades: clique numa imagem para ampliar; ← → passam,
   Esc ou clique fora fecham. Enquanto aberta, o teclado do Reveal fica pausado. */
(function () {
  const lb = document.getElementById("lightbox");
  if (!lb) return;
  const img = lb.querySelector("img");
  const cap = lb.querySelector("figcaption");
  let itens = [], atual = 0;

  function mostrar(i) {
    atual = (i + itens.length) % itens.length;
    const fig = itens[atual];
    const b = fig.querySelector("figcaption b");
    img.src = fig.dataset.full;
    img.alt = b ? b.textContent : "";
    cap.innerHTML = "";
    if (b) {
      cap.append(b.textContent);
      const sub = document.createElement("span");
      sub.textContent = fig.querySelector("figcaption").textContent.replace(b.textContent, "").trim() + `  ·  ${atual + 1} / ${itens.length}`;
      cap.append(sub);
    }
  }
  function abrir(fig) {
    itens = Array.from(fig.closest(".galeria").querySelectorAll("figure[data-full]"));
    mostrar(itens.indexOf(fig));
    lb.classList.add("aberto");
    lb.setAttribute("aria-hidden", "false");
    Reveal.configure({ keyboard: false });
  }
  function fechar() {
    lb.classList.remove("aberto");
    lb.setAttribute("aria-hidden", "true");
    Reveal.configure({ keyboard: true });
  }

  document.querySelectorAll(".galeria figure[data-full]").forEach((fig) =>
    fig.addEventListener("click", (e) => { e.stopPropagation(); abrir(fig); }));
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target === lb.querySelector("figure")) fechar(); });
  lb.querySelector(".lb-close").addEventListener("click", fechar);
  lb.querySelector(".lb-prev").addEventListener("click", (e) => { e.stopPropagation(); mostrar(atual - 1); });
  lb.querySelector(".lb-next").addEventListener("click", (e) => { e.stopPropagation(); mostrar(atual + 1); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("aberto")) return;
    if (e.key === "Escape") fechar();
    else if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) mostrar(atual + 1);
    else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) mostrar(atual - 1);
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  Reveal.on("slidechanged", fechar);
})();
