import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { diasOrdenados, useEstado } from "../dados/armazenamento";
import {
  apagarIdeia,
  atualizarIdeia,
  carregarIdeias,
  criarIdeia,
  lapidarComIA,
  lapidarPorRegras,
  prepararRoteiro,
  STATUS,
  type Ideia,
  type StatusIdeia,
} from "../dados/laboratorio";
import { noArtefato } from "../dados/plataforma";
import { CLIMAS, quandoLegivel } from "../dados/trilhas";

export function Laboratorio() {
  const { modo, meuId, perfisSite, conteudo, nicho } = useEstado();
  const noSite = modo === "site";
  const iaDisponivel = noSite && !noArtefato;
  const navegar = useNavigate();
  const [ideias, setIdeias] = useState<Ideia[]>([]);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<StatusIdeia>("fila");
  const [texto, setTexto] = useState("");
  const [origem, setOrigem] = useState("");
  const [lapidando, setLapidando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);

  const dias = useMemo(() => diasOrdenados(conteudo), [conteudo]);

  async function carregar() {
    try {
      setIdeias(await carregarIdeias(noSite));
      setEstado("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para carregar as ideias.");
      setEstado("erro");
    }
  }

  useEffect(() => {
    if (modo !== "carregando" && modo !== "login") void carregar();
  }, [modo]);

  function quem(id: string | null) {
    if (!id || id === meuId) return "você";
    return perfisSite[id] || "um sócio";
  }

  async function lapidar(ideia: Ideia, comIA: boolean) {
    setLapidando(ideia.id);
    setErro(null);
    try {
      const lapidacao = comIA ? await lapidarComIA(ideia.texto, nicho) : lapidarPorRegras(ideia.texto, dias, conteudo.formatos);
      await atualizarIdeia(noSite, ideia.id, { lapidacao, lapidadaCom: comIA ? "ia" : "regras", status: "lapidada" });
      await carregar();
      setAba("lapidada");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para lapidar agora.");
    } finally {
      setLapidando(null);
    }
  }

  async function guardar(e: FormEvent, eLapidar: boolean) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const nova = await criarIdeia(noSite, texto, origem);
      setTexto("");
      setOrigem("");
      await carregar();
      if (eLapidar) {
        await lapidar(nova, iaDisponivel);
      } else {
        setAba("fila");
      }
    } catch (erro) {
      setErro(erro instanceof Error ? erro.message : "Não deu para guardar a ideia.");
    } finally {
      setOcupado(false);
    }
  }

  async function mudarStatus(ideia: Ideia, status: StatusIdeia) {
    setErro(null);
    try {
      await atualizarIdeia(noSite, ideia.id, { status });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para salvar.");
    }
  }

  async function levarParaRoteiro(ideia: Ideia) {
    prepararRoteiro(ideia);
    try {
      await atualizarIdeia(noSite, ideia.id, { status: "roteiro" });
    } catch {
      // o Roteiro abre mesmo se o status não salvar
    }
    navegar("/roteiro");
  }

  async function apagar(ideia: Ideia) {
    setErro(null);
    try {
      await apagarIdeia(noSite, ideia.id);
      setApagando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para apagar.");
    }
  }

  if (modo === "carregando") return <p className="sem-dado radar-vazio">Carregando.</p>;

  const contagem = Object.fromEntries(STATUS.map((s) => [s.id, ideias.filter((i) => i.status === s.id).length]));
  const visiveis = ideias.filter((i) => i.status === aba);
  const statusAtual = STATUS.find((s) => s.id === aba)!;

  return (
    <div className="laboratorio">
      <section className="abertura" aria-labelledby="titulo-laboratorio">
        <p className="abertura-numero" aria-hidden="true">{String(contagem.fila ?? 0).padStart(2, "0")}</p>
        <div className="abertura-texto">
          <h1 id="titulo-laboratorio" className="rotulo">Laboratório de ideias, {contagem.fila === 1 ? "1 na fila" : `${contagem.fila ?? 0} na fila`}</h1>
          <p className="abertura-gancho">Jogue a ideia crua. Saia com gancho, ângulo e formato.</p>
          <p className="radar-resumo">
            Uma notícia, um print, uma conversa, um erro seu. O laboratório lapida com o estudo de{" "}
            <Link to="/referencias" className="link">Referências</Link> e os modelos de gancho do calendário, sugere o clima da{" "}
            <Link to="/trilhas" className="link">trilha</Link> e manda para o <Link to="/roteiro" className="link">Roteiro</Link>.
          </p>
        </div>
      </section>

      <form className="lab-formulario" onSubmit={(e) => void guardar(e, true)}>
        <label className="campo">
          <span className="rotulo">Ideia</span>
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={2000}
            placeholder="Ex.: vi que a maioria dos MEIs paga o DAS atrasado e perde o auxílio-doença sem saber"
          />
        </label>
        <label className="campo">
          <span className="rotulo">De onde veio (opcional)</span>
          <input type="url" inputMode="url" value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="https://… (notícia, post, vídeo)" />
        </label>
        <p className="roteiro-acoes">
          <button type="submit" className="botao botao-primario" disabled={ocupado || texto.trim().length < 5}>
            {ocupado ? "Guardando" : iaDisponivel ? "Guardar e lapidar com IA" : "Guardar e lapidar"}
          </button>
          <button type="button" className="botao botao-secundario" disabled={ocupado || texto.trim().length < 5} onClick={(e) => void guardar(e as unknown as FormEvent, false)}>
            Só guardar na fila
          </button>
        </p>
        <p className="campo-ajuda">
          {noSite ? "As ideias são da equipe toda." : "Fora do site, as ideias ficam só neste navegador e a lapidação é sem IA."}
        </p>
      </form>

      {erro && <p className="mensagem-erro lab-erro" role="alert">{erro}</p>}

      <div className="ferramentas">
        <div className="abas" role="tablist" aria-label="Situação das ideias">
          {STATUS.map((s) => (
            <button key={s.id} type="button" role="tab" className="aba" aria-selected={aba === s.id} onClick={() => setAba(s.id)}>
              {s.nome} <span className="contagem">{contagem[s.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {estado === "carregando" ? (
        <p className="sem-dado radar-vazio">Buscando as ideias.</p>
      ) : estado === "erro" ? null : visiveis.length === 0 ? (
        <div className="vazio vazio-lista">
          <p className="vazio-texto">{statusAtual.vazio}</p>
        </div>
      ) : (
        <ol className="lab-lista">
          {visiveis.map((ideia, n) => {
            const l = ideia.lapidacao;
            const ocupada = lapidando === ideia.id;
            return (
              <li key={ideia.id} className="lab-ideia">
                <span className="padrao-numero" aria-hidden="true">{String(n + 1).padStart(2, "0")}</span>
                <div className="lab-ideia-corpo">
                  <p className="lab-ideia-texto">{ideia.texto}</p>
                  <p className="lab-ideia-meta">
                    Por {quem(ideia.criadoPor)}, {quandoLegivel(ideia.criadoEm)}
                    {ideia.origemUrl && (
                      <>
                        {" · "}
                        <a className="link" href={ideia.origemUrl} target="_blank" rel="noreferrer">de onde veio</a>
                      </>
                    )}
                    {ideia.lapidadaCom && ` · lapidada ${ideia.lapidadaCom === "ia" ? "com IA" : "sem IA"}`}
                  </p>

                  {l && (
                    <div className="lab-lapidacao">
                      <div className="ideia-secao">
                        <span className="roteiro-etiqueta">A ideia em uma frase</span>
                        <p className="ideia-fazer">{l.resumo}</p>
                      </div>
                      <div className="ideia-secao">
                        <span className="roteiro-etiqueta">Ângulo</span>
                        <p>{l.angulo}</p>
                        {l.publico && <p className="roteiro-nota">Para quem: {l.publico}</p>}
                      </div>
                      <div className="ideia-secao">
                        <span className="roteiro-etiqueta">Ganchos</span>
                        <ol className="lab-ganchos">
                          {l.ganchos.map((g, k) => (
                            <li key={k}>
                              <p className="roteiro-tela">{g.textoNaTela}</p>
                              <p className="ideia-gancho">{g.ganchoFalado}</p>
                              <p className="roteiro-nota">
                                {g.padrao}
                                {g.diaCalendario ? (
                                  <>
                                    {" · "}
                                    <Link to={`/dia/${g.diaCalendario}`} className="link">dia {g.diaCalendario}</Link>
                                  </>
                                ) : null}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="ideia-secao">
                        <span className="roteiro-etiqueta">Como gravar</span>
                        <p>
                          {l.formato} · trilha <Link to="/trilhas" className="link">{CLIMAS[l.climaTrilha]?.nome.toLowerCase() ?? l.climaTrilha}</Link>, baixa embaixo da fala
                        </p>
                        <p className="roteiro-nota">Prova na tela: {l.provaSugerida}</p>
                        <p className="roteiro-nota">Primeiro passo: {l.proximoPasso}</p>
                      </div>
                      {l.riscos.length > 0 && (
                        <div className="ideia-secao">
                          <span className="roteiro-etiqueta">Cuidado</span>
                          <ul className="roteiro-avisos">
                            {l.riscos.map((r) => <li key={r}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {apagando === ideia.id && (
                    <div className="confirmacao" role="alert">
                      <p>Apagar a ideia "{ideia.texto.slice(0, 60)}{ideia.texto.length > 60 ? "…" : ""}"? Não dá para desfazer.</p>
                      <p className="confirmacao-acoes">
                        <button type="button" className="botao botao-perigo-cheio botao-pequeno" onClick={() => void apagar(ideia)}>Apagar</button>
                        <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setApagando(null)}>Cancelar</button>
                      </p>
                    </div>
                  )}

                  <p className="lab-acoes">
                    {l && ideia.status !== "descartada" && (
                      <button type="button" className="botao botao-primario botao-pequeno" onClick={() => void levarParaRoteiro(ideia)}>
                        Levar para o Roteiro
                      </button>
                    )}
                    {ideia.status !== "descartada" && iaDisponivel && (
                      <button type="button" className={l ? "botao-texto" : "botao botao-primario botao-pequeno"} disabled={!!lapidando} onClick={() => void lapidar(ideia, true)}>
                        {ocupada ? "Lapidando (até 1 min)" : l ? "Lapidar de novo com IA" : "Lapidar com IA"}
                      </button>
                    )}
                    {ideia.status !== "descartada" && !l && (
                      <button type="button" className={iaDisponivel ? "botao-texto" : "botao botao-primario botao-pequeno"} disabled={!!lapidando} onClick={() => void lapidar(ideia, false)}>
                        Lapidar sem IA
                      </button>
                    )}
                    {ideia.status === "descartada" ? (
                      <button type="button" className="botao-texto" onClick={() => void mudarStatus(ideia, l ? "lapidada" : "fila")}>Voltar para {l ? "as lapidadas" : "a fila"}</button>
                    ) : (
                      <button type="button" className="botao-texto" onClick={() => void mudarStatus(ideia, "descartada")}>Descartar</button>
                    )}
                    <button type="button" className="botao-texto botao-perigo" onClick={() => setApagando(ideia.id)}>Apagar</button>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
