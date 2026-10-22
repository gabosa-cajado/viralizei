import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { diasOrdenados, useEstado } from "../dados/armazenamento";
import {
  apagarTrilha,
  CLIMAS,
  carregarTrilhas,
  desfazerUso,
  diasDesde,
  quandoLegivel,
  registrarUso,
  resumoDeUso,
  salvarTrilha,
  type Clima,
  type NovaTrilha,
  type Trilha,
  type UsoTrilha,
} from "../dados/trilhas";

type Aba = "lista" | "uso";
type Ordem = "reels" | "nosso" | "nome";

const VAZIA: NovaTrilha = {
  titulo: "",
  artista: "",
  link: "",
  clima: "reflexiva",
  instrumental: false,
  nacional: false,
  reelsTexto: "",
  observacao: "",
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function dataCurta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Usada há menos de uma semana: a lista pede para variar. */
const DIAS_PARA_VARIAR = 7;

export function Trilhas() {
  const { modo, meuId, perfisSite, conteudo } = useEstado();
  const noSite = modo === "site";
  const [trilhas, setTrilhas] = useState<Trilha[]>([]);
  const [usos, setUsos] = useState<UsoTrilha[]>([]);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("lista");
  const [clima, setClima] = useState<Clima | "">("");
  const [ordem, setOrdem] = useState<Ordem>("reels");
  const [busca, setBusca] = useState("");
  const [soInstrumental, setSoInstrumental] = useState(false);
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [diaDoUso, setDiaDoUso] = useState("");
  const [editando, setEditando] = useState<string | "nova" | null>(null);
  const [formulario, setFormulario] = useState<NovaTrilha>(VAZIA);
  const [apagando, setApagando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    try {
      const r = await carregarTrilhas(noSite);
      setTrilhas(r.trilhas);
      setUsos(r.usos);
      setEstado("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para carregar as trilhas.");
      setEstado("erro");
    }
  }

  useEffect(() => {
    if (modo !== "carregando" && modo !== "login") void carregar();
  }, [modo]);

  const resumo = useMemo(() => resumoDeUso(usos), [usos]);
  const dias = useMemo(() => diasOrdenados(conteudo), [conteudo]);
  const numeroDoDia = useMemo(() => Object.fromEntries(conteudo.dias.map((d) => [d.id, d.numero])), [conteudo]);
  const porId = useMemo(() => Object.fromEntries(trilhas.map((t) => [t.id, t])), [trilhas]);

  function quem(userId: string | null) {
    if (!userId || userId === meuId) return "você";
    return perfisSite[userId] || "um sócio";
  }

  const termo = semAcento(busca.trim());
  const visiveis = trilhas
    .filter((t) => !clima || t.clima === clima)
    .filter((t) => !soInstrumental || t.instrumental)
    .filter((t) => !termo || semAcento(`${t.titulo} ${t.artista} ${t.observacao}`).includes(termo))
    .sort((a, b) => {
      if (ordem === "nome") return a.titulo.localeCompare(b.titulo, "pt-BR");
      if (ordem === "nosso") return (resumo[b.id]?.vezes ?? 0) - (resumo[a.id]?.vezes ?? 0) || (b.reelsNumero ?? 0) - (a.reelsNumero ?? 0);
      return (b.reelsNumero ?? 0) - (a.reelsNumero ?? 0);
    });
  const filtrando = !!clima || !!termo || soInstrumental;

  const ranking = Object.entries(resumo)
    .filter(([id]) => porId[id])
    .sort(([, a], [, b]) => b.vezes - a.vezes)
    .slice(0, 10);

  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarUso(trilhaId: string) {
    if (await executar(() => registrarUso(noSite, trilhaId, diaDoUso || null))) {
      setRegistrando(null);
      setDiaDoUso("");
    }
  }

  function abrirFormulario(t?: Trilha) {
    setApagando(null);
    setRegistrando(null);
    if (t) {
      setEditando(t.id);
      setFormulario({
        titulo: t.titulo,
        artista: t.artista,
        link: t.link ?? "",
        clima: t.clima,
        instrumental: t.instrumental,
        nacional: t.nacional,
        reelsTexto: t.reelsTexto ?? "",
        observacao: t.observacao,
      });
    } else {
      setEditando("nova");
      setFormulario(VAZIA);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const id = editando === "nova" ? undefined : editando ?? undefined;
    if (await executar(() => salvarTrilha(noSite, formulario, id))) setEditando(null);
  }

  if (modo === "carregando") return <p className="sem-dado radar-vazio">Carregando.</p>;

  const formularioAberto = editando !== null && (
    <form className="trilha-formulario" onSubmit={(e) => void enviar(e)} aria-labelledby="titulo-form-trilha">
      <h2 id="titulo-form-trilha" className="passo-titulo">{editando === "nova" ? "Adicionar trilha" : "Editar trilha"}</h2>
      <div className="trilha-campos">
        <label className="campo">
          <span className="campo-rotulo">Música</span>
          <input value={formulario.titulo} onChange={(e) => setFormulario({ ...formulario, titulo: e.target.value })} required maxLength={200} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Artista</span>
          <input value={formulario.artista} onChange={(e) => setFormulario({ ...formulario, artista: e.target.value })} maxLength={200} />
        </label>
        <label className="campo trilha-campo-largo">
          <span className="campo-rotulo">Link do áudio</span>
          <input
            type="url"
            inputMode="url"
            value={formulario.link ?? ""}
            onChange={(e) => setFormulario({ ...formulario, link: e.target.value })}
            placeholder="https://www.instagram.com/reels/audio/…"
          />
          <span className="campo-ajuda">No reel, toque no nome da música e copie o link da página do áudio.</span>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Clima</span>
          <select value={formulario.clima} onChange={(e) => setFormulario({ ...formulario, clima: e.target.value as Clima })}>
            {(Object.keys(CLIMAS) as Clima[]).map((c) => <option key={c} value={c}>{CLIMAS[c].nome}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Reels com o áudio</span>
          <input value={formulario.reelsTexto ?? ""} onChange={(e) => setFormulario({ ...formulario, reelsTexto: e.target.value })} placeholder="430K" maxLength={12} />
          <span className="campo-ajuda">Como aparece na página do áudio.</span>
        </label>
        <label className="campo trilha-campo-largo">
          <span className="campo-rotulo">Observação</span>
          <input value={formulario.observacao} onChange={(e) => setFormulario({ ...formulario, observacao: e.target.value })} maxLength={500} placeholder="Ex.: o refrão entra em 0:12, cortar ali" />
        </label>
      </div>
      <div className="trilha-checks">
        <label className="trilha-check">
          <input type="checkbox" checked={formulario.instrumental} onChange={(e) => setFormulario({ ...formulario, instrumental: e.target.checked })} />
          Instrumental
        </label>
        <label className="trilha-check">
          <input type="checkbox" checked={formulario.nacional} onChange={(e) => setFormulario({ ...formulario, nacional: e.target.checked })} />
          Nacional
        </label>
      </div>
      <p className="roteiro-acoes">
        <button type="submit" className="botao botao-primario" disabled={ocupado}>{ocupado ? "Salvando" : "Salvar"}</button>
        <button type="button" className="botao botao-secundario" onClick={() => setEditando(null)}>Cancelar</button>
      </p>
    </form>
  );

  return (
    <div className="trilhas">
      <section className="abertura" aria-labelledby="titulo-trilhas">
        <p className="abertura-numero" aria-hidden="true">{String(trilhas.length).padStart(2, "0")}</p>
        <div className="abertura-texto">
          <h1 id="titulo-trilhas" className="rotulo">Trilhas do canal</h1>
          <p className="abertura-gancho">No nosso nicho, a voz vem antes da música.</p>
          <p className="radar-resumo">
            Aqui ficam só as músicas que a equipe escolheu para o canal. Adicione cada trilha que usarmos ou quisermos testar e clique em "Usei" ao
            publicar: a lista avisa quando for hora de variar.
          </p>
        </div>
      </section>

      <section className="trilhas-regras" aria-labelledby="titulo-regras">
        <h2 id="titulo-regras" className="passo-titulo">Antes de escolher</h2>
        <ol className="melhorias">
          <li><strong>Com fala, a voz manda.</strong> Música bem baixa, embaixo da fala, de preferência instrumental. Letra cantada disputa com o que você diz.</li>
          <li><strong>Sem fala, a música carrega o vídeo.</strong> Texto na tela, bastidor e antes e depois: corte nas batidas e deixe o gancho escrito já no primeiro segundo.</li>
          <li><strong>Ponha a música pelo app do Instagram.</strong> Assim o reel entra na página do áudio. Música embutida no arquivo pode ser silenciada por direito autoral.</li>
          <li><strong>Varie.</strong> A lista avisa quando a trilha foi usada por nós nos últimos {DIAS_PARA_VARIAR} dias.</li>
          <li><strong>Conta comercial vê menos músicas.</strong> Se a trilha não aparecer no app, troque por uma instrumental do mesmo clima.</li>
        </ol>
        <dl className="trilhas-climas">
          {(Object.keys(CLIMAS) as Clima[]).map((c) => (
            <div key={c}>
              <dt>{CLIMAS[c].nome}</dt>
              <dd>{CLIMAS[c].quando}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="ferramentas">
        <div className="abas" role="tablist" aria-label="Visões das trilhas">
          <button type="button" role="tab" className="aba" aria-selected={aba === "lista"} onClick={() => setAba("lista")}>
            Lista <span className="contagem">{trilhas.length}</span>
          </button>
          <button type="button" role="tab" className="aba" aria-selected={aba === "uso"} onClick={() => setAba("uso")}>
            Nosso uso <span className="contagem">{usos.length}</span>
          </button>
        </div>
        {aba === "lista" && (
          <div className="filtros trilhas-filtros">
            <label className="campo campo-compacto">
              <span className="visualmente-oculto">Clima</span>
              <select value={clima} onChange={(e) => setClima(e.target.value as Clima | "")}>
                <option value="">Todos os climas</option>
                {(Object.keys(CLIMAS) as Clima[]).map((c) => <option key={c} value={c}>{CLIMAS[c].nome}</option>)}
              </select>
            </label>
            <label className="campo campo-compacto">
              <span className="visualmente-oculto">Ordem</span>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
                <option value="reels">Mais reels no Instagram</option>
                <option value="nosso">Mais usada por nós</option>
                <option value="nome">Nome</option>
              </select>
            </label>
            <label className="campo campo-compacto busca">
              <span className="visualmente-oculto">Buscar</span>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar música" />
            </label>
            <label className="trilha-check">
              <input type="checkbox" checked={soInstrumental} onChange={(e) => setSoInstrumental(e.target.checked)} />
              Só instrumental
            </label>
          </div>
        )}
      </div>

      {erro && <p className="mensagem-erro trilhas-erro" role="alert">{erro}</p>}

      {estado === "carregando" ? (
        <p className="sem-dado radar-vazio">Buscando as trilhas.</p>
      ) : estado === "erro" ? null : aba === "lista" ? (
        <>
          <p className="trilhas-acoes">
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => abrirFormulario()} disabled={editando === "nova"}>
              Adicionar trilha
            </button>
            <span className="sem-dado">
              {noSite ? "A lista e o uso são da equipe toda." : "Fora do site, o que você acrescenta fica só neste navegador."}
            </span>
          </p>
          {editando === "nova" && formularioAberto}

          {visiveis.length === 0 ? (
            <div className="vazio vazio-lista">
              <p className="vazio-texto">{filtrando ? "Nenhuma trilha com esse filtro." : "Nenhuma trilha ainda. Adicione a primeira acima."}</p>
              {filtrando && (
                <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => { setClima(""); setBusca(""); setSoInstrumental(false); }}>
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <ol className="trilhas-lista">
              {visiveis.map((t, n) => {
                const r = resumo[t.id];
                const recente = r?.ultimo && diasDesde(r.ultimo.usadoEm) < DIAS_PARA_VARIAR;
                return (
                  <li key={t.id} className="trilha">
                    <span className="padrao-numero" aria-hidden="true">{String(n + 1).padStart(2, "0")}</span>
                    <div className="trilha-corpo">
                      <h3 className="trilha-titulo">{t.titulo}</h3>
                      <p className="trilha-artista">{t.artista}</p>
                      <p className="trilha-etiquetas">
                        <span className="trilha-etiqueta">{CLIMAS[t.clima].nome}</span>
                        {t.instrumental && <span className="trilha-etiqueta">Instrumental</span>}
                        {t.nacional && <span className="trilha-etiqueta">Nacional</span>}
                      </p>
                      <p className="trilha-numeros mono">
                        {t.reelsTexto ? `${t.reelsTexto} reels no Instagram` : "Reels não conferidos"}
                        {t.conferidoEm && ` · conferido em ${dataCurta(t.conferidoEm)}`}
                      </p>
                      {r && (
                        <p className={recente ? "trilha-uso trilha-uso-recente" : "trilha-uso"}>
                          Usada {r.vezes} {r.vezes === 1 ? "vez" : "vezes"} por nós; a última foi {quandoLegivel(r.ultimo!.usadoEm)}, por {quem(r.ultimo!.userId)}
                          {recente ? ". Varie esta semana." : "."}
                        </p>
                      )}
                      {t.observacao && <p className="trilha-observacao">{t.observacao}</p>}

                      {registrando === t.id && (
                        <div className="trilha-registro">
                          <label className="campo">
                            <span className="campo-rotulo">Em qual vídeo do calendário? (opcional)</span>
                            <select value={diaDoUso} onChange={(e) => setDiaDoUso(e.target.value)}>
                              <option value="">Fora do calendário</option>
                              {dias.map((d) => <option key={d.id} value={d.id}>Dia {d.numero}: {d.gancho.slice(0, 60)}</option>)}
                            </select>
                          </label>
                          <p className="roteiro-acoes">
                            <button type="button" className="botao botao-primario botao-pequeno" disabled={ocupado} onClick={() => void confirmarUso(t.id)}>
                              {ocupado ? "Registrando" : "Registrar uso"}
                            </button>
                            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setRegistrando(null)}>Cancelar</button>
                          </p>
                        </div>
                      )}

                      {apagando === t.id && (
                        <div className="confirmacao" role="alert">
                          <p>Apagar "{t.titulo}" da lista? O uso registrado dela também some.</p>
                          <p className="confirmacao-acoes">
                            <button type="button" className="botao botao-perigo-cheio botao-pequeno" disabled={ocupado} onClick={() => void executar(() => apagarTrilha(noSite, t.id)).then((ok) => ok && setApagando(null))}>
                              Apagar
                            </button>
                            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setApagando(null)}>Cancelar</button>
                          </p>
                        </div>
                      )}

                      {editando === t.id && formularioAberto}
                    </div>
                    <div className="trilha-acoes">
                      {t.link && <a className="botao botao-secundario botao-pequeno" href={t.link} target="_blank" rel="noreferrer">Ouvir</a>}
                      <button type="button" className="botao botao-primario botao-pequeno" onClick={() => { setRegistrando(t.id); setDiaDoUso(""); setEditando(null); setApagando(null); }} disabled={registrando === t.id}>
                        Usei
                      </button>
                      <button type="button" className="botao-texto" onClick={() => abrirFormulario(t)}>Editar</button>
                      <button type="button" className="botao-texto botao-perigo" onClick={() => { setEditando(null); setRegistrando(null); setApagando(t.id); }}>Apagar</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : usos.length === 0 ? (
        <div className="vazio vazio-lista">
          <p className="vazio-texto">Ninguém registrou uso ainda. Na lista, clique em "Usei" quando publicar um vídeo com a trilha; aqui aparece o que a equipe mais usa.</p>
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setAba("lista")}>Ir para a lista</button>
        </div>
      ) : (
        <div className="trilhas-uso">
          <section aria-labelledby="titulo-mais-usadas">
            <h2 id="titulo-mais-usadas" className="passo-titulo">Mais usadas por nós</h2>
            <ol className="trilhas-ranking">
              {ranking.map(([id, r]) => (
                <li key={id}>
                  <span className="trilha-titulo">{porId[id]!.titulo}</span>
                  <span className="sem-dado">{porId[id]!.artista}</span>
                  <span className="mono">{r.vezes}×</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="titulo-historico">
            <h2 id="titulo-historico" className="passo-titulo">Histórico</h2>
            <ul className="trilhas-historico">
              {usos.map((u) => {
                const t = porId[u.trilhaId];
                if (!t) return null;
                const meu = !u.userId || u.userId === meuId;
                return (
                  <li key={u.id}>
                    <span className="mono">{dataCurta(u.usadoEm)}</span>
                    <span className="trilhas-historico-corpo">
                      <strong>{t.titulo}</strong>, por {quem(u.userId)}
                      {u.diaId && numeroDoDia[u.diaId] !== undefined && (
                        <>
                          {" no "}
                          <Link to={`/dia/${numeroDoDia[u.diaId]}`} className="link">dia {numeroDoDia[u.diaId]}</Link>
                        </>
                      )}
                    </span>
                    {meu && (
                      <button type="button" className="botao-texto" disabled={ocupado} onClick={() => void executar(() => desfazerUso(noSite, u.id))}>
                        Desfazer
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
