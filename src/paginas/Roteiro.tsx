import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { noArtefato } from "../dados/plataforma";
import { noSite } from "../dados/site";
import {
  CTAS,
  ENTRADA_VAZIA,
  FORMATOS_ROTEIRO,
  gerarRoteiroIA,
  melhorarRoteiroIA,
  montarRoteiroLocal,
  roteiroEmTexto,
  type EntradaRoteiro,
  type Roteiro as R,
  type RoteiroMelhorado,
} from "../dados/roteiro";

const CHAVE = "pauta:roteiro-entrada";
const CHAVE_MODO = "pauta:roteiro-modo";
const CHAVE_COLADO = "pauta:roteiro-colado";

type Modo = "montar" | "melhorar";

function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento, o formulário só vive nesta aba
  }
}

function lerEntrada(): EntradaRoteiro {
  return { ...ENTRADA_VAZIA, ...ler<Partial<EntradaRoteiro>>(CHAVE, {}) };
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

type EstadoIA<T> = { estado: "parado" } | { estado: "gerando" } | { estado: "pronto"; roteiro: T } | { estado: "erro"; mensagem: string };

export function Roteiro() {
  const [modo, setModo] = useState<Modo>(() => (ler<string>(CHAVE_MODO, "montar") === "melhorar" ? "melhorar" : "montar"));
  const [entrada, setEntrada] = useState<EntradaRoteiro>(lerEntrada);
  const [colado, setColado] = useState(() => ler<string>(CHAVE_COLADO, ""));
  const [ia, setIa] = useState<EstadoIA<R>>({ estado: "parado" });
  const [melhora, setMelhora] = useState<EstadoIA<RoteiroMelhorado>>({ estado: "parado" });
  const [copiado, setCopiado] = useState(false);

  useEffect(() => gravar(CHAVE, entrada), [entrada]);
  useEffect(() => gravar(CHAVE_COLADO, colado), [colado]);
  useEffect(() => gravar(CHAVE_MODO, modo), [modo]);

  const pronto = entrada.nicho.trim() && entrada.tema.trim();
  const local = useMemo(() => (pronto ? montarRoteiroLocal(entrada) : null), [entrada, pronto]);
  const roteiroMontado = ia.estado === "pronto" ? ia.roteiro : local;
  const roteiro = modo === "montar" ? roteiroMontado : melhora.estado === "pronto" ? melhora.roteiro : null;
  const palavras = colado.trim() ? colado.trim().split(/\s+/).length : 0;
  const iaDisponivel = noSite && !noArtefato;

  function mudar(chave: keyof EntradaRoteiro, valor: string) {
    setEntrada((e) => ({ ...e, [chave]: valor }));
    if (ia.estado === "pronto") setIa({ estado: "parado" });
  }

  async function gerar() {
    setIa({ estado: "gerando" });
    try {
      setIa({ estado: "pronto", roteiro: await gerarRoteiroIA(entrada) });
    } catch (e) {
      setIa({ estado: "erro", mensagem: e instanceof Error ? e.message : "Não deu para gerar agora." });
    }
  }

  async function melhorar() {
    setMelhora({ estado: "gerando" });
    try {
      const r = await melhorarRoteiroIA({
        roteiroOriginal: colado,
        nicho: entrada.nicho,
        formato: entrada.formato,
        duracao: entrada.duracao,
        cta: entrada.cta,
      });
      setMelhora({ estado: "pronto", roteiro: r });
    } catch (e) {
      setMelhora({ estado: "erro", mensagem: e instanceof Error ? e.message : "Não deu para melhorar agora." });
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

  const camposComuns = (
    <>
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
    </>
  );

  return (
    <div className="roteiro-pagina">
      <section className="abertura" aria-labelledby="titulo-roteiro">
        <p className="abertura-numero" aria-hidden="true">R</p>
        <div className="abertura-texto">
          <h1 id="titulo-roteiro" className="rotulo">Roteiro</h1>
          <p className="abertura-gancho">
            {modo === "montar" ? "Preencha as caixas e saia com o roteiro pronto para ler." : "Cole o roteiro inteiro. A IA devolve a versão melhorada e diz o que mudou."}
          </p>
          <p className="abertura-acoes">
            <span>
              A estrutura é a que apareceu nos cinco criadores estudados: gancho triplo, zona de trava com prova, loop com virada, posição firme e legenda que repete o gancho. Veja em <Link to="/referencias" className="link">Referências</Link>.
            </span>
          </p>
        </div>
      </section>

      <div className="ferramentas">
        <div className="abas" role="tablist" aria-label="Como montar o roteiro">
          <button type="button" role="tab" className="aba" aria-selected={modo === "montar"} onClick={() => setModo("montar")}>
            Montar do zero
          </button>
          <button type="button" role="tab" className="aba" aria-selected={modo === "melhorar"} onClick={() => setModo("melhorar")}>
            Melhorar um roteiro pronto
          </button>
        </div>
      </div>

      <div className="roteiro-grade">
        {modo === "montar" ? (
          <form className="roteiro-formulario" onSubmit={(e) => { e.preventDefault(); void gerar(); }}>
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
            {camposComuns}
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
        ) : (
          <form className="roteiro-formulario" onSubmit={(e) => { e.preventDefault(); void melhorar(); }}>
            <label className="campo">
              <span className="rotulo">Roteiro inteiro</span>
              <textarea
                className="roteiro-colado"
                rows={16}
                value={colado}
                onChange={(e) => { setColado(e.target.value); if (melhora.estado === "pronto") setMelhora({ estado: "parado" }); }}
                placeholder={"Cole aqui do jeito que está: gancho, fala, texto na tela, legenda. Pode ser bagunçado."}
                maxLength={8000}
              />
              <span className="campo-ajuda">{palavras > 0 ? `${palavras} palavras, uns ${Math.round(palavras / 2.5)} s falados.` : "A IA mantém a sua ideia, as suas histórias e os seus números. Não inventa fato."}</span>
            </label>
            <label className="campo">
              <span className="rotulo">Seu nicho (opcional)</span>
              <input value={entrada.nicho} onChange={(e) => mudar("nicho", e.target.value)} placeholder="Ex.: contabilidade para pequenas empresas" />
            </label>
            {camposComuns}
            <p className="roteiro-acoes">
              <button type="submit" className="botao botao-primario" disabled={colado.trim().length < 40 || melhora.estado === "gerando" || !iaDisponivel}>
                {melhora.estado === "gerando" ? "Melhorando (até 1 min)" : "Melhorar com IA"}
              </button>
              <button type="button" className="botao botao-secundario" onClick={() => { setColado(""); setMelhora({ estado: "parado" }); }}>
                Limpar
              </button>
            </p>
            {!iaDisponivel && <p className="campo-ajuda">Melhorar um roteiro pronto usa a IA do site. Abra o Viralizei pelo site e entre com a sua conta.</p>}
            {melhora.estado === "erro" && <p className="mensagem-erro" role="alert">{melhora.mensagem}</p>}
          </form>
        )}

        <section className="roteiro-saida" aria-live="polite" aria-label="Roteiro gerado">
          {!roteiro ? (
            <p className="sem-dado">
              {modo === "montar"
                ? "Escreva o nicho e o tema: o roteiro aparece aqui."
                : melhora.estado === "gerando"
                  ? "A IA está lendo o seu roteiro e reescrevendo com o estudo."
                  : "Cole o roteiro e clique em Melhorar com IA. A versão melhorada aparece aqui, com a lista do que mudou e por quê."}
            </p>
          ) : (
            <>
              <p className="roteiro-origem">
                {modo === "melhorar" ? "Seu roteiro, melhorado com IA" : ia.estado === "pronto" ? "Versão com IA" : "Versão por regras"} · ~{roteiro.duracaoEstimadaSeg} s
                <button type="button" className="botao-texto" onClick={() => void copiar()}>
                  {copiado ? "Copiado" : "Copiar tudo"}
                </button>
              </p>
              {modo === "melhorar" && melhora.estado === "pronto" && melhora.roteiro.mudancas.length > 0 && (
                <section className="roteiro-mudancas" aria-labelledby="roteiro-mudancas-titulo">
                  <h2 id="roteiro-mudancas-titulo" className="roteiro-etiqueta">O que mudou</h2>
                  <ol className="melhorias">
                    {melhora.roteiro.mudancas.map((m) => <li key={m}>{m}</li>)}
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
          )}
        </section>
      </div>
    </div>
  );
}
