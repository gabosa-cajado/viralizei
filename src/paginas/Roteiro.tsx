import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RoteiroSaida } from "../componentes/RoteiroSaida";
import { lerPersona } from "../dados/persona";
import { noArtefato } from "../dados/plataforma";
import { noSite } from "../dados/site";
import {
  CTAS,
  ENTRADA_VAZIA,
  FORMATOS_ROTEIRO,
  gerarRoteiroIA,
  melhorarRoteiroIA,
  montarRoteiroLocal,
  type EntradaRoteiro,
  type Roteiro as R,
  type RoteiroMelhorado,
} from "../dados/roteiro";
import { RoteiroEtapas } from "./RoteiroEtapas";

const CHAVE = "pauta:roteiro-entrada";
const CHAVE_MODO = "pauta:roteiro-modo";
const CHAVE_COLADO = "pauta:roteiro-colado";

type Modo = "etapas" | "montar" | "melhorar";

function lerModo(): Modo {
  const m = ler<string>(CHAVE_MODO, "montar");
  return m === "melhorar" || m === "etapas" ? m : "montar";
}

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
  const [modo, setModo] = useState<Modo>(lerModo);
  const [entrada, setEntrada] = useState<EntradaRoteiro>(lerEntrada);
  const [colado, setColado] = useState(() => ler<string>(CHAVE_COLADO, ""));
  const [ia, setIa] = useState<EstadoIA<R>>({ estado: "parado" });
  const [melhora, setMelhora] = useState<EstadoIA<RoteiroMelhorado>>({ estado: "parado" });

  useEffect(() => gravar(CHAVE, entrada), [entrada]);
  // No site, o nicho vazio vem da Persona do canal.
  useEffect(() => {
    if (!noSite || noArtefato || entrada.nicho.trim()) return;
    let vivo = true;
    lerPersona()
      .then((p) => vivo && p.nicho && setEntrada((e) => (e.nicho.trim() ? e : { ...e, nicho: p.nicho })))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
            {modo === "etapas"
              ? "Pesquisa, gancho, estrutura e só então o texto. Cada versão fica guardada."
              : modo === "montar"
                ? "Preencha as caixas e saia com o roteiro pronto para ler."
                : "Cole o roteiro inteiro. A IA devolve a versão melhorada e diz o que mudou."}
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
          <button type="button" role="tab" className="aba" aria-selected={modo === "etapas"} onClick={() => setModo("etapas")}>
            Em etapas
          </button>
          <button type="button" role="tab" className="aba" aria-selected={modo === "montar"} onClick={() => setModo("montar")}>
            Montar do zero
          </button>
          <button type="button" role="tab" className="aba" aria-selected={modo === "melhorar"} onClick={() => setModo("melhorar")}>
            Melhorar um roteiro pronto
          </button>
        </div>
      </div>

      {modo === "etapas" ? (
        <RoteiroEtapas />
      ) : (
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
                {ia.estado === "gerando" ? "Escrevendo com IA (até 1 min)" : "Escrever com IA"}
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
            <RoteiroSaida
              roteiro={roteiro}
              origem={modo === "melhorar" ? "Seu roteiro, melhorado com IA" : ia.estado === "pronto" ? "Versão com IA" : "Versão por regras"}
              mudancas={modo === "melhorar" && melhora.estado === "pronto" ? melhora.roteiro.mudancas : undefined}
            />
          )}
        </section>
      </div>
      )}
    </div>
  );
}
