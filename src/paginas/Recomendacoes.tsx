import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useEstado } from "../dados/armazenamento";
import { lerRecomendacoes, NOME_DA_AREA, rodarRecomendacoes, type Item, type Recomendacoes as R, type Resumo } from "../dados/recomendacoes";
import { noSite } from "../dados/site";
import { nomeFormato, nomeLayout, nomeTipoGancho } from "../../supabase/functions/gerar-roteiro/comum";
import type { Desempenho } from "../dados/recomendacoes";

function dataLegivel(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const num = (n: number | null | undefined, casas = 0) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
const pct = (n: number | null | undefined) => (n == null ? "—" : `${num(n, 1)}%`);
const seg = (n: number | null | undefined) => (n == null ? "—" : `${num(n, 1)} s`);

// O Metricool manda o país como código ISO (BR, CA); cidade já vem por extenso.
const nomesDePais = new Intl.DisplayNames(["pt-BR"], { type: "region" });
function lugar(chave: string) {
  if (!/^[A-Z]{2}$/.test(chave)) return chave;
  try {
    return nomesDePais.of(chave) ?? chave;
  } catch {
    return chave;
  }
}

function TabelaPartes({ titulo, coluna, linhas, ajuda }: { titulo: string; coluna: string; linhas: (Desempenho & { nome: string })[]; ajuda?: ReactNode }) {
  if (!linhas.length) return null;
  return (
    <>
      <h3 className="rec-subtitulo">{titulo}</h3>
      <div className="rec-tabela">
        <table>
          <thead>
            <tr><th scope="col">{coluna}</th><th scope="col">Reels</th><th scope="col">Views (mediana)</th><th scope="col">Passam dos 3 s</th><th scope="col">Salvos/mil</th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome}>
                <th scope="row">{l.nome}</th>
                <td className="mono">{l.n}</td>
                <td className="mono">{num(l.medianaViews)}</td>
                <td className="mono">{pct(l.mediaTaxa3s)}</td>
                <td className="mono">{num(l.salvosPorMil, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ajuda && <p className="radar-bloco-ajuda">{ajuda}</p>}
    </>
  );
}

function variacao(agora: number | null, antes: number | null) {
  if (agora == null || antes == null || antes === 0) return null;
  return Math.round(((agora - antes) / antes) * 100);
}

function TituloPub({ item }: { item: Item }) {
  return item.url ? (
    <a className="link" href={item.url} target="_blank" rel="noreferrer">{item.titulo}</a>
  ) : (
    <span>{item.titulo}</span>
  );
}

function LinhaResumo({ rotulo, r }: { rotulo: string; r: Resumo }) {
  return (
    <tr>
      <th scope="row">{rotulo}</th>
      <td className="mono">{r.n}</td>
      <td className="mono">{num(r.medianaViews)}</td>
      <td className="mono">{pct(r.mediaTaxa3s)}</td>
      <td className="mono">{num(r.salvosPorMil, 1)}</td>
      <td className="mono">{num(r.compartPorMil, 1)}</td>
      <td className="mono">{num(r.comentariosPorMil, 1)}</td>
    </tr>
  );
}

export function Recomendacoes() {
  const { modo } = useEstado();
  const [lista, setLista] = useState<R[]>([]);
  const [escolhido, setEscolhido] = useState(0);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "rodando" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    try {
      setLista(await lerRecomendacoes());
      setEstado("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para carregar as recomendações.");
      setEstado("erro");
    }
  }

  useEffect(() => {
    if (modo === "site") void carregar();
  }, [modo]);

  async function rodar() {
    setEstado("rodando");
    setErro(null);
    try {
      await rodarRecomendacoes();
      await carregar();
      setEscolhido(0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "As recomendações não responderam.");
      setEstado("pronto");
    }
  }

  if (!noSite || modo !== "site") {
    return (
      <section className="vazio">
        <p className="vazio-titulo">As recomendações vivem no site</p>
        <p className="vazio-texto">
          Todo dia às 7h30 elas leem as métricas da conta (views, quem passa dos 3 segundos, salvos, temas, horários e público) e dizem o que mudar para render mais. Entre no site com a sua conta de sócio para ver.
        </p>
      </section>
    );
  }

  const rec = lista[escolhido];
  const c = rec?.conteudo;
  const n = rec?.numeros;
  const v14 = n ? variacao(n.reelsUltimos14.medianaViews, n.reels14Anteriores.medianaViews) : null;

  return (
    <div className="radar recomendacoes">
      <section className="abertura" aria-labelledby="titulo-recomendacoes">
        <p className="abertura-numero" aria-hidden="true">{rec ? dataLegivel(rec.data).slice(0, 2) : "—"}</p>
        <div className="abertura-texto">
          <h1 id="titulo-recomendacoes" className="rotulo">
            Recomendações do dia{rec ? `, ${dataLegivel(rec.data)}` : ""}
          </h1>
          <p className="abertura-gancho radar-manchete">{rec ? rec.manchete : "Ainda não rodou hoje."}</p>
          {rec && <p className="radar-resumo">{rec.diagnostico}</p>}
          <p className="abertura-acoes">
            <button type="button" className="botao botao-primario" onClick={() => void rodar()} disabled={estado === "rodando" || estado === "carregando"}>
              {estado === "rodando" ? "Lendo as métricas (até 2 min)" : "Atualizar agora"}
            </button>
            {lista.length > 1 && (
              <select className="radar-dias" value={escolhido} onChange={(e) => setEscolhido(Number(e.target.value))} aria-label="Dia das recomendações">
                {lista.map((r, i) => <option key={r.data} value={i}>{dataLegivel(r.data)}</option>)}
              </select>
            )}
            {rec && <span className="mono">{rec.modelo === "regras" ? "sem IA" : rec.modelo}</span>}
          </p>
          {rec && (
            <p className="recomendacoes-fonte">
              Métricas do Metricool{rec.dados_ate ? ` até ${dataLegivel(rec.dados_ate)}` : ""}
              {n?.publicacoesLidas ? `, ${n.publicacoesLidas} publicações` : ""}.{" "}
              {n?.sincronia?.mensagem}
              {c?.motivo ? ` Sem IA nesta rodada: ${c.motivo}.` : ""}
            </p>
          )}
          {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
        </div>
      </section>

      {estado === "carregando" ? (
        <p className="sem-dado radar-vazio">Buscando as recomendações.</p>
      ) : !rec || !c || !n ? (
        <p className="sem-dado radar-vazio">Nenhuma recomendação gravada ainda. Clique em "Atualizar agora"; a partir de amanhã ela roda sozinha às 7h30.</p>
      ) : (
        <div className="radar-grade">
          <section className="radar-bloco" aria-labelledby="rec-hoje">
            <h2 id="rec-hoje" className="passo-titulo">Faça hoje</h2>
            <div className="rec-hoje">
              <div className="ideia-corpo">
                <span className="roteiro-etiqueta">Grave</span>
                <p className="ideia-fazer">{c.gravarHoje.tema} · {c.gravarHoje.formato}</p>
                {c.gravarHoje.ganchoTela && <p className="roteiro-tela">{c.gravarHoje.ganchoTela}</p>}
                {c.gravarHoje.ganchoFalado && <p className="ideia-gancho">{c.gravarHoje.ganchoFalado}</p>}
                {c.gravarHoje.chamada && <p className="ideia-porque">Feche com: {c.gravarHoje.chamada}</p>}
                {c.gravarHoje.porque && <p className="ideia-porque">{c.gravarHoje.porque}</p>}
                {c.gravarHoje.diaCalendario ? (
                  <p className="ideia-meta">
                    <Link to={`/dia/${c.gravarHoje.diaCalendario}`} className="link">Modelo do dia {c.gravarHoje.diaCalendario} do calendário</Link>
                  </p>
                ) : null}
              </div>
              <div className="ideia-corpo">
                <span className="roteiro-etiqueta">Poste</span>
                <p className="ideia-fazer">{c.postar.quando}</p>
                <p className="ideia-porque">{c.postar.porque}</p>
                {c.parar.length > 0 && (
                  <>
                    <span className="roteiro-etiqueta rec-parar-rotulo">Pare de</span>
                    <ul className="rec-parar">
                      {c.parar.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="radar-bloco" aria-labelledby="rec-lista">
            <h2 id="rec-lista" className="passo-titulo">O que mudar</h2>
            <p className="radar-bloco-ajuda">Cada recomendação cita o número que a sustenta. A ordem é a prioridade.</p>
            <ol className="ideias">
              {c.recomendacoes.map((r, i) => (
                <li key={i} className="ideia">
                  <span className="padrao-numero" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <div className="ideia-corpo">
                    <p className="rec-etiquetas">
                      <span>{NOME_DA_AREA[r.area] ?? r.area}</span>
                      <span className={r.prioridade === "alta" ? "rec-alta" : undefined}>prioridade {r.prioridade === "media" ? "média" : r.prioridade}</span>
                    </p>
                    <h3 className="ideia-titulo">{r.titulo}</h3>
                    <p className="ideia-porque">{r.porque}</p>
                    <div className="ideia-secao">
                      <span className="roteiro-etiqueta">Faça</span>
                      <p className="ideia-fazer">{r.acao}</p>
                    </div>
                    {r.diaCalendario ? (
                      <p className="ideia-meta">
                        <Link to={`/dia/${r.diaCalendario}`} className="link">dia {r.diaCalendario} do calendário</Link>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="radar-bloco" aria-labelledby="rec-destaques">
            <h2 id="rec-destaques" className="passo-titulo">O que os números mostram</h2>
            <ul className="rec-destaques">
              {c.destaques.map((d, i) => (
                <li key={i}>
                  <h3 className="rec-destaque-titulo">{d.titulo}</h3>
                  <p className="mono rec-destaque-evidencia">{d.evidencia}</p>
                  <p className="ideia-porque">{d.leitura}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="radar-bloco" aria-labelledby="rec-numeros">
            <h2 id="rec-numeros" className="passo-titulo">Números da conta</h2>
            <dl className="rec-kpis">
              <div>
                <dt>Seguidores</dt>
                <dd className="mono">{num(n.seguidores?.atual)}</dd>
                {n.seguidores && <p>{n.seguidores.ganhosNoPeriodo >= 0 ? "+" : ""}{num(n.seguidores.ganhosNoPeriodo)} desde {dataLegivel(n.seguidores.desde)}</p>}
              </div>
              <div>
                <dt>Views por Reel (mediana)</dt>
                <dd className="mono">{num(n.reels.medianaViews)}</dd>
                <p>{n.reels.n} Reels{v14 != null ? `; últimos 14 dias ${v14 >= 0 ? "+" : ""}${v14}% contra os 14 anteriores` : ""}</p>
              </div>
              <div>
                <dt>Passam dos 3 s</dt>
                <dd className="mono">{pct(n.reels.mediaTaxa3s)}</dd>
                <p>média dos Reels</p>
              </div>
              <div>
                <dt>Tempo assistido</dt>
                <dd className="mono">{seg(n.reels.mediaTempoMedio)}</dd>
                <p>retenção estimada {pct(n.reels.mediaRetencao)}</p>
              </div>
              <div>
                <dt>Salvos por mil views</dt>
                <dd className="mono">{num(n.reels.salvosPorMil, 1)}</dd>
                <p>{num(n.reels.compartPorMil, 1)} compartilhamentos por mil</p>
              </div>
            </dl>
            <p className="radar-bloco-ajuda">
              A retenção é estimada: o Instagram não dá a duração do Reel, então ela usa a duração do mesmo vídeo no TikTok.
            </p>

            <h3 className="rec-subtitulo">Por formato</h3>
            <div className="rec-tabela">
              <table>
                <thead>
                  <tr><th scope="col">Formato</th><th scope="col">Posts</th><th scope="col">Views (mediana)</th><th scope="col">Passam dos 3 s</th><th scope="col">Salvos/mil</th><th scope="col">Compart./mil</th><th scope="col">Coment./mil</th></tr>
                </thead>
                <tbody>
                  <LinhaResumo rotulo="Reels" r={n.reels} />
                  <LinhaResumo rotulo="Carrosséis" r={n.carrosseis} />
                  <LinhaResumo rotulo="TikTok" r={n.tiktok} />
                  <LinhaResumo rotulo={'Reels com "comenta"'} r={n.chamada.comComenta} />
                  <LinhaResumo rotulo={'Reels sem "comenta"'} r={n.chamada.semComenta} />
                </tbody>
              </table>
            </div>

            {n.temas.length > 0 && (
              <>
                <h3 className="rec-subtitulo">Por tema</h3>
                <div className="rec-tabela">
                  <table>
                    <thead>
                      <tr><th scope="col">Tema</th><th scope="col">Posts</th><th scope="col">Views (mediana)</th><th scope="col">Passam dos 3 s</th><th scope="col">Salvos/mil</th></tr>
                    </thead>
                    <tbody>
                      {n.temas.map((t) => (
                        <tr key={t.tema}>
                          <th scope="row">{t.tema}</th>
                          <td className="mono">{t.n}</td>
                          <td className="mono">{num(t.medianaViews)}</td>
                          <td className="mono">{pct(t.mediaTaxa3s)}</td>
                          <td className="mono">{num(t.salvosPorMil, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="radar-bloco-ajuda">Tema com menos de 5 posts é indício, não regra.</p>
              </>
            )}

            {(n.formulas?.length ?? 0) > 0 && (
              <>
                <h3 className="rec-subtitulo">Suas fórmulas</h3>
                <p className="radar-bloco-ajuda">
                  Tema × formato da história × layout visual (Kallaway). Repita a combinação que roda e troque só uma parte por vez.{" "}
                  <Link className="link" to="/plano">Montar um Plano 3-3-1</Link>
                </p>
                <div className="rec-tabela">
                  <table>
                    <thead>
                      <tr><th scope="col">Fórmula</th><th scope="col">Reels</th><th scope="col">Views (mediana)</th><th scope="col">Passam dos 3 s</th><th scope="col">Salvos/mil</th></tr>
                    </thead>
                    <tbody>
                      {n.formulas!.map((f) => (
                        <tr key={`${f.tema}|${f.formato}|${f.layout}`}>
                          <th scope="row">
                            {f.tema} · {nomeFormato(f.formato)} · {nomeLayout(f.layout)}
                            {f.exemplo && (
                              <span className="rec-exemplo">
                                Ex.:{" "}
                                {f.exemplo.url ? (
                                  <a className="link" href={f.exemplo.url} target="_blank" rel="noreferrer">{f.exemplo.titulo}</a>
                                ) : (
                                  f.exemplo.titulo
                                )}
                              </span>
                            )}
                          </th>
                          <td className="mono">{f.n}</td>
                          <td className="mono">{num(f.medianaViews)}</td>
                          <td className="mono">{pct(f.mediaTaxa3s)}</td>
                          <td className="mono">{num(f.salvosPorMil, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <TabelaPartes titulo="Por formato da história" coluna="Formato" linhas={(n.formatos ?? []).map((x) => ({ nome: nomeFormato(x.formato), ...x }))} />
            <TabelaPartes titulo="Por layout visual" coluna="Layout" linhas={(n.layouts ?? []).map((x) => ({ nome: nomeLayout(x.layout), ...x }))} />
            <TabelaPartes
              titulo="Por tipo de gancho"
              coluna="Tipo"
              linhas={(n.tiposGancho ?? []).map((x) => ({ nome: nomeTipoGancho(x.tipo), ...x }))}
              ajuda={<>Os modelos do <Link className="link" to="/">calendário</Link> têm filtro por tipo.</>}
            />

            <h3 className="rec-subtitulo">Reels que mais rodaram</h3>
            <div className="rec-tabela">
              <table>
                <thead>
                  <tr><th scope="col">Reel</th><th scope="col">Data</th><th scope="col">Views</th><th scope="col">Passam dos 3 s</th><th scope="col">Tempo</th><th scope="col">Salvos</th></tr>
                </thead>
                <tbody>
                  {n.topReels.map((r) => (
                    <tr key={r.id}>
                      <th scope="row"><TituloPub item={r} /></th>
                      <td className="mono">{dataLegivel(r.data).slice(0, 5)}</td>
                      <td className="mono">{num(r.views)}</td>
                      <td className="mono">{pct(r.taxa3s)}</td>
                      <td className="mono">{seg(r.tempoMedio)}</td>
                      <td className="mono">{num(r.salvos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {n.ganchosFracos.length > 0 && (
              <>
                <h3 className="rec-subtitulo">Ganchos que mais perdem gente</h3>
                <p className="radar-bloco-ajuda">Reels com 500 views ou mais e a menor parcela passando dos 3 segundos.</p>
                <div className="rec-tabela">
                  <table>
                    <thead>
                      <tr><th scope="col">Reel</th><th scope="col">Data</th><th scope="col">Views</th><th scope="col">Passam dos 3 s</th></tr>
                    </thead>
                    <tbody>
                      {n.ganchosFracos.map((r) => (
                        <tr key={r.id}>
                          <th scope="row"><TituloPub item={r} /></th>
                          <td className="mono">{dataLegivel(r.data).slice(0, 5)}</td>
                          <td className="mono">{num(r.views)}</td>
                          <td className="mono rec-alta">{pct(r.taxa3s)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="rec-colunas">
              {n.duracao.length > 0 && (
                <div>
                  <h3 className="rec-subtitulo">Duração do Reel</h3>
                  <div className="rec-tabela">
                    <table>
                      <thead>
                        <tr><th scope="col">Duração</th><th scope="col">Reels</th><th scope="col">Views (mediana)</th><th scope="col">Passam dos 3 s</th></tr>
                      </thead>
                      <tbody>
                        {n.duracao.map((d) => (
                          <tr key={d.faixa}>
                            <th scope="row">{d.faixa}</th>
                            <td className="mono">{d.n}</td>
                            <td className="mono">{num(d.medianaViews)}</td>
                            <td className="mono">{pct(d.mediaTaxa3s)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {n.horasPostadas.length > 0 && (
                <div>
                  <h3 className="rec-subtitulo">Hora em que você postou</h3>
                  <div className="rec-tabela">
                    <table>
                      <thead>
                        <tr><th scope="col">Faixa (Brasília)</th><th scope="col">Reels</th><th scope="col">Views (mediana)</th></tr>
                      </thead>
                      <tbody>
                        {n.horasPostadas.map((h) => (
                          <tr key={h.faixa}>
                            <th scope="row">{h.faixa}</th>
                            <td className="mono">{h.n}</td>
                            <td className="mono">{num(h.medianaViews)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {n.melhoresHorarios.length > 0 && (
                    <p className="radar-bloco-ajuda">
                      Mais seguidores online (Metricool): {n.melhoresHorarios.map((h) => `${h.dia} ${h.hora}h`).join(", ")}.
                    </p>
                  )}
                </div>
              )}
            </div>

            {n.publico && (
              <>
                <h3 className="rec-subtitulo">Quem segue</h3>
                {c.publico && <p className="ideia-porque rec-publico">{c.publico}</p>}
                <div className="rec-colunas">
                  <div>
                    <p className="roteiro-etiqueta">Idade</p>
                    <ul className="rec-barras">
                      {n.publico.faixas.map((f) => (
                        <li key={f.faixa}>
                          <span>{f.faixa}</span>
                          <span className="rec-barra" aria-hidden="true"><span style={{ width: `${Math.min(100, f.pct)}%` }} /></span>
                          <span className="mono">{pct(f.pct)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="ideia-meta">
                      Homens {pct(n.publico.genero.masculino)} · mulheres {pct(n.publico.genero.feminino)}
                      {n.publico.genero.naoInformado ? ` · sem informação ${pct(n.publico.genero.naoInformado)}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="roteiro-etiqueta">Onde</p>
                    <ul className="rec-barras">
                      {[...n.publico.paises, ...n.publico.cidades].map((l) => (
                        <li key={l.chave}>
                          <span title={lugar(l.chave)}>{lugar(l.chave)}</span>
                          <span className="rec-barra" aria-hidden="true"><span style={{ width: `${Math.min(100, l.pct)}%` }} /></span>
                          <span className="mono">{pct(l.pct)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}

            {n.repetidos.length > 0 && (
              <>
                <h3 className="rec-subtitulo">Vídeos postados mais de uma vez</h3>
                <ul className="rec-repetidos">
                  {n.repetidos.map((r) => (
                    <li key={r.titulo}>
                      <p className="ideia-fazer">{r.titulo}</p>
                      <p className="mono ideia-meta">
                        {r.versoes.map((v, i) => (
                          <span key={i}>
                            {i > 0 && " · "}
                            {v.url ? <a className="link" href={v.url} target="_blank" rel="noreferrer">{dataLegivel(v.data).slice(0, 5)}</a> : dataLegivel(v.data).slice(0, 5)}: {num(v.views)} views, {pct(v.taxa3s)} passam dos 3 s
                          </span>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
