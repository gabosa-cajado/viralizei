import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Referencia } from "../dados/referencia";

// O player do Instagram tem um cabeçalho de 54px (perfil e "View profile") e a
// mídia num retângulo 4:5; logo abaixo vem o rodapé (curtidas, legenda). Uma
// caixa com altura = 54px + 125% da largura corta exatamente no fim do vídeo.
export const CABECALHO_INSTAGRAM = 54;
export const MIDIA_INSTAGRAM = 5 / 4;

/** O vídeo do Instagram, TikTok ou YouTube embutido na página. */
export function QuadroVideo({ referencia, titulo }: { referencia: Referencia; titulo: string }) {
  return (
    <iframe
      src={referencia.embed}
      title={titulo}
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}

interface Props {
  referencia: Referencia;
  titulo: string;
  onFechar: () => void;
}

/**
 * Camada de tela inteira, sem sair do site. Vai num portal no <body>: a
 * animação de entrada das telas (transform) quebraria um position: fixed
 * aninhado. Pede também a tela cheia do navegador; onde ele não deixa
 * (iPhone), a camada já cobre a janela toda.
 */
export function VideoTelaInteira({ referencia, titulo, onFechar }: Props) {
  const camada = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const instagram = referencia.plataforma === "Instagram";
  const [caixa, setCaixa] = useState<{ width: number; height: number } | null>(null);

  // Instagram: a maior caixa "cabeçalho + mídia 4:5" que cabe no palco.
  useLayoutEffect(() => {
    if (!instagram || !palco.current) return;
    const el = palco.current;
    const medir = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const largura = Math.max(0, Math.min(w, (h - CABECALHO_INSTAGRAM) / MIDIA_INSTAGRAM));
      setCaixa({ width: largura, height: largura * MIDIA_INSTAGRAM + CABECALHO_INSTAGRAM });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [instagram]);

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fechar.current?.focus();
    camada.current?.requestFullscreen?.().catch(() => undefined);

    // Esc fecha. Se o navegador estava em tela cheia, o primeiro Esc é dele:
    // quando a tela cheia acaba, a camada fecha junto.
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    const saiuDaTelaCheia = () => {
      if (!document.fullscreenElement) onFechar();
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("fullscreenchange", saiuDaTelaCheia);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("fullscreenchange", saiuDaTelaCheia);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      document.body.style.overflow = rolagem;
      antes?.focus();
    };
  }, [onFechar]);

  return createPortal(
    <div ref={camada} className="tela-inteira" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="tela-inteira-barra">
        <p className="tela-inteira-titulo">{titulo}</p>
        <button ref={fechar} type="button" className="botao botao-fechar" onClick={onFechar}>
          Fechar
        </button>
      </div>
      <div ref={palco} className="tela-inteira-palco">
        <div
          className={`tela-inteira-video${instagram ? " recorte-instagram" : ""}`}
          style={instagram && caixa ? { width: caixa.width, height: caixa.height } : undefined}
        >
          <QuadroVideo referencia={referencia} titulo={titulo} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
