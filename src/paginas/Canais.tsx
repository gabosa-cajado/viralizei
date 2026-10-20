import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FORMATOS_HISTORIA,
  faixaOutlier,
  nomeFormato,
  nomeTipoGancho,
  outlierLegivel,
  TIPOS_GANCHO,
} from "../../supabase/functions/gerar-roteiro/comum";
import { VideoTelaInteira } from "../componentes/Video";
import { useEstado } from "../dados/armazenamento";
import {
  adicionarCanal,
  analisarVideos,
  atualizarYouTube,
  capaDoVideo,
  FILTRO_PADRAO,
  guardarFiltrosSalvos,
  lerCanais,
  lerCanalDoTexto,
  lerFavoritos,
  lerFiltrosSalvos,
  lerGanchos,
  lerVideos,
  levarParaEtapas,
  marcarFavorito,
  nomeRede,
  numeroCurto,
  ORDENS,
  pausarCanal,
  REDES,
  removerCanal,
  sugerirCanais,
  tituloDoVideo,
  type Canal,
  type CanalSugerido,
  type Filtro,
  type FiltroSalvo,
  type Rede,
  type VideoCanal,
} from "../dados/canais";
import { criarIdeia } from "../dados/laboratorio";
import { lerReferencia } from "../dados/referencia";

type Aba = "videos" | "ganchos" | "canais";

