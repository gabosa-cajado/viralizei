import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { QuadroVideo, VideoTelaInteira } from "../componentes/Video";
import { diasOrdenados, useEstado } from "../dados/armazenamento";
import { noArtefato } from "../dados/plataforma";
import { lerReferencia, type Referencia as Ref } from "../dados/referencia";
import { criadorPorSlug, REFERENCIAS, ROTULOS_VISUAL, type VideoReferencia } from "../dados/referencias";

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="lista-pontos">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Bloco({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="bloco-ref" aria-labelledby={`ref-${id}`}>
      <h2 id={`ref-${id}`} className="passo-titulo">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function Referencia() {
  const { slug } = useParams();
  const { conteudo } = useEstado();
  const criador = criadorPorSlug(slug);
  const [aberto, setAberto] = useState<{ video: VideoReferencia; ref: Ref } | null>(null);
  const fechar = useCallback(() => setAberto(null), []);

  useEffect(() => {
    setAberto(null);
    window.scrollTo(0, 0);
  }, [slug]);

  if (!criador) {
    return (
      <section className="vazio vazio-inicio">
        <p className="vazio-titulo">Esta referência não existe.</p>
        <Link className="botao botao-primario" to="/referencias">
          Voltar às referências
        </Link>
      </section>
    );
  }

  const indice = REFERENCIAS.criadores.findIndex((c) => c.slug === criador.slug);
  const ganchosInspirados = diasOrdenados(conteudo).filter((d) => d.inspiracao === criador.slug);
  const anterior = REFERENCIAS.criadores[indice - 1];
  const seguinte = REFERENCIAS.criadores[indice + 1];

  return (
    <article className="dia referencia">
      <nav className="dia-topo" aria-label="Navegação das referências">
        <Link to="/referencias" className="link-voltar">
          Referências
        </Link>
        <span className="dia-setas">
          {anterior && (
            <Link to={`/referencias/${anterior.slug}`} className="botao botao-secundario botao-pequeno">
              {anterior.nome}
            </Link>
          )}
          {seguinte && (
            <Link to={`/referencias/${seguinte.slug}`} className="botao botao-secundario botao-pequeno">
              {seguinte.nome}
            </Link>
          )}
        </span>
      </nav>

      <header className="dia-cabecalho">
        <p className="abertura-numero" aria-hidden="true">
          {String(indice + 1).padStart(2, "0")}
        </p>
        <div className="dia-cabecalho-texto">
          <p className="rotulo">
            <a href={criador.instagram} target="_blank" rel="noreferrer" className="link">
              @{criador.handle}
            </a>
            , {criador.nicho}
          </p>
          <h1 className="gancho gancho-titulo">{criador.nome}</h1>
          <p className="descricao">{criador.resumo}</p>
        </div>
      </header>

      <div className="blocos-ref">
        <Bloco id="numeros" titulo="Números">
          <dl className="ficha">
            {Object.entries(criador.numeros).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Bloco>

        <Bloco id="porque" titulo="Por que funciona">
          <Lista itens={criador.porqueFunciona} />
        </Bloco>

        <Bloco id="videos" titulo="Os vídeos que mais rodaram">
          <ul className="videos-ref">
            {criador.videos.map((v) => {
              const ref = lerReferencia(v.url);
              return (
                <li key={v.url} className="video-ref">
                  <p className="video-ref-titulo">
                    <span className="mono">{v.views}</span> {v.titulo}
                  </p>
                  {ref && !noArtefato ? (
                    <>
                      <div className={`moldura-video moldura-video-pequena${ref.plataforma === "Instagram" ? " recorte-instagram" : ""}`}>
                        <QuadroVideo referencia={ref} titulo={`${criador.nome}: ${v.titulo}`} />
                      </div>
                      <button
                        type="button"
                        className="botao botao-secundario botao-pequeno"
                        onClick={() => setAberto({ video: v, ref })}
                      >
                        Tela inteira
                      </button>
                    </>
                  ) : (
                    <a className="botao botao-secundario botao-pequeno" href={v.url} target="_blank" rel="noreferrer">
                      Assistir no Instagram
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {aberto && (
            <VideoTelaInteira
              referencia={aberto.ref}
              titulo={`${criador.nome}: ${aberto.video.titulo} (${aberto.video.views})`}
              onFechar={fechar}
            />
          )}
        </Bloco>

        <Bloco id="ganchos" titulo="Ganchos que rodaram">
          <ul className="exemplos">
            {criador.ganchos.map((g) => (
              <li key={g.url + g.texto} className="exemplo exemplo-gancho">
                <span className="etiqueta">{g.views}</span>
                <span className="exemplo-texto">
                  {g.texto}
                  <span className="gancho-onde"> {g.onde}</span>
                </span>
                <a className="botao-texto" href={g.url} target="_blank" rel="noreferrer">
                  Abrir
                </a>
              </li>
            ))}
          </ul>
        </Bloco>

        <Bloco id="posicionamento" titulo="Posicionamento">
          <p className="descricao">{criador.posicionamento}</p>
        </Bloco>

        <Bloco id="formatos" titulo="Formatos">
          <Lista itens={criador.formatos} />
        </Bloco>

        <Bloco id="roteiro" titulo="Roteiro e ritmo">
          <p className="descricao">{criador.roteiro}</p>
        </Bloco>

        <Bloco id="visual" titulo="Visual">
          <dl className="ficha">
            {Object.entries(criador.visual).map(([k, v]) => (
              <div key={k}>
                <dt>{ROTULOS_VISUAL[k] ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Bloco>

        <Bloco id="voz" titulo="Voz">
          <p className="descricao">{criador.voz}</p>
        </Bloco>

        <Bloco id="legenda" titulo="Legenda">
          <p className="descricao">{criador.legenda}</p>
        </Bloco>

        <Bloco id="cadencia" titulo="Quando e quanto posta">
          <p className="descricao">{criador.cadencia}</p>
        </Bloco>

        <Bloco id="dinheiro" titulo="Patrocínio e produto">
          <p className="descricao">{criador.monetizacao}</p>
        </Bloco>

        <Bloco id="plataformas" titulo="TikTok, YouTube e trial reels">
          <p className="descricao">{criador.outrasPlataformas}</p>
          <p className="descricao">{criador.trialReels}</p>
        </Bloco>

        {ganchosInspirados.length > 0 && (
          <Bloco id="ganchos-calendario" titulo="Ganchos do calendário que saíram daqui">
            <ul className="irmaos">
              {ganchosInspirados.map((d) => (
                <li key={d.id}>
                  <Link to={`/dia/${d.numero}`} className="link">
                    Dia {d.numero}: {d.gancho}
                  </Link>
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        <Bloco id="copiar" titulo="O que copiar">
          <Lista itens={criador.copiar} />
        </Bloco>

        <Bloco id="evitar" titulo="O que não copiar">
          <Lista itens={criador.evitar} />
        </Bloco>
      </div>
    </article>
  );
}
