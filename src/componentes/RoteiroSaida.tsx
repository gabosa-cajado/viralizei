import { type ReactNode, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { palavrasFaladas } from "../../supabase/functions/gerar-roteiro/comum";
import { roteiroEmTexto, roteiroSoFala, type Roteiro } from "../dados/roteiro";

/** O roteiro pronto: loops, blocos, só o texto, avisos e padrões do estudo. */
export function RoteiroSaida({ roteiro, origem, mudancas, acoes }: { roteiro: Roteiro; origem: string; mudancas?: string[]; acoes?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  const [falaCopiada, setFalaCopiada] = useState(false);
  const caixaFala = useRef<HTMLTextAreaElement>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(roteiroEmTexto(roteiro));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  }

  async function copiarFala() {
    try {
      await navigator.clipboard.writeText(caixaFala.current?.value ?? "");
      setFalaCopiada(true);
      setTimeout(() => setFalaCopiada(false), 1800);
    } catch {
      caixaFala.current?.select();
    }
  }

  return (
    <>
      <p className="roteiro-origem">
        {origem} · {palavrasFaladas(roteiro)} palavras, ~{roteiro.duracaoEstimadaSeg} s
        <button type="button" className="botao-texto" onClick={() => void copiar()}>
          {copiado ? "Copiado" : "Copiar tudo"}
        </button>
      </p>
      {acoes}
      {mudancas && mudancas.length > 0 && (
        <section className="roteiro-mudancas" aria-labelledby="roteiro-mudancas-titulo">
          <h2 id="roteiro-mudancas-titulo" className="roteiro-etiqueta">O que mudou</h2>
          <ol className="melhorias">
            {mudancas.map((m) => <li key={m}>{m}</li>)}
          </ol>
        </section>
      )}
      {roteiro.loops && (
        <section className="roteiro-loops" aria-labelledby="roteiro-loops-titulo">
          <h2 id="roteiro-loops-titulo" className="roteiro-etiqueta">Três loops</h2>
          <div className="loops-linha" aria-hidden="true">
            {[roteiro.loops.gancho, roteiro.loops.reforco, roteiro.loops.meio].map((l, i) =>
              l.segundo == null ? null : (
                <span key={i} className="loops-marca" style={{ left: `${Math.min(100, (l.segundo / Math.max(1, roteiro.duracaoEstimadaSeg)) * 100)}%` }}>
                  {l.segundo} s
                </span>
              ),
            )}
          </div>
          <ol className="loops-lista">
            {([
              ["Gancho", "abre a pergunta do vídeo", roteiro.loops.gancho],
              ["Reforço", "aumenta a aposta até uns 15 s", roteiro.loops.reforco],
              ["Religar", "reabre a curiosidade perto da metade", roteiro.loops.meio],
            ] as const).map(([nome, papel, l]) => (
              <li key={nome}>
                <span className="mono loops-segundo">{l.segundo == null ? "?" : `${l.segundo} s`}</span>
                <span>
                  <strong>{nome}</strong> ({papel}): {l.frase}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <ol className="roteiro-blocos">
        <li>
          <span className="roteiro-etiqueta">Texto na tela</span>
          <p className="roteiro-tela">{roteiro.textoNaTela}</p>
        </li>
        <li>
          <span className="roteiro-etiqueta">Gancho falado</span>
          <p className="roteiro-fala roteiro-gancho">{roteiro.ganchoFalado}</p>
          <p className="roteiro-nota">Ação visual: {roteiro.acaoVisual}</p>
        </li>
        <li>
          <span className="roteiro-etiqueta">Zona de trava</span>
          <p className="roteiro-fala">{roteiro.zonaDeTrava}</p>
        </li>
        {roteiro.blocos.map((b, i) => (
          <li key={i}>
            <span className="roteiro-etiqueta">{b.titulo}</span>
            <p className="roteiro-fala">{b.fala}</p>
            <p className="roteiro-nota">Na tela: {b.textoNaTela}</p>
            {b.visual && <p className="roteiro-nota">Visual: {b.visual}</p>}
          </li>
        ))}
        <li>
          <span className="roteiro-etiqueta">Fechamento</span>
          <p className="roteiro-fala">{roteiro.fechamento}</p>
        </li>
        <li>
          <span className="roteiro-etiqueta">Legenda</span>
          <p className="roteiro-legenda">{roteiro.legenda}</p>
        </li>
      </ol>
      <div className="roteiro-so-texto">
        <p className="roteiro-origem">
          <label htmlFor="roteiro-so-fala" className="roteiro-etiqueta">Só o texto</label>
          <button type="button" className="botao-texto" onClick={() => void copiarFala()}>
            {falaCopiada ? "Copiado" : "Copiar texto"}
          </button>
        </p>
        <textarea
          id="roteiro-so-fala"
          key={roteiroSoFala(roteiro)}
          ref={caixaFala}
          defaultValue={roteiroSoFala(roteiro)}
          rows={12}
          spellCheck={false}
        />
      </div>
      {roteiro.avisos.length > 0 && (
        <ul className="roteiro-avisos">
          {roteiro.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      {roteiro.padroesUsados && roteiro.padroesUsados.length > 0 && (
        <section className="roteiro-padroes" aria-labelledby="roteiro-padroes-titulo">
          <h2 id="roteiro-padroes-titulo" className="roteiro-etiqueta">Padrões do estudo aplicados</h2>
          <ul>
            {roteiro.padroesUsados.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p className="campo-ajuda">Os nomes são os da seção <Link to="/referencias" className="link">Referências</Link>: se um item não bate com o que está lá, o roteiro não está seguindo o estudo.</p>
        </section>
      )}
      <p className="campo-ajuda">
        Gravou? Passe o vídeo em <Link to="/avaliar" className="link">Avaliar</Link> antes de postar.
      </p>
    </>
  );
}