const PERIODOS = [
  { dias: 0, nome: "Desde sempre" },
  { dias: 7, nome: "Últimos 7 dias" },
  { dias: 30, nome: "Últimos 30 dias" },
  { dias: 90, nome: "Últimos 90 dias" },
  { dias: 365, nome: "Último ano" },
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

/** Campo numérico que aceita vazio (sem limite). */
function numeroOuNulo(texto: string): number | null {
  const t = texto.replace(/\./g, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const nomeDoCanal = (c: Canal | undefined) => (c ? c.nome || `@${c.handle}` : "Canal");

export function Canais() {
  const { modo } = useEstado();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>("videos");
  const [canais, setCanais] = useState<Canal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aberto, setAberto] = useState<VideoCanal | null>(null);
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());
  const [versao, setVersao] = useState(0);

  const porId = useMemo(() => new Map(canais.map((c) => [c.id, c])), [canais]);

  useEffect(() => {
    if (modo !== "site") {
      setCarregando(false);
      return;
    }
    let vivo = true;
    Promise.all([lerCanais(), lerFavoritos()])
      .then(([cs, fs]) => {
        if (!vivo) return;
        setCanais(cs);
        setFavoritos(fs);
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [modo]);

  async function alternarFavorito(v: VideoCanal) {
    const marcado = favoritos.has(v.id);
    try {
      await marcarFavorito(v.id, !marcado);
      setFavoritos((s) => {
        const n = new Set(s);
        if (marcado) n.delete(v.id);
        else n.add(v.id);
        return n;
      });
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
            daquele canal; 2x ou mais é fora da curva. Cada vídeo analisado vira um modelo de gancho que o{" "}
            <Link to="/roteiro" className="link">Roteiro em etapas</Link> usa.
          </p>
        </div>
      </section>

      <div className="ferramentas">
        <div className="abas" role="tablist" aria-label="O que ver">
          <button type="button" role="tab" className="aba" aria-selected={aba === "videos"} onClick={() => setAba("videos")}>
            Vídeos
          </button>
          <button type="button" role="tab" className="aba" aria-selected={aba === "ganchos"} onClick={() => setAba("ganchos")}>
            Ganchos
          </button>
          <button type="button" role="tab" className="aba" aria-selected={aba === "canais"} onClick={() => setAba("canais")}>
            Canais <span className="contagem">{canais.length}</span>
          </button>
        </div>
      </div>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {aviso && <p className="campo-ajuda canais-aviso" role="status">{aviso}</p>}

      {carregando ? (
        <p className="sem-dado radar-vazio">Carregando os canais.</p>
      ) : aba === "videos" ? (
        <AbaVideos
          canais={canais}
          porId={porId}
          favoritos={favoritos}
          versao={versao}
          onErro={setErro}
          onAviso={setAviso}
          onAbrir={setAberto}
          onFavorito={(v) => void alternarFavorito(v)}
          onRoteiro={roteiroEmEtapas}
          onAnalisou={() => setVersao((n) => n + 1)}
        />
      ) : aba === "ganchos" ? (
        <AbaGanchos
          porId={porId}
          favoritos={favoritos}
          versao={versao}
          onErro={setErro}
          onAbrir={setAberto}
          onFavorito={(v) => void alternarFavorito(v)}
          onRoteiro={roteiroEmEtapas}
        />
      ) : (
        <AbaCanais canais={canais} setCanais={setCanais} onErro={setErro} onAviso={setAviso} />
      )}

      {aberto && referenciaAberta && (
        <VideoTelaInteira referencia={referenciaAberta} titulo={aberto.gancho_texto || tituloDoVideo(aberto.legenda)} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}

// ---------- Vídeos ----------

interface PropsVideos {
  canais: Canal[];
  porId: Map<string, Canal>;
  favoritos: Set<string>;
  versao: number;
  onErro: (m: string) => void;
  onAviso: (m: string) => void;
  onAbrir: (v: VideoCanal) => void;
  onFavorito: (v: VideoCanal) => void;
  onRoteiro: (v: VideoCanal) => void;
  onAnalisou: () => void;
}

function AbaVideos({ canais, porId, favoritos, versao, onErro, onAviso, onAbrir, onFavorito, onRoteiro, onAnalisou }: PropsVideos) {
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_PADRAO);
  const [busca, setBusca] = useState("");
  const [mais, setMais] = useState(false);
  const [videos, setVideos] = useState<VideoCanal[]>([]);
  const [buscando, setBuscando] = useState(true);
  const [salvos, setSalvos] = useState<FiltroSalvo[]>(() => lerFiltrosSalvos());
  const [nomeSalvar, setNomeSalvar] = useState("");
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [viraramIdeia, setViraramIdeia] = useState<Set<string>>(new Set());

  // A busca por texto espera a pessoa parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f.busca === busca ? f : { ...f, busca })), 400);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let vivo = true;
    setBuscando(true);
    lerVideos(filtro, canais)
      .then((vs) => vivo && setVideos(vs))
      .catch((e: Error) => vivo && onErro(e.message))
      .finally(() => vivo && setBuscando(false));
    return () => {
      vivo = false;
    };
  }, [filtro, canais, versao, onErro]);

  const mudar = (p: Partial<Filtro>) => setFiltro((f) => ({ ...f, ...p }));
  const filtrosAtivos =
    [filtro.canalId, filtro.rede, filtro.notaMax, filtro.viewsMin, filtro.viewsMax, filtro.engMin, filtro.engMax, filtro.tipoGancho, filtro.formato].filter(
      (x) => x !== "" && x != null,
    ).length +
    (filtro.dias ? 1 : 0) +
    (filtro.soAnalisados ? 1 : 0);

  function salvarFiltro(e: FormEvent) {
    e.preventDefault();
    const nome = nomeSalvar.trim().slice(0, 40);
    if (!nome) return;
    const l = [{ nome, filtro }, ...salvos.filter((s) => s.nome !== nome)];
    setSalvos(l);
    guardarFiltrosSalvos(l);
    setNomeSalvar("");
  }

  function apagarFiltro(nome: string) {
    const l = salvos.filter((s) => s.nome !== nome);
    setSalvos(l);
    guardarFiltrosSalvos(l);
  }

  function aplicar(f: Filtro) {
    setFiltro(f);
    setBusca(f.busca);
  }

  async function analisar(ids?: string[]) {
    onErro("");
    onAviso("");
    setAnalisando(ids?.[0] ?? "todos");
    try {
      const r = await analisarVideos(ids);
      onAviso(r.aviso ?? `${r.analisados} ${r.analisados === 1 ? "vídeo analisado" : "vídeos analisados"}. O gancho de cada um entrou na aba Ganchos.`);
      onAnalisou();
    } catch (e) {
      onErro((e as Error).message);
    } finally {
      setAnalisando(null);
    }
  }

  async function virarIdeia(v: VideoCanal) {
    const c = porId.get(v.canal_id);
    try {
      await criarIdeia(
        true,
        `Vídeo fora da curva: ${nomeDoCanal(c)} teve ${numeroCurto(v.views)} views, ${outlierLegivel(v.outlier)} a mediana do canal. ${
          v.gancho_texto ? `Gancho: "${v.gancho_texto}".` : `Legenda: "${tituloDoVideo(v.legenda, 300)}".`
        }${v.analise?.angulo ? ` Ângulo: ${v.analise.angulo}` : ""} Como fazer a nossa versão?`,
        v.url,
      );
      setViraramIdeia((s) => new Set(s).add(v.id));
    } catch (e) {
      onErro((e as Error).message);
    }
  }

  return (
    <section className="canais-videos-aba" aria-label="Vídeos fora da curva">
      <div className="canais-busca">
        <label className="campo canais-busca-campo">
          <span className="rotulo">Buscar na legenda, no gancho e no tema</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: dívida, IA, primeiro emprego" />
        </label>
        <label className="campo campo-compacto">
          <span className="rotulo">Ordem</span>
          <select value={filtro.ordem} onChange={(e) => mudar({ ordem: e.target.value as Filtro["ordem"] })}>
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </label>
        <label className="campo campo-compacto">
          <span className="rotulo">Nota mínima</span>
          <select value={filtro.notaMin ?? ""} onChange={(e) => mudar({ notaMin: numeroOuNulo(e.target.value) })}>
            <option value="">Qualquer</option>
            {[1, 1.5, 2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>{outlierLegivel(n)} ou mais</option>
            ))}
          </select>
        </label>
        <button type="button" className="botao botao-secundario botao-pequeno" aria-expanded={mais} onClick={() => setMais((m) => !m)}>
          {mais ? "Menos filtros" : `Mais filtros${filtrosAtivos ? ` (${filtrosAtivos})` : ""}`}
        </button>
      </div>

      {mais && (
        <div className="canais-mais-filtros">
          <label className="campo campo-compacto">
            <span className="rotulo">Canal</span>
            <select value={filtro.canalId} onChange={(e) => mudar({ canalId: e.target.value })}>
              <option value="">Todos</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>{nomeDoCanal(c)} · {nomeRede(c.rede)}</option>
              ))}
            </select>
          </label>
          <label className="campo campo-compacto">
            <span className="rotulo">Rede</span>
            <select value={filtro.rede} onChange={(e) => mudar({ rede: e.target.value as Filtro["rede"] })} disabled={!!filtro.canalId}>
              <option value="">Todas</option>
              {REDES.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
          </label>
          <label className="campo campo-compacto">
            <span className="rotulo">Publicados</span>
            <select value={filtro.dias} onChange={(e) => mudar({ dias: Number(e.target.value) })}>
              {PERIODOS.map((p) => (
                <option key={p.dias} value={p.dias}>{p.nome}</option>
              ))}
            </select>
          </label>
          <Faixa rotulo="Nota (x a mediana)" min={filtro.notaMin} max={filtro.notaMax} onMin={(n) => mudar({ notaMin: n })} onMax={(n) => mudar({ notaMax: n })} />
          <Faixa rotulo="Views" min={filtro.viewsMin} max={filtro.viewsMax} onMin={(n) => mudar({ viewsMin: n })} onMax={(n) => mudar({ viewsMax: n })} />
          <Faixa rotulo="Engajamento (%)" min={filtro.engMin} max={filtro.engMax} onMin={(n) => mudar({ engMin: n })} onMax={(n) => mudar({ engMax: n })} />
          <label className="campo campo-compacto">
            <span className="rotulo">Tipo de gancho</span>
            <select value={filtro.tipoGancho} onChange={(e) => mudar({ tipoGancho: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS_GANCHO.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </label>
          <label className="campo campo-compacto">
            <span className="rotulo">Formato</span>
            <select value={filtro.formato} onChange={(e) => mudar({ formato: e.target.value })}>
              <option value="">Todos</option>
              {FORMATOS_HISTORIA.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </label>
          <label className="etapa-marcar canais-marcar">
            <input type="checkbox" checked={filtro.soAnalisados} onChange={(e) => mudar({ soAnalisados: e.target.checked })} />
            Só analisados pela IA
          </label>
          <p className="canais-filtros-acoes">
            <button type="button" className="botao-texto" onClick={() => aplicar(FILTRO_PADRAO)}>
              Limpar filtros
            </button>
          </p>
          <form className="canais-salvar-filtro" onSubmit={salvarFiltro}>
            <label className="campo campo-compacto">
              <span className="rotulo">Salvar este filtro como</span>
              <input value={nomeSalvar} maxLength={40} onChange={(e) => setNomeSalvar(e.target.value)} placeholder="Ex.: dinheiro, últimos 30 dias" />
            </label>
            <button type="submit" className="botao botao-secundario botao-pequeno" disabled={!nomeSalvar.trim()}>
              Salvar filtro
            </button>
          </form>
        </div>
      )}

      {salvos.length > 0 && (
        <ul className="canais-salvos" aria-label="Filtros salvos">
          {salvos.map((s) => (
            <li key={s.nome}>
              <button type="button" className="canais-salvo" onClick={() => aplicar(s.filtro)}>{s.nome}</button>
              <button type="button" className="canais-salvo-apagar" aria-label={`Apagar o filtro ${s.nome}`} onClick={() => apagarFiltro(s.nome)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="ferramentas canais-contagem">
        <p className="campo-ajuda" role="status">
          {buscando ? "Buscando os vídeos." : `${videos.length}${videos.length === 150 ? "+" : ""} ${videos.length === 1 ? "vídeo" : "vídeos"}`}
        </p>
        <button type="button" className="botao botao-secundario botao-pequeno" disabled={!!analisando} onClick={() => void analisar()}>
          {analisando === "todos" ? "Analisando (até 1 min)" : "Analisar os maiores sem análise"}
        </button>
      </div>

      {!buscando && videos.length === 0 ? (
        <div className="vazio vazio-lista">
          <p className="vazio-texto">
            {canais.length === 0
              ? "Nenhum canal na lista ainda. Adicione o primeiro na aba Canais."
              : "Nenhum vídeo nesse filtro. Baixe a nota mínima, limpe a busca ou amplie o período."}
          </p>
        </div>
      ) : (
        <ol className="canais-grade" aria-busy={buscando}>
          {videos.map((v) => (
            <CartaoVideo
              key={v.id}
              v={v}
              canal={porId.get(v.canal_id)}
              favorito={favoritos.has(v.id)}
              analisando={analisando === v.id}
              virouIdeia={viraramIdeia.has(v.id)}
              onAbrir={() => onAbrir(v)}
              onFavorito={() => onFavorito(v)}
              onRoteiro={() => onRoteiro(v)}
              onIdeia={() => void virarIdeia(v)}
              onAnalisar={() => void analisar([v.id])}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function Faixa({ rotulo, min, max, onMin, onMax }: { rotulo: string; min: number | null; max: number | null; onMin: (n: number | null) => void; onMax: (n: number | null) => void }) {
  return (
    <fieldset className="canais-faixa">
      <legend className="rotulo">{rotulo}</legend>
      <input inputMode="decimal" aria-label={`${rotulo}: de`} placeholder="de" defaultValue={min ?? ""} key={`min-${min}`} onBlur={(e) => onMin(numeroOuNulo(e.target.value))} />
      <span aria-hidden="true">até</span>
      <input inputMode="decimal" aria-label={`${rotulo}: até`} placeholder="sem limite" defaultValue={max ?? ""} key={`max-${max}`} onBlur={(e) => onMax(numeroOuNulo(e.target.value))} />
    </fieldset>
  );
}

interface PropsCartao {
  v: VideoCanal;
  canal: Canal | undefined;
  favorito: boolean;
  analisando: boolean;
  virouIdeia: boolean;
  onAbrir: () => void;
  onFavorito: () => void;
  onRoteiro: () => void;
  onIdeia: () => void;
  onAnalisar: () => void;
}

function CartaoVideo({ v, canal, favorito, analisando, virouIdeia, onAbrir, onFavorito, onRoteiro, onIdeia, onAnalisar }: PropsCartao) {
  const [semCapa, setSemCapa] = useState(false);
  const capa = capaDoVideo(v);
  const faixa = faixaOutlier(v.outlier);
  const titulo = v.gancho_texto || tituloDoVideo(v.legenda);
  const tocavel = !!lerReferencia(v.url);
  return (
    <li className="canal-cartao">
      <button type="button" className="canal-capa" onClick={onAbrir} disabled={!tocavel} aria-label={`Ver o vídeo: ${titulo}`}>
        {capa && !semCapa ? (
          <img
            src={capa}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const img = e.currentTarget;
              // Short sem capa vertical: cai para a horizontal; sem nenhuma, fica o bloco de cor.
              if (img.src.includes("oardefault")) img.src = img.src.replace("oardefault", "hqdefault");
              else setSemCapa(true);
            }}
          />
        ) : (
          <span className="canal-capa-vazia">{nomeRede(canal?.rede ?? "")}</span>
        )}
        <span className={`canal-capa-nota canal-nota-${faixa ?? "sem"}`} title="Views ÷ mediana de views do canal">
          {outlierLegivel(v.outlier)}
        </span>
        {v.duracao_seg != null && <span className="canal-capa-duracao mono">{Math.round(v.duracao_seg)} s</span>}
      </button>
      <div className="canal-cartao-corpo">
        <p className="canal-video-meta">
          <span>{nomeDoCanal(canal)}</span>
          <span>{canal ? nomeRede(canal.rede) : ""}</span>
          <span title={v.data_estimada ? "Data em que o vídeo apareceu na coleta (até 1 dia de diferença)" : undefined}>
            {v.data_estimada ? "~" : ""}
            {dataCurta(v.publicado_em)}
          </span>
        </p>
        <h2 className="canal-video-titulo">{titulo}</h2>
        <p className="canal-video-numeros mono">
          {numeroCurto(v.views)} views
          {v.engajamento != null && ` · ${v.engajamento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% eng.`}
          {canal?.mediana_views != null && ` · mediana ${numeroCurto(Math.round(canal.mediana_views))}`}
        </p>
        {v.gancho_modelo && (
          <div className="canal-modelo">
            <p className="canal-modelo-texto">{v.gancho_modelo}</p>
            <p className="canal-etiquetas">
              {v.gancho_tipo && <span className="etiqueta">{nomeTipoGancho(v.gancho_tipo)}</span>}
              {v.formato && <span className="etiqueta">{nomeFormato(v.formato)}</span>}
            </p>
          </div>
        )}
        {v.analise && (
          <details className="canal-analise">
            <summary>Ver análise</summary>
            <dl>
              {v.analise.tema && (
                <>
                  <dt>Tema</dt>
                  <dd>{v.analise.tema}</dd>
                </>
              )}
              {v.analise.ideia && (
                <>
                  <dt>Ideia</dt>
                  <dd>{v.analise.ideia}</dd>
                </>
              )}
              {v.analise.angulo && (
                <>
                  <dt>Ângulo</dt>
                  <dd>{v.analise.angulo}</dd>
                </>
              )}
              {v.analise.crenca && (
                <>
                  <dt>Crença que desafia</dt>
                  <dd>{v.analise.crenca}</dd>
                </>
              )}
              {v.analise.prova && (
                <>
                  <dt>Prova</dt>
                  <dd>{v.analise.prova}</dd>
                </>
              )}
            </dl>
          </details>
        )}
        <p className="canal-video-acoes">
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={onRoteiro}>
            Roteiro em etapas
          </button>
          {v.gancho_modelo ? (
            <button type="button" className="botao-texto" aria-pressed={favorito} onClick={onFavorito}>
              {favorito ? "Gancho favorito" : "Favoritar gancho"}
            </button>
          ) : (
            v.legenda.trim() && (
              <button type="button" className="botao-texto" disabled={analisando} onClick={onAnalisar}>
                {analisando ? "Analisando" : "Analisar"}
              </button>
            )
          )}
          {virouIdeia ? (
            <Link className="link canal-video-feito" to="/laboratorio">No Laboratório</Link>
          ) : (
            <button type="button" className="botao-texto" onClick={onIdeia}>
              Virar ideia
            </button>
          )}
          <a className="link" href={v.url} target="_blank" rel="noreferrer">Abrir na rede</a>
        </p>
      </div>
    </li>
  );
}

// ---------- Ganchos ----------

interface PropsGanchos {
  porId: Map<string, Canal>;
  favoritos: Set<string>;
  versao: number;
  onErro: (m: string) => void;
  onAbrir: (v: VideoCanal) => void;
  onFavorito: (v: VideoCanal) => void;
  onRoteiro: (v: VideoCanal) => void;
}

function AbaGanchos({ porId, favoritos, versao, onErro, onAbrir, onFavorito, onRoteiro }: PropsGanchos) {
  const [ganchos, setGanchos] = useState<VideoCanal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    lerGanchos()
      .then((g) => vivo && setGanchos(g))
      .catch((e: Error) => vivo && onErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [versao, onErro]);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of ganchos) if (g.gancho_tipo) m.set(g.gancho_tipo, (m.get(g.gancho_tipo) ?? 0) + 1);
    return m;
  }, [ganchos]);

  const termo = busca.trim().toLowerCase();
  const lista = ganchos
    .filter((g) => !tipo || g.gancho_tipo === tipo)
    .filter((g) => !soFavoritos || favoritos.has(g.id))
    .filter((g) => !termo || `${g.gancho_modelo} ${g.gancho_texto} ${g.analise?.tema ?? ""}`.toLowerCase().includes(termo))
    .sort((a, b) => Number(favoritos.has(b.id)) - Number(favoritos.has(a.id)));

  async function copiar(g: VideoCanal) {
    try {
      await navigator.clipboard.writeText(g.gancho_modelo ?? "");
      setCopiado(g.id);
      setTimeout(() => setCopiado((c) => (c === g.id ? null : c)), 2000);
    } catch {
      onErro("O navegador não deixou copiar. Selecione o texto e copie à mão.");
    }
  }

  if (carregando) return <p className="sem-dado radar-vazio">Carregando os ganchos.</p>;

  return (
    <section className="canais-ganchos" aria-label="Banco de ganchos">
      <p className="campo-ajuda">
        Cada vídeo analisado vira um modelo de gancho com lacunas (___). Os favoritos vêm primeiro aqui e na etapa de gancho do Roteiro em
        etapas.
      </p>
      <div className="canais-busca">
        <label className="campo canais-busca-campo">
          <span className="rotulo">Buscar gancho</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: dinheiro, erro, testei" />
        </label>
        <label className="etapa-marcar canais-marcar">
          <input type="checkbox" checked={soFavoritos} onChange={(e) => setSoFavoritos(e.target.checked)} />
          Só favoritos ({favoritos.size})
        </label>
      </div>
      <ul className="canais-tipos" aria-label="Tipos de gancho">
        <li>
          <button type="button" className="canais-tipo" aria-pressed={!tipo} onClick={() => setTipo("")}>
            Todos <span className="mono">{ganchos.length}</span>
          </button>
        </li>
        {TIPOS_GANCHO.filter((t) => contagem.get(t.id)).map((t) => (
          <li key={t.id}>
            <button type="button" className="canais-tipo" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
              {t.nome} <span className="mono">{contagem.get(t.id)}</span>
            </button>
          </li>
        ))}
      </ul>

      {lista.length === 0 ? (
        <div className="vazio vazio-lista">
          <p className="vazio-texto">
            {ganchos.length === 0 ? "Nenhum vídeo analisado ainda. Na aba Vídeos, clique em Analisar os maiores sem análise." : "Nenhum gancho nesse filtro."}
          </p>
        </div>
      ) : (
        <ol className="ganchos-lista">
          {lista.map((g) => {
            const c = porId.get(g.canal_id);
            const fav = favoritos.has(g.id);
            return (
              <li key={g.id} className={`gancho-modelo${fav ? " gancho-favorito" : ""}`}>
                <p className="gancho-modelo-texto">{g.gancho_modelo}</p>
                <p className="gancho-modelo-origem">
                  <span className={`canal-nota-${faixaOutlier(g.outlier) ?? "sem"}`}>
                    <span className="mono">{outlierLegivel(g.outlier)}</span>
                  </span>{" "}
                  · {nomeDoCanal(c)} · {numeroCurto(g.views)} views · original: “{g.gancho_texto}”
                </p>
                <p className="canal-etiquetas">
                  {g.gancho_tipo && <span className="etiqueta">{nomeTipoGancho(g.gancho_tipo)}</span>}
                  {g.formato && <span className="etiqueta">{nomeFormato(g.formato)}</span>}
                </p>
                <p className="canal-video-acoes">
                  <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => onRoteiro(g)}>
                    Usar no roteiro
                  </button>
                  <button type="button" className="botao-texto" aria-pressed={fav} onClick={() => onFavorito(g)}>
                    {fav ? "Favorito" : "Favoritar"}
                  </button>
                  <button type="button" className="botao-texto" onClick={() => void copiar(g)}>
                    {copiado === g.id ? "Copiado" : "Copiar"}
                  </button>
                  {lerReferencia(g.url) && (
                    <button type="button" className="botao-texto" onClick={() => onAbrir(g)}>
                      Ver o vídeo
                    </button>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ---------- Canais (lista e sugestões) ----------

interface PropsCanais {
  canais: Canal[];
  setCanais: (f: (cs: Canal[]) => Canal[]) => void;
  onErro: (m: string) => void;
  onAviso: (m: string) => void;
}

function AbaCanais({ canais, setCanais, onErro, onAviso }: PropsCanais) {
  const [novo, setNovo] = useState("");
  const [novaRede, setNovaRede] = useState<Rede>("instagram");
  const [novoNome, setNovoNome] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState<string | null>(null);
  const [termos, setTermos] = useState("");
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestoes, setSugestoes] = useState<{ buscas: string[]; canais: CanalSugerido[] } | null>(null);
  const [acompanhando, setAcompanhando] = useState<string | null>(null);

  const lido = lerCanalDoTexto(novo, novaRede);
  const ordenar = (cs: Canal[]) => [...cs].sort((a, b) => (a.nome || a.handle).localeCompare(b.nome || b.handle));
  const recarregar = async () => {
    const cs = await lerCanais();
    setCanais(() => cs);
  };

  async function entrar(rede: Rede, handle: string, nome: string) {
    onErro("");
    onAviso("");
    const c = await adicionarCanal(rede, handle, nome);
    setCanais((cs) => ordenar([...cs, c]));
    if (c.rede === "youtube") {
      onAviso(`@${c.handle} entrou na lista. Buscando os shorts dele agora (leva uns segundos).`);
      const r = await atualizarYouTube(c.id);
      await recarregar();
      onAviso(r[0]?.erro ? `@${c.handle}: ${r[0].erro}.` : `@${c.handle}: ${r[0]?.videos ?? 0} shorts lidos. Os vídeos já estão na aba Vídeos.`);
    } else {
      onAviso(`@${c.handle} entrou na lista. ${nomeRede(c.rede)} entra pela rotina de coleta; os vídeos aparecem depois da próxima coleta.`);
    }
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    if (!lido) return;
    try {
      await entrar(lido.rede, lido.handle, novoNome);
      setNovo("");
      setNovoNome("");
    } catch (er) {
      onErro((er as Error).message);
    }
  }

  async function acompanhar(s: CanalSugerido) {
    setAcompanhando(s.handle);
    try {
      await entrar("youtube", s.handle, s.nome);
      setSugestoes((x) => (x ? { ...x, canais: x.canais.filter((c) => c.handle !== s.handle) } : x));
    } catch (er) {
      onErro((er as Error).message);
    } finally {
      setAcompanhando(null);
    }
  }

  async function sugerir(e: FormEvent) {
    e.preventDefault();
    onErro("");
    setSugerindo(true);
    setSugestoes(null);
    try {
      setSugestoes(await sugerirCanais(termos));
    } catch (er) {
      onErro((er as Error).message);
    } finally {
      setSugerindo(false);
    }
  }

  async function atualizarTodos() {
    onErro("");
    onAviso("");
    setAtualizando(true);
    try {
      const r = await atualizarYouTube();
      await recarregar();
      const falhas = r.filter((x) => x.erro);
      onAviso(
        r.length === 0
          ? "Nenhum canal do YouTube na lista ainda."
          : `${r.length - falhas.length} de ${r.length} canais do YouTube atualizados.${falhas.length ? ` Com problema: ${falhas.map((f) => `@${f.handle} (${f.erro})`).join("; ")}.` : ""}`,
      );
    } catch (er) {
      onErro((er as Error).message);
    } finally {
      setAtualizando(false);
    }
  }

  async function alternar(c: Canal) {
    try {
      await pausarCanal(c.id, !c.ativo);
      setCanais((cs) => cs.map((x) => (x.id === c.id ? { ...x, ativo: !c.ativo } : x)));
    } catch (er) {
      onErro((er as Error).message);
    }
  }

  async function remover(c: Canal) {
    try {
      await removerCanal(c.id);
      setCanais((cs) => cs.filter((x) => x.id !== c.id));
      setConfirmarRemover(null);
    } catch (er) {
      onErro((er as Error).message);
    }
  }

  return (
    <>
      <section className="canais-sugestoes" aria-labelledby="titulo-sugestoes">
        <h2 id="titulo-sugestoes" className="ferramentas-titulo">Achar canais do nicho</h2>
        <p className="campo-ajuda">
          Busca Shorts no YouTube pelos temas (ou pelo nicho da <Link to="/persona" className="link">Persona</Link>, se ficar vazio), descobre de
          quem são e mede cada canal: quem tem vídeos bem acima da própria mediana aparece primeiro. Leva até 2 minutos.
        </p>
        <form className="canais-sugerir" onSubmit={(e) => void sugerir(e)}>
          <label className="campo">
            <span className="rotulo">Temas da busca (opcional, separados por vírgula)</span>
            <input value={termos} maxLength={300} onChange={(e) => setTermos(e.target.value)} placeholder="Ex.: renda extra, primeiro emprego, IA no trabalho" />
          </label>
          <button type="submit" className="botao botao-primario" disabled={sugerindo}>
            {sugerindo ? "Buscando canais (até 2 min)" : "Buscar canais"}
          </button>
        </form>
        {sugestoes && (
          <>
            <p className="campo-ajuda">Buscas usadas: {sugestoes.buscas.join(" · ")}</p>
            {sugestoes.canais.length === 0 ? (
              <p className="sem-dado">Nenhum canal novo nessas buscas. Tente outros temas.</p>
            ) : (
              <div className="tabela-rolagem">
                <table className="canais-tabela">
                  <thead>
                    <tr>
                      <th scope="col">Canal</th>
                      <th scope="col" className="numero">Maior nota</th>
                      <th scope="col" className="numero">Mediana</th>
                      <th scope="col">Melhor Short</th>
                      <th scope="col"><span className="visualmente-oculto">Ação</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugestoes.canais.map((s) => (
                      <tr key={s.handle}>
                        <td>
                          <strong>{s.nome || `@${s.handle}`}</strong>
                          <span className="canal-handle">
                            @{s.handle}
                            {s.seguidores != null && ` · ${numeroCurto(s.seguidores)} inscritos`}
                          </span>
                        </td>
                        <td className={`numero canal-nota-${faixaOutlier(s.maiorOutlier) ?? "sem"}`}>
                          <span className="mono">{outlierLegivel(s.maiorOutlier)}</span>
                          <span className="canal-handle">{s.foraDaCurva} acima de 2x</span>
                        </td>
                        <td className="numero mono">{numeroCurto(s.mediana == null ? null : Math.round(s.mediana))}</td>
                        <td>
                          {s.melhor ? (
                            <a className="link" href={s.melhor.url} target="_blank" rel="noreferrer">
                              {s.melhor.titulo || "Ver"}
                            </a>
                          ) : (
                            "—"
                          )}
                          {s.melhor?.views != null && <span className="canal-handle">{numeroCurto(s.melhor.views)} views</span>}
                        </td>
                        <td className="canal-acoes">
                          <button type="button" className="botao botao-secundario botao-pequeno" disabled={acompanhando === s.handle} onClick={() => void acompanhar(s)}>
                            {acompanhando === s.handle ? "Adicionando" : "Acompanhar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="canais-lista" aria-labelledby="titulo-canais-lista">
        <div className="ferramentas">
          <h2 id="titulo-canais-lista" className="ferramentas-titulo">Canais acompanhados ({canais.length})</h2>
          <button type="button" className="botao botao-secundario botao-pequeno" disabled={atualizando} onClick={() => void atualizarTodos()}>
            {atualizando ? "Atualizando o YouTube" : "Atualizar YouTube agora"}
          </button>
        </div>
        <p className="campo-ajuda">
          YouTube atualiza sozinho todo dia às 6h40, e os maiores outliers novos são analisados às 6h50. Instagram e TikTok entram pela rotina de
          coleta.
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
                      <strong>{nomeDoCanal(c)}</strong>
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
    </>
  );
}
