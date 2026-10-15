import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { noArtefato } from "../dados/plataforma";
import { CTAS, ENTRADA_VAZIA, FORMATOS_ROTEIRO, gerarRoteiroIA, montarRoteiroLocal, roteiroEmTexto, type EntradaRoteiro, type Roteiro as R } from "../dados/roteiro";

const CHAVE = "pauta:roteiro-entrada";

function lerEntrada(): EntradaRoteiro {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? { ...ENTRADA_VAZIA, ...(JSON.parse(bruto) as Partial<EntradaRoteiro>) } : ENTRADA_VAZIA;
  } catch {
    return ENTRADA_VAZIA;
  }
}

const CAMPOS: { chave: keyof EntradaRoteiro; rotulo: string; ajuda: string; longo?: boolean }[] = [
  { chave: "nicho", rotulo: "Seu nicho", ajuda: "Ex.: contabilidade para pequenas empresas" },
  { chave: "tema", rotulo: "Tema do vídeo", ajuda: "Uma ideia só. Ex.: o imposto que a loja paga sem saber" },
  { chave: "publico", rotulo: "Para quem", ajuda: "Quem precisa ouvir isso. Ex.: dono de loja que fatura até 30 mil" },
  { chave: "resultado", rotulo: "O que a pessoa ganha", ajuda: "Em uma frase. Ex.: parar de pagar R$ 400 por mês à toa" },
  { chave: "prova", rotulo: "Prova ou número", ajuda: "Print, caso, estudo, número seu. Ex.: 23 clientes meus pagavam isso em 2025" },
  { chave: "historia", rotulo: "História ou erro seu", ajuda: "Com data. Ex.: em 2022 eu mesmo paguei 3 anos sem perceber", longo: true },
  { chave: "posicao", rotulo: "Sua posição firme", ajuda: "Sem meio-termo. Ex.: contador que não avisa isso está errado" },
];

export function Roteiro() {
  const [entrada, setEntrada] = useState<EntradaRoteiro>(lerEntrada);
  const [ia, setIa] = useState<{ estado: "parado" } | { estado: "gerando" } | { estado: "pronto"; roteiro: R } | { estado: "erro"; mensagem: string }>({ estado: "parado" });
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(entrada));
    } catch {
      // sem armazenamento, o formulário só vive nesta aba
    }
  }, [entrada]);

  const pronto = entrada.nicho.trim() && entrada.tema.trim();
  const local = useMemo(() => (pronto ? montarRoteiroLocal(entrada) : null), [entrada, pronto]);
  const roteiro = ia.estado === "pronto" ? ia.roteiro : local;

  function mudar(chave: keyof EntradaRoteiro, valor: string) {
    setEntrada((e) => ({ ...e, [chave]: valor }));
    if (ia.estado === "pronto") setIa({ estado: "parado" });
  }

  async function melhorar() {
    setIa({ estado: "gerando" });
    try {
      setIa({ estado: "pronto", roteiro: await gerarRoteiroIA(entrada) });
    } catch (e) {
      setIa({ estado: "erro", mensagem: e instanceof Error ? e.message : "Não deu para gerar agora." });
    }
  }

  async function copiar() {
    if (!roteiro) return;
    try {
      await navigator.clipboard.writeText(roteiroEmTexto(roteiro));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="roteiro-pagina">
      <section className="abertura" aria-labelledby="titulo-roteiro">
        <p className="abertura-numero" aria-hidden="true">R</p>
        <div className="abertura-texto">
          <h1 id="titulo-roteiro" className="rotulo">Roteiro</h1>
          <p className="abertura-gancho">Preencha as caixas e saia com o roteiro pronto para ler.</p>
          <p className="abertura-acoes">
            <span>
              A estrutura é a que apareceu nos cinco criadores estudados: gancho triplo, zona de trava com prova, loop com virada, posição firme e legenda que repete o gancho. Veja em <Link to="/referencias" className="link">Referências</Link>.
            </span>
          </p>
        </div>
      </section>

      <div className="roteiro-grade">
        <form className="roteiro-formulario" onSubmit={(e) => { e.preventDefault(); void melhorar(); }}>
          {CAMPOS.map((c) => (
            <label key={c.chave} className="campo">
              <span className="rotulo">{c.rotulo}</span>
              {c.longo ? (
                <textarea rows={3} value={entrada[c.chave]} onChange={(e) => mudar(c.chave, e.target.value)} placeholder={c.ajuda} />
              ) : (
                <input value={entrada[c.chave]} onChange={(e) => mudar(c.chave, e.target.value)} placeholder={c.ajuda} />
              )}
            </label>
          ))}
          <div className="campos-linha">
            <label className="campo">
              <span className="rotulo">Formato</span>
              <select value={entrada.formato} onChange={(e) => mudar("formato", e.target.value)}>
                {FORMATOS_ROTEIRO.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="campo">
              <span className="rotulo">Duração alvo</span>
              <select value={entrada.duracao} onChange={(e) => mudar("duracao", e.target.value)}>
                {["45", "60", "90", "120"].map((d) => <option key={d} value={d}>{d} s</option>)}
              </select>
            </label>
          </div>
          <label className="campo">
            <span className="rotulo">Chamada no fim</span>
            <select value={entrada.cta} onChange={(e) => mudar("cta", e.target.value)}>
              {CTAS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <p className="roteiro-acoes">
            <button type="submit" className="botao botao-primario" disabled={!pronto || ia.estado === "gerando" || noArtefato}>
              {ia.estado === "gerando" ? "Gerando com IA" : "Melhorar com IA"}
            </button>
            <button type="button" className="botao botao-secundario" onClick={() => { setEntrada(ENTRADA_VAZIA); setIa({ estado: "parado" }); }}>
              Limpar
            </button>
          </p>
          <p className="campo-ajuda">A versão por regras aparece ao lado assim que nicho e tema estão preenchidos. A IA usa a chave da Anthropic do site.</p>
          {ia.estado === "erro" && <p className="mensagem-erro" role="alert">{ia.mensagem}</p>}
        </form>

        <section className="roteiro-saida" aria-live="polite" aria-label="Roteiro gerado">
          {!roteiro ? (
            <p className="sem-dado">Escreva o nicho e o tema: o roteiro aparece aqui.</p>
          ) : (
            <>
              <p className="roteiro-origem">
                {ia.estado === "pronto" ? "Versão com IA" : "Versão por regras"} · ~{roteiro.duracaoEstimadaSeg} s
                <button type="button" className="botao-texto" onClick={() => void copiar()}>
                  {copiado ? "Copiado" : "Copiar tudo"}
                </button>
              </p>
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
              {roteiro.avisos.length > 0 && (
                <ul className="roteiro-avisos">
                  {roteiro.avisos.map((a) => <li key={a}>{a}</li>)}
                </ul>
              )}
              <p className="campo-ajuda">
                Gravou? Passe o vídeo em <Link to="/avaliar" className="link">Avaliar</Link> antes de postar.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
