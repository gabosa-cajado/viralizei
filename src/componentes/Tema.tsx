import { useEffect, useState } from "react";

// Claro, escuro ou automático (segue o aparelho, ou o tema do claude.ai no
// artefato). A escolha é conveniência de cada um e fica no navegador.

type Tema = "auto" | "claro" | "escuro";
const CHAVE = "pauta:tema";
const ORDEM: Tema[] = ["auto", "claro", "escuro"];
const NOMES: Record<Tema, string> = { auto: "Automático", claro: "Claro", escuro: "Escuro" };

// O que o claude.ai já tinha posto na página antes de qualquer escolha.
const temaOriginal = document.documentElement.getAttribute("data-theme");

function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "claro" || t === "escuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "claro") raiz.setAttribute("data-theme", "light");
  else if (tema === "escuro") raiz.setAttribute("data-theme", "dark");
  else if (temaOriginal) raiz.setAttribute("data-theme", temaOriginal);
  else raiz.removeAttribute("data-theme");
}

aplicar(lerTema());

export function BotaoTema() {
  const [tema, setTema] = useState<Tema>(lerTema);

  useEffect(() => {
    aplicar(tema);
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
  }, [tema]);

  const seguinte = ORDEM[(ORDEM.indexOf(tema) + 1) % ORDEM.length];
  return (
    <button
      type="button"
      className="botao-tema"
      onClick={() => setTema(seguinte)}
      aria-label={`Tema: ${NOMES[tema]}. Mudar para ${NOMES[seguinte].toLowerCase()}`}
      title={`Mudar para ${NOMES[seguinte].toLowerCase()}`}
    >
      <span className={`tema-icone tema-${tema}`} aria-hidden="true" />
      <span className="tema-nome">{NOMES[tema]}</span>
    </button>
  );
}
