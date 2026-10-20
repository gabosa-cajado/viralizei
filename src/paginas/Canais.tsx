import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { faixaOutlier, outlierLegivel } from "../../supabase/functions/gerar-roteiro/comum";
import { VideoTelaInteira } from "../componentes/Video";
import { useEstado } from "../dados/armazenamento";
import {
  adicionarCanal,
  atualizarYouTube,
  FILTRO_PADRAO,
  lerCanais,
  lerCanalDoTexto,
  lerVideos,
  levarParaEtapas,
  nomeRede,
  numeroCurto,
  pausarCanal,
  REDES,
  removerCanal,
  tituloDoVideo,
  type Canal,
  type Filtro,
  type Rede,
  type VideoCanal,
} from "../dados/canais";
import { criarIdeia } from "../dados/laboratorio";
import { lerReferencia } from "../dados/referencia";

const NOTAS = [1.2, 2, 3, 5];
const PERIODOS = [
  { dias: 0, nome: "Desde sempre" },
  { dias: 30, nome: "Últimos 30 dias" },
  { dias: 90, nome: "Últimos 90 dias" },
];

function dataCurta(iso: string | null) {
  if (!iso) return "sem data";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

function quandoColetado(c: Canal) {
  if (c.erro_coleta) return `Erro: ${c.erro_coleta}`;
  if (!c.coletado_em) return "Ainda não coletado";
  return `Coletado em ${dataCurta(c.coletado_em)}`;
}

export function Canais() {
  const { modo } = useEstado();
  const navigate = useNavigate();
  const [canais, setCanais] = useState<Canal[]>([]);
  const [videos, setVideos] = useState<VideoCanal[]>([]);
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aberto, setAberto] = useState<VideoCanal | null>(null);
  const [viraramIdeia, setViraramIdeia] = useState<Set<string>>(new Set());
  const [novo, setNovo] = useState("");
  const [novaRede, setNovaRede] = useState<Rede>("instagram");
  const [novoNome, setNovoNome] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState<string | null>(null);

  const porId = useMemo(() => new Map(canais.map((c) => [c.id, c])), [canais]);

  useEffect(() => {
    if (modo !== "site") {
      setCarregando(false);
      return;
    }
    let vivo = true;
    lerCanais()
      .then((cs) => vivo && setCanais(cs))
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [modo]);

  useEffect(() => {
    if (modo !== "site" || carregando) return;
    let vivo = true;
    setBuscando(true);
    lerVideos(filtro, canais)
      .then((vs) => vivo && setVideos(vs))
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setBuscando(false));
    return () => {
      vivo = false;
    };
  }, [modo, carregando, filtro, canais]);

  const lido = lerCanalDoTexto(novo, novaRede);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    if (!lido) return;
    setErro("");
    setAviso("");
    try {
      const c = await adicionarCanal(lido.rede, lido.handle, novoNome);
      setCanais((cs) => [...cs, c].sort((a, b) => (a.nome || a.handle).localeCompare(b.nome || b.handle)));
      setNovo("");
      setNovoNome("");
      if (c.rede === "youtube") {
        setAviso(`@${c.handle} entrou na lista. Buscando os shorts dele agora (leva uns segundos).`);
        const r = await atualizarYouTube(c.id);
        setCanais(await lerCanais());
        setAviso(r[0]?.erro ? `@${c.handle}: ${r[0].erro}.` : `@${c.handle}: ${r[0]?.videos ?? 0} shorts lidos.`);
      } else {
        setAviso(`@${c.handle} entrou na lista. ${nomeRede(c.rede)} é coletado pela rotina no Chrome do autor; os vídeos aparecem depois da próxima coleta.`);
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function atualizarTodos() {
    setErro("");
    setAviso("");
    setAtualizando(true);
    try {
      const r = await atualizarYouTube();
      setCanais(await lerCanais());
      const falhas = r.filter((x) => x.erro);
      setAviso(
        r.length === 0
          ? "Nenhum canal do YouTube na lista ainda."
          : `${r.length - falhas.length} de ${r.length} canais do YouTube atualizados.${falhas.length ? ` Com problema: ${falhas.map((f) => `@${f.handle} (${f.erro})`).join("; ")}.` : ""}`,
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAtualizando(false);
    }
  }

  async function alternar(c: Canal) {
    try {
      await pausarCanal(c.id, !c.ativo);
      setCanais((cs) => cs.map((x) => (x.id === c.id ? { ...x, ativo: !c.ativo } : x)));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function remover(c: Canal) {
    try {
      await removerCanal(c.id);
      setCanais((cs) => cs.filter((x) => x.id !== c.id));
      setConfirmarRemover(null);
      if (filtro.canalId === c.id) setFiltro((f) => ({ ...f, canalId: "" }));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function virarIdeia(v: VideoCanal) {
    const c = porId.get(v.canal_id);
    try {
      await criarIdeia(
        true,
        `Vídeo fora da curva: ${c ? c.nome || "@" + c.handle : "canal acompanhado"} teve ${numeroCurto(v.views)} views, ${outlierLegivel(v.outlier)} a mediana do canal. Legenda: "${tituloDoVideo(v.legenda, 300)}". Como fazer a nossa versão?`,
        v.url,
      );
      setViraramIdeia((s) => new Set(s).add(v.id));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function roteiroEmEtapas(v: VideoCanal) {
    levarParaEtapas(v, porId.get(v.canal_id));
    navigate("/roteiro");
  }

  if (modo === "carregando") {
    return (
      <section className="vazio" aria-busy="true">
        <p className="vazio-titulo">Abrindo o Viralizei</p>
      </section>
    );
  }

  if (modo !== "site") {
    return (
      <section className="vazio">
        <p className="vazio-titulo">A aba Canais existe só no site</p>
        <p className="vazio-texto">Os canais e as notas ficam no banco do site. Abra o Viralizei pelo site e entre com a sua conta.</p>
      </section>
    );
  }

  const referenciaAberta = aberto ? lerReferencia(aberto.url) : null;

  return (
    <div className="canais">
      <section className="abertura" aria-labelledby="titulo-canais">
        <p className="abertura-numero" aria-hidden="true">x</p>
        <div className="abertura-texto">
          <h1 id="titulo-canais" className="rotulo">Canais</h1>
          <p className="abertura-gancho">Os vídeos que mais passaram do normal do próprio canal.</p>
          <p className="radar-resumo">
            A nota é views ÷ mediana de views do canal (os 30 vídeos mais recentes com mais de 2 dias). 1x é um vídeo comum
            daquele canal; 2x ou mais é fora da curva, e é aí que mora a ideia que vale copiar o mecanismo. Viu um bom?
            Mande para o <Link to="/laboratorio" className="link">Laboratório</Link> ou direto para o{" "}
            <Link to="/roteiro" className="link">Roteiro em etapas</Link>.
          </p>
        </div>
      </section>

      <div className="ferramentas canais-filtros">
        <label className="campo campo-compacto">
          <span className="rotulo">Canal</span>
          <select value={filtro.canalId} onChange={(e) => setFiltro((f) => ({ ...f, canalId: e.target.value }))}>
            <option value="">Todos</option>
            {canais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome || `@${c.handle}`} · {nomeRede(c.rede)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo-compacto">
          <span className="rotulo">Rede</span>
          <select value={filtro.rede} onChange={(e) => setFiltro((f) => ({ ...f, rede: e.target.value as Filtro["rede"] }))} disabled={!!filtro.canalId}>
            <option value="">Todas</option>
            {REDES.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </label>
        <label className="campo campo-compacto">
          <span className="rotulo">Nota mínima</span>
          <select value={filtro.notaMinima} onChange={(e) => setFiltro((f) => ({ ...f, notaMinima: Number(e.target.value) }))}>
            {NOTAS.map((n) => (
              <option key={n} value={n}>{outlierLegivel(n)} ou mais</option>
            ))}
          </select>
        </label>
        <label className="campo campo-compacto">
          <span className="rotulo">Publicados</span>
          <select value={filtro.dias} onChange={(e) => setFiltro((f) => ({ ...f, dias: Number(e.target.value) }))}>
            {PERIODOS.map((p) => (
              <option key={p.dias} value={p.dias}>{p.nome}</option>
            ))}
          </select>
        </label>
      </div>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {aviso && <p className="campo-ajuda canais-aviso" role="status">{aviso}</p>}

      {carregando || buscando ? (
        <p className="sem-dado radar-vazio">Buscando os vídeos.</p>
      ) : videos.length === 0 ? (
        <div className="vazio vazio-lista">
          <p className="vazio-texto">
            {canais.length === 0
              ? "Nenhum canal na lista ainda. Adicione o primeiro aqui embaixo."
              : "Nenhum vídeo com essa nota no filtro escolhido. Baixe a nota mínima ou amplie o período."}
          </p>
        </div>
      ) : (
        <ol className="canais-videos">
          {videos.map((v) => {
            const c = porId.get(v.canal_id);
            const faixa = faixaOutlier(v.outlier);
            return (
              <li key={v.id} className="canal-video">
                <p className={`canal-video-nota canal-nota-${faixa ?? "sem"}`} title="Views ÷ mediana de views do canal">
                  <span className="mono">{outlierLegivel(v.outlier)}</span>
                  <span className="canal-video-nota-rotulo">a mediana</span>
                </p>
                <div className="canal-video-corpo">
                  <p className="canal-video-meta">
                    <span>{c ? c.nome || `@${c.handle}` : "Canal"}</span>
                    <span>{c ? nomeRede(c.rede) : ""}</span>
                    <span title={v.data_estimada ? "Data em que o vídeo apareceu na coleta (até 1 dia de diferença)" : undefined}>
                      {v.data_estimada ? "~" : ""}
                      {dataCurta(v.publicado_em)}
                    </span>
                  </p>
                  <h2 className="canal-video-titulo">{tituloDoVideo(v.legenda)}</h2>
                  <p className="canal-video-numeros mono">
                    {numeroCurto(v.views)} views
                    {v.engajamento != null && ` · ${v.engajamento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% engajamento`}
                    {c?.mediana_views != null && ` · mediana do canal ${numeroCurto(Math.round(c.mediana_views))}`}
                  </p>
                  <p className="canal-video-acoes">
                    {lerReferencia(v.url) && (
                      <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setAberto(v)}>
                        Ver
                      </button>
                    )}
                    <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => roteiroEmEtapas(v)}>
                      Roteiro em etapas
                    </button>
                    {viraramIdeia.has(v.id) ? (
                      <Link className="link canal-video-feito" to="/laboratorio">Está no Laboratório</Link>
                    ) : (
                      <button type="button" className="botao-texto" onClick={() => void virarIdeia(v)}>
                        Virar ideia
                      </button>
                    )}
                    <a className="link" href={v.url} target="_blank" rel="noreferrer">Abrir na rede</a>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="canais-lista" aria-labelledby="titulo-canais-lista">
        <div className="ferramentas">
          <h2 id="titulo-canais-lista" className="ferramentas-titulo">Canais acompanhados ({canais.length})</h2>
          <button type="button" className="botao botao-secundario botao-pequeno" disabled={atualizando} onClick={() => void atualizarTodos()}>
            {atualizando ? "Atualizando o YouTube" : "Atualizar YouTube agora"}
          </button>
        </div>
        <p className="campo-ajuda">
          YouTube atualiza sozinho todo dia às 6h40. Instagram e TikTok pedem login e entram pela rotina no Chrome do autor.
        </p>

        <form className="canais-adicionar" onSubmit={(e) => void adicionar(e)}>
          <label className="campo">
            <span className="rotulo">Link do perfil ou @</span>
            <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: youtube.com/@primorico ou @tarik_lopes" />
          </label>
          <label className="campo">
            <span className="rotulo">Rede (para @ sem link)</span>
            <select value={novaRede} onChange={(e) => setNovaRede(e.target.value as Rede)}>
              {REDES.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo">Nome (opcional)</span>
            <input value={novoNome} maxLength={120} onChange={(e) => setNovoNome(e.target.value)} placeholder="Como aparece nos cartões" />
          </label>
          <p className="roteiro-acoes">
            <button type="submit" className="botao botao-primario" disabled={!lido}>
              {lido ? `Adicionar @${lido.handle} (${nomeRede(lido.rede)})` : "Adicionar canal"}
            </button>
          </p>
        </form>

        {canais.length > 0 && (
          <div className="tabela-rolagem">
            <table className="canais-tabela">
              <thead>
                <tr>
                  <th scope="col">Canal</th>
                  <th scope="col">Rede</th>
                  <th scope="col" className="numero">Mediana</th>
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="visualmente-oculto">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {canais.map((c) => (
                  <tr key={c.id} className={c.ativo ? "" : "canal-pausado"}>
                    <td>
                      <strong>{c.nome || `@${c.handle}`}</strong>
                      <span className="canal-handle">@{c.handle}</span>
                    </td>
                    <td>{nomeRede(c.rede)}</td>
                    <td className="numero mono">
                      {numeroCurto(c.mediana_views == null ? null : Math.round(c.mediana_views))}
                      <span className="canal-handle">{c.videos_na_mediana} vídeos</span>
                    </td>
                    <td className={c.erro_coleta ? "canal-erro" : ""}>{c.ativo ? quandoColetado(c) : "Pausado"}</td>
                    <td className="canal-acoes">
                      {confirmarRemover === c.id ? (
                        <span className="confirmacao">
                          Remover @{c.handle} e os vídeos dele?{" "}
                          <span className="confirmacao-acoes">
                            <button type="button" className="botao botao-perigo-cheio botao-pequeno" onClick={() => void remover(c)}>
                              Remover
                            </button>
                            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setConfirmarRemover(null)}>
                              Manter
                            </button>
                          </span>
                        </span>
                      ) : (
                        <>
                          <button type="button" className="botao-texto" onClick={() => void alternar(c)}>
                            {c.ativo ? "Pausar" : "Retomar"}
                          </button>
                          <button type="button" className="botao-texto botao-perigo" onClick={() => setConfirmarRemover(c.id)}>
                            Remover
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aberto && referenciaAberta && (
        <VideoTelaInteira referencia={referenciaAberta} titulo={tituloDoVideo(aberto.legenda)} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
