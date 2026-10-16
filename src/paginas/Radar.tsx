import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { VideoTelaInteira } from "../componentes/Video";
import { useEstado } from "../dados/armazenamento";
import { lerRadares, mancheteDe, rodarRadar, trafegoLegivel, type Radar as R, type VideoQuente } from "../dados/radar";
import { lerReferencia } from "../dados/referencia";
import { noSite } from "../dados/site";

function dataLegivel(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function Radar() {
  const { modo } = useEstado();
  const [radares, setRadares] = useState<R[]>([]);
  const [escolhido, setEscolhido] = useState(0);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "rodando" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<VideoQuente | null>(null);
  const fechar = useCallback(() => setAberto(null), []);

  async function carregar() {
    try {
      setRadares(await lerRadares());
      setEstado("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para carregar o radar.");
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
      await rodarRadar();
      await carregar();
      setEscolhido(0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "O radar não respondeu.");
      setEstado("pronto");
    }
  }

  if (!noSite || modo !== "site") {
    return (
      <section className="vazio">
        <p className="vazio-titulo">O radar vive no site</p>
        <p className="vazio-texto">
          Todo dia às 7h ele lê o que o Brasil está buscando e os vídeos mais vistos da semana no nicho, e diz o que gravar hoje e como. Entre no site com a sua conta de sócio para ver.
        </p>
      </section>
    );
  }

  const radar = radares[escolhido];
  const tendencias = radar?.fontes.tendencias ?? [];
  const videos = radar?.fontes.videos ?? [];

  return (
    <div className="radar">
      <section className="abertura" aria-labelledby="titulo-radar">
        <p className="abertura-numero" aria-hidden="true">{radar ? dataLegivel(radar.data).slice(0, 2) : "—"}</p>
        <div className="abertura-texto">
          <h1 id="titulo-radar" className="rotulo">
            Radar do dia{radar ? `, ${dataLegivel(radar.data)}` : ""}
          </h1>
          <p className="abertura-gancho radar-manchete">{radar ? mancheteDe(radar) || "O que está quente hoje e o que gravar em cima disso." : "Ainda não rodou hoje."}</p>
          {radar && radar.resumo && <p className="radar-resumo">{radar.resumo}</p>}
          <p className="abertura-acoes">
            <button type="button" className="botao botao-primario" onClick={() => void rodar()} disabled={estado === "rodando" || estado === "carregando"}>
              {estado === "rodando" ? "Lendo tendências (até 1 min)" : "Atualizar agora"}
            </button>
            {radares.length > 1 && (
              <select className="radar-dias" value={escolhido} onChange={(e) => setEscolhido(Number(e.target.value))} aria-label="Dia do radar">
                {radares.map((r, i) => <option key={r.data} value={i}>{dataLegivel(r.data)}</option>)}
              </select>
            )}
            {radar && <span className="mono">{radar.modelo === "regras" ? "sem IA" : radar.modelo}</span>}
          </p>
          {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
        </div>
      </section>

      {estado === "carregando" ? (
        <p className="sem-dado radar-vazio">Buscando o radar.</p>
      ) : !radar ? (
        <p className="sem-dado radar-vazio">Nenhum radar gravado ainda. Clique em "Atualizar agora"; a partir de amanhã ele roda sozinho às 7h.</p>
      ) : (
        <div className="radar-grade">
          <section className="radar-bloco radar-ideias" aria-labelledby="radar-ideias">
            <h2 id="radar-ideias" className="passo-titulo">O que gravar hoje</h2>
            <p className="radar-bloco-ajuda">Cada ideia diz o que fazer e como aplicar, com o padrão do estudo de <Link to="/referencias" className="link">Referências</Link> em cada passo.</p>
            <ol className="ideias">
              {radar.ideias.map((i, n) => (
                <li key={n} className="ideia">
                  <span className="padrao-numero" aria-hidden="true">{String(n + 1).padStart(2, "0")}</span>
                  <div className="ideia-corpo">
                    <h3 className="ideia-titulo">{i.titulo}</h3>
                    <p className="ideia-porque">{i.porqueAgora}</p>

                    {i.oQueFazer && (
                      <div className="ideia-secao">
                        <span className="roteiro-etiqueta">O que fazer</span>
                        <p className="ideia-fazer">{i.oQueFazer}</p>
                      </div>
                    )}

                    <div className="ideia-secao">
                      <span className="roteiro-etiqueta">Gancho</span>
                      <p className="roteiro-tela">{i.textoNaTela}</p>
                      <p className="ideia-gancho">{i.ganchoFalado}</p>
                      {i.provaNaTela && <p className="roteiro-nota">Prova na tela: {i.provaNaTela}</p>}
                    </div>

                    {i.comoAplicar && i.comoAplicar.length > 0 && (
                      <div className="ideia-secao">
                        <span className="roteiro-etiqueta">Como aplicar</span>
                        <ol className="ideia-passos">
                          {i.comoAplicar.map((p, k) => <li key={k}>{p}</li>)}
                        </ol>
                      </div>
                    )}

                    <p className="ideia-meta">
                      {i.formato}
                      {i.diaCalendario ? (
                        <>
                          {" · "}
                          <Link to={`/dia/${i.diaCalendario}`} className="link">dia {i.diaCalendario} do calendário</Link>
                        </>
                      ) : null}
                      {i.fonte && (
                        <>
                          {" · "}
                          {/^https?:/.test(i.fonte) ? <a className="link" href={i.fonte} target="_blank" rel="noreferrer">fonte</a> : <span>{i.fonte}</span>}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="radar-bloco" aria-labelledby="radar-trends">
            <h2 id="radar-trends" className="passo-titulo">O Brasil está buscando</h2>
            {tendencias.length === 0 ? (
              <p className="sem-dado">O Google Trends não respondeu nesta rodada.</p>
            ) : (
              <ul className="tendencias">
                {tendencias.map((t) => (
                  <li key={t.titulo}>
                    <span className="tendencia-titulo">{t.titulo}</span>
                    <span className="tendencia-meta mono">{trafegoLegivel(t.trafego)} buscas</span>
                    {t.noticia && (
                      t.url ? <a className="tendencia-noticia link" href={t.url} target="_blank" rel="noreferrer">{t.noticia}</a> : <span className="tendencia-noticia">{t.noticia}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="radar-bloco" aria-labelledby="radar-videos">
            <h2 id="radar-videos" className="passo-titulo">Mais vistos da semana no nicho</h2>
            {videos.length === 0 ? (
              <p className="sem-dado">O YouTube não respondeu nesta rodada.</p>
            ) : (
              <ul className="videos-quentes">
                {videos.slice(0, 12).map((v) => (
                  <li key={v.id} className="video-quente">
                    <button type="button" className="video-quente-botao" onClick={() => setAberto(v)}>
                      <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" />
                    </button>
                    <p className="video-quente-titulo">{v.titulo}</p>
                    <p className="video-quente-meta mono">{v.views} · {v.canal} · {v.consulta}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {aberto && lerReferencia(aberto.url) && (
        <VideoTelaInteira referencia={lerReferencia(aberto.url)!} titulo={`${aberto.titulo} (${aberto.views})`} onFechar={fechar} />
      )}
    </div>
  );
}
