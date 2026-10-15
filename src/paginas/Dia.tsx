import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Gancho, GanchoEditavel, montarGancho } from "../componentes/Gancho";
import { Gravadores, nomeDe, usePerfis } from "../componentes/Pessoas";
import { alternarGravado, diasOrdenados, emEquipe, nomeDoFormato, quemGravou, salvarNicho, useEstado } from "../dados/armazenamento";
import { gerarGanchos } from "../dados/ia";
import { noArtefato } from "../dados/plataforma";
import { lerReferencia } from "../dados/referencia";

function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(null), 1800);
    return () => clearTimeout(t);
  }, [copiado]);
  async function copiar(chave: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
    } catch {
      setCopiado(null);
    }
  }
  return { copiado, copiar };
}

type Geracao =
  | { estado: "parado" }
  | { estado: "gerando" }
  | { estado: "pronto"; exemplos: string[]; nicho: string }
  | { estado: "erro"; mensagem: string };

export function Dia() {
  const { numero } = useParams();
  const { conteudo, gravados, nicho, modo, podeEditar } = useEstado();
  const dias = useMemo(() => diasOrdenados(conteudo), [conteudo]);
  const indice = dias.findIndex((d) => String(d.numero) === numero);
  const dia = dias[indice];

  const [lacunas, setLacunas] = useState<string[]>([]);
  const [nichoCampo, setNichoCampo] = useState(nicho);
  const [geracao, setGeracao] = useState<Geracao>({ estado: "parado" });
  const { copiado, copiar } = useCopiar();
  const quem = dia ? quemGravou(dia.id) : [];
  const perfis = usePerfis(quem);

  useEffect(() => {
    setLacunas([]);
    setGeracao({ estado: "parado" });
    window.scrollTo(0, 0);
  }, [numero]);

  if (!dia) {
    return (
      <section className="vazio vazio-inicio">
        <p className="vazio-titulo">Este dia não existe.</p>
        <p className="vazio-texto">Ele pode ter sido apagado em Gerenciar dias. Volte aos ganchos virais e escolha outro.</p>
        <Link className="botao botao-primario" to="/">
          Voltar aos ganchos virais
        </Link>
      </section>
    );
  }

  const gravado = gravados.includes(dia.id);
  const referencia = dia.referenciaUrl ? lerReferencia(dia.referenciaUrl) : null;
  const anterior = dias[indice - 1];
  const seguinte = dias[indice + 1];
  const irmaos = dias.filter((d) => d.id !== dia.id && d.gancho.trim() === dia.gancho.trim());

  async function gerar() {
    const alvo = nichoCampo.trim();
    if (!alvo) {
      setGeracao({ estado: "erro", mensagem: "Escreva o seu nicho antes de gerar." });
      return;
    }
    salvarNicho(alvo);
    setGeracao({ estado: "gerando" });
    try {
      const exemplos = await gerarGanchos(dia.gancho, dia.descricao, alvo);
      setGeracao({ estado: "pronto", exemplos, nicho: alvo });
    } catch (e) {
      setGeracao({ estado: "erro", mensagem: e instanceof Error ? e.message : "Não deu para gerar agora. Tente de novo." });
    }
  }

  const temLacuna = /_{3,}/.test(dia.gancho);
  const nomeFormato = nomeDoFormato(conteudo, dia.formatoId);

  return (
    <article className="dia">
      <nav className="dia-topo" aria-label="Navegação do dia">
        <Link to="/" className="link-voltar">
          Ganchos virais
        </Link>
        <span className="dia-setas">
          {anterior ? (
            <Link to={`/dia/${anterior.numero}`} className="botao botao-secundario botao-pequeno">
              Dia anterior
            </Link>
          ) : null}
          {seguinte ? (
            <Link to={`/dia/${seguinte.numero}`} className="botao botao-secundario botao-pequeno">
              Próximo dia
            </Link>
          ) : null}
        </span>
      </nav>

      <header className="dia-cabecalho">
        <p className="abertura-numero" aria-hidden="true">
          {String(dia.numero).padStart(2, "0")}
        </p>
        <div className="dia-cabecalho-texto">
          <p className="rotulo">
            Dia {dia.numero} de {dias.length}, {nomeFormato.toLowerCase()}
          </p>
          <h1 className="gancho gancho-titulo">
            <Gancho gancho={dia.gancho} className="gancho" />
          </h1>
          <p className={`estado${gravado ? " estado-gravado" : ""}`}>{gravado ? "Você já gravou este dia" : "Ainda não gravado"}</p>
        </div>
      </header>

      <ol className="passos">
        <li className="passo">
          <span className="passo-numero" aria-hidden="true">1</span>
          <section className="passo-corpo" aria-labelledby="passo-1">
            <h2 id="passo-1" className="passo-titulo">
              Entenda a ideia
            </h2>
            {dia.descricao ? (
              <p className="descricao">{dia.descricao}</p>
            ) : (
              <p className="sem-dado">Este dia ainda não tem explicação.</p>
            )}
            <dl className="ficha">
              <div>
                <dt>Formato</dt>
                <dd>{nomeFormato}</dd>
              </div>
              <div>
                <dt>Referência</dt>
                <dd>
                  {referencia ? (
                    <a className="botao botao-secundario botao-pequeno" href={referencia.original} target="_blank" rel="noreferrer">
                      Assistir no {referencia.plataforma}
                    </a>
                  ) : (
                    <span className="sem-dado">
                      {dia.referenciaUrl ? "O link salvo não é de um vídeo. " : "Sem vídeo. "}
                      {podeEditar && (
                        <Link to={`/conteudo?dia=${dia.id}`} className="link">
                          {dia.referenciaUrl ? "Corrigir" : "Adicionar"}
                        </Link>
                      )}
                    </span>
                  )}
                </dd>
              </div>
              {irmaos.length > 0 && (
                <div>
                  <dt>Mesma ideia</dt>
                  <dd className="irmaos">
                    {irmaos.map((d) => (
                      <Link key={d.id} to={`/dia/${d.numero}`} className="link">
                        Dia {d.numero}, {nomeDoFormato(conteudo, d.formatoId).toLowerCase()}
                      </Link>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            {referencia && !noArtefato && (
              <div className="moldura-video">
                <iframe
                  src={referencia.embed}
                  title={`Vídeo de referência do dia ${dia.numero} no ${referencia.plataforma}`}
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="encrypted-media; picture-in-picture; fullscreen"
                />
              </div>
            )}
          </section>
        </li>

        <li className="passo">
          <span className="passo-numero" aria-hidden="true">2</span>
          <section className="passo-corpo" aria-labelledby="passo-2">
            <h2 id="passo-2" className="passo-titulo">
              Monte o seu gancho
            </h2>
            {temLacuna && <p className="dica">Escreva nas lacunas em vermelho e copie a frase pronta.</p>}
            <p className="gancho gancho-editavel">
              <GanchoEditavel gancho={dia.gancho} valores={lacunas} onMudar={setLacunas} />
            </p>
            <p>
              <button
                type="button"
                className="botao botao-primario"
                onClick={() => copiar("gancho", montarGancho(dia.gancho, lacunas))}
              >
                {copiado === "gancho" ? "Gancho copiado" : "Copiar gancho"}
              </button>
            </p>

            {dia.exemplos.length > 0 && (
              <div className="subbloco">
                <h3 className="subtitulo">Exemplos de outros nichos</h3>
                <ul className="exemplos">
                  {dia.exemplos.map((ex, i) => (
                    <li key={i} className="exemplo">
                      <span className="etiqueta">{ex.nicho || "Sem nicho"}</span>
                      <span className="exemplo-texto">{ex.texto}</span>
                      <button type="button" className="botao-texto" onClick={() => copiar(`ex${i}`, ex.texto)}>
                        {copiado === `ex${i}` ? "Copiado" : "Copiar"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="subbloco">
              <h3 className="subtitulo">Gerar para o seu nicho</h3>
              <form
                className="ia-formulario"
                onSubmit={(e) => {
                  e.preventDefault();
                  gerar();
                }}
              >
                <label className="campo">
                  <span className="rotulo">Seu nicho</span>
                  <input
                    value={nichoCampo}
                    onChange={(e) => setNichoCampo(e.target.value)}
                    placeholder="Nutricionista, advogada, marceneiro"
                  />
                </label>
                <button type="submit" className="botao botao-secundario" disabled={geracao.estado === "gerando"}>
                  {geracao.estado === "gerando" ? "Gerando" : "Gerar 3 ganchos"}
                </button>
              </form>
              <div aria-live="polite">
                {geracao.estado === "erro" && <p className="mensagem-erro">{geracao.mensagem}</p>}
                {geracao.estado === "pronto" && (
                  <ul className="exemplos exemplos-gerados">
                    {geracao.exemplos.map((texto, i) => (
                      <li key={i} className="exemplo">
                        <span className="etiqueta">{geracao.nicho}</span>
                        <span className="exemplo-texto">{texto}</span>
                        <button type="button" className="botao-texto" onClick={() => copiar(`ia${i}`, texto)}>
                          {copiado === `ia${i}` ? "Copiado" : "Copiar"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </li>

        <li className="passo">
          <span className="passo-numero" aria-hidden="true">3</span>
          <section className="passo-corpo" aria-labelledby="passo-3">
            <h2 id="passo-3" className="passo-titulo">
              Grave e marque
            </h2>
            <button
              type="button"
              className="marcador marcador-grande"
              aria-pressed={gravado}
              onClick={() => alternarGravado(dia.id)}
            >
              <span className="marcador-caixa" aria-hidden="true" />
              <span className="marcador-texto">{gravado ? "Gravado. Clique para desmarcar" : "Marcar como gravado"}</span>
            </button>
            {emEquipe(modo) && (
              <p className="quem-gravou">
                {quem.length > 0 ? (
                  <>
                    <Gravadores ids={quem} perfis={perfis} />
                    <span aria-hidden="true">Gravado por {quem.map((id) => nomeDe(perfis[id])).join(", ")}</span>
                  </>
                ) : (
                  <span className="sem-dado">Ninguém da equipe gravou este dia ainda.</span>
                )}
              </p>
            )}
            {gravado && seguinte && (
              <p>
                <Link to={`/dia/${seguinte.numero}`} className="link">
                  Ir para o dia {seguinte.numero}
                </Link>
              </p>
            )}
          </section>
        </li>
      </ol>
    </article>
  );
}
