import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FORMATOS_HISTORIA, nomeFormato, nomeTipoGancho } from "../../supabase/functions/gerar-roteiro/comum";
import { RoteiroSaida } from "../componentes/RoteiroSaida";
import { noArtefato } from "../dados/plataforma";
import { CTAS, FORMATOS_ROTEIRO } from "../dados/roteiro";
import {
  ajustarDuracao,
  apagarRoteiro,
  CONTRASTES,
  criarRoteiro,
  ETAPAS_VAZIAS,
  escreverComEtapas,
  lerRoteiros,
  lerVersoes,
  montarEsboco,
  NOME_ORIGEM,
  pesquisar,
  salvarEtapas,
  salvarVersao,
  sugerirGanchos,
  traduzir,
  type Etapas,
  type GanchoOpcao,
  type RoteiroSalvo,
  type Versao,
} from "../dados/roteiros";
import { noSite } from "../dados/site";

type Ocupado = "" | "pesquisa" | "ganchos" | "esboco" | "escrever" | "duracao" | "traducao";

const DURACOES = ["30", "45", "60", "90", "120"];

function quando(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Base vinda da aba Canais ("Roteiro em etapas" num vídeo fora da curva). */
function tirarBase(): string {
  try {
    const bruto = localStorage.getItem("pauta:etapas-base");
    if (!bruto) return "";
    localStorage.removeItem("pauta:etapas-base");
    return JSON.parse(bruto) as string;
  } catch {
    return "";
  }
}

function Inspiracao({ g }: { g: GanchoOpcao }) {
  if (/^https:\/\//.test(g.inspiracao)) {
    return (
      <a className="link" href={g.inspiracao} target="_blank" rel="noreferrer">
        vídeo fora da curva
      </a>
    );
  }
  if (g.diaCalendario != null) {
    return (
      <Link className="link" to={`/dia/${g.diaCalendario}`}>
        modelo do dia {g.diaCalendario}
      </Link>
    );
  }
  return <span>{g.inspiracao || "calendário"}</span>;
}

export function RoteiroEtapas() {
  const disponivel = noSite && !noArtefato;
  const [roteiros, setRoteiros] = useState<RoteiroSalvo[]>([]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapas>(ETAPAS_VAZIAS);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoId, setVersaoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<Ocupado>("");
  const [erro, setErro] = useState("");
  const [meuGancho, setMeuGancho] = useState({ textoNaTela: "", ganchoFalado: "" });
  const [novaDuracao, setNovaDuracao] = useState("30");
  const [idioma, setIdioma] = useState<"inglês" | "espanhol">("inglês");
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const mudouDesdeSalvar = useRef(false);

  useEffect(() => {
    if (!disponivel) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    const base = tirarBase();
    lerRoteiros()
      .then((rs) => {
        if (!vivo) return;
        setRoteiros(rs);
        if (base) {
          setEtapas({ ...ETAPAS_VAZIAS, base });
        } else if (rs[0]) {
          setAtualId(rs[0].id);
          setEtapas(rs[0].etapas);
        }
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [disponivel]);

  // Versões do roteiro aberto.
  useEffect(() => {
    if (!atualId) {
      setVersoes([]);
      setVersaoId(null);
      return;
    }
    let vivo = true;
    lerVersoes(atualId)
      .then((vs) => {
        if (!vivo) return;
        setVersoes(vs);
        setVersaoId(vs[0]?.id ?? null);
      })
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [atualId]);

  // Edição à mão (tema, anotações, esboço): guarda 1,5 s depois de parar de digitar.
  useEffect(() => {
    if (!atualId || !mudouDesdeSalvar.current) return;
    const t = setTimeout(() => {
      mudouDesdeSalvar.current = false;
      salvarEtapas(atualId, etapas).catch((e: Error) => setErro(e.message));
      setRoteiros((rs) => rs.map((r) => (r.id === atualId ? { ...r, etapas, titulo: etapas.tema.trim() || r.titulo } : r)));
    }, 1500);
    return () => clearTimeout(t);
  }, [etapas, atualId]);

  function mudar(parcial: Partial<Etapas>) {
    mudouDesdeSalvar.current = true;
    setEtapas((e) => ({ ...e, ...parcial }));
  }

  /** Guarda as etapas já (cria o roteiro na primeira vez) e devolve o id. */
  async function guardar(novas: Etapas): Promise<string> {
    mudouDesdeSalvar.current = false;
    if (atualId) {
      await salvarEtapas(atualId, novas);
      setRoteiros((rs) => rs.map((r) => (r.id === atualId ? { ...r, etapas: novas, titulo: novas.tema.trim() || r.titulo } : r)));
      return atualId;
    }
    const novo = await criarRoteiro(novas);
    setRoteiros((rs) => [novo, ...rs]);
    setAtualId(novo.id);
    return novo.id;
  }

  async function passo(qual: Ocupado, fazer: () => Promise<void>) {
    setErro("");
    setOcupado(qual);
    try {
      await fazer();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }

  const fazerPesquisa = () =>
    passo("pesquisa", async () => {
      const pesquisa = await pesquisar(etapas.tema.trim(), etapas.base.trim());
      const novas = { ...etapas, pesquisa };
      setEtapas(novas);
      await guardar(novas);
    });

  const fazerGanchos = () =>
    passo("ganchos", async () => {
      const ganchos = await sugerirGanchos(etapas);
      const novas = { ...etapas, ganchos };
      setEtapas(novas);
      await guardar(novas);
    });

  async function escolherGancho(g: GanchoOpcao) {
    const novas = { ...etapas, gancho: g, esboco: null };
    setEtapas(novas);
    try {
      await guardar(novas);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const fazerEsboco = () =>
    passo("esboco", async () => {
      const esboco = await montarEsboco(etapas);
      const novas = { ...etapas, esboco, formatoHistoria: esboco.formato };
      setEtapas(novas);
      await guardar(novas);
    });

  async function novaVersao(origem: Versao["origem"], nota: string, conteudo: Versao["conteudo"], id: string) {
    const v = await salvarVersao(id, origem, nota, conteudo);
    setVersoes((vs) => [v, ...vs]);
    setVersaoId(v.id);
  }

  const escrever = () =>
    passo("escrever", async () => {
      const id = await guardar(etapas);
      const r = await escreverComEtapas(etapas);
      await novaVersao("ia", `${etapas.duracao} s · ${etapas.formato}`, r, id);
    });

  const versao = versoes.find((v) => v.id === versaoId) ?? null;

  const mudarDuracao = () =>
    passo("duracao", async () => {
      if (!versao || !atualId) return;
      const r = await ajustarDuracao(versao.conteudo, novaDuracao);
      await novaVersao("duracao", `v${versao.numero} em ${novaDuracao} s`, r, atualId);
    });

  const fazerTraducao = () =>
    passo("traducao", async () => {
      if (!versao || !atualId) return;
      const r = await traduzir(versao.conteudo, idioma);
      await novaVersao("traducao", `v${versao.numero} em ${idioma}`, r, atualId);
    });

  function abrir(id: string) {
    const r = roteiros.find((x) => x.id === id);
    if (!r) return;
    setAtualId(r.id);
    setEtapas(r.etapas);
    setConfirmarApagar(false);
  }

  function novo() {
    setAtualId(null);
    setEtapas(ETAPAS_VAZIAS);
    setMeuGancho({ textoNaTela: "", ganchoFalado: "" });
    setConfirmarApagar(false);
  }

  async function apagar() {
    if (!atualId) return;
    try {
      await apagarRoteiro(atualId);
      const resto = roteiros.filter((r) => r.id !== atualId);
      setRoteiros(resto);
      setConfirmarApagar(false);
      if (resto[0]) abrir(resto[0].id);
      else novo();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (!disponivel) {
    return (
      <section className="vazio">
        <p className="vazio-titulo">O Roteiro em etapas existe só no site</p>
        <p className="vazio-texto">Ele usa a IA e guarda as versões no banco do site. Abra o Viralizei pelo site e entre com a sua conta.</p>
      </section>
    );
  }

  if (carregando) return <p className="sem-dado radar-vazio">Buscando os roteiros.</p>;

  const p = etapas.pesquisa;
  const temMaterial = !!p || etapas.anotacoes.trim().length > 10;
  const tituloAtual = roteiros.find((r) => r.id === atualId)?.titulo;

  return (
    <div className="etapas">
      <div className="ferramentas etapas-topo">
        <label className="campo campo-compacto">
          <span className="rotulo">Roteiro</span>
          <select value={atualId ?? ""} onChange={(e) => (e.target.value ? abrir(e.target.value) : novo())}>
            <option value="">Novo roteiro</option>
            {roteiros.map((r) => (
              <option key={r.id} value={r.id}>
                {quando(r.atualizado_em)} · {r.titulo}
              </option>
            ))}
          </select>
        </label>
        {atualId &&
          (confirmarApagar ? (
            <span className="confirmacao">
              Apagar "{tituloAtual}" e as versões dele?{" "}
              <span className="confirmacao-acoes">
                <button type="button" className="botao botao-perigo-cheio botao-pequeno" onClick={() => void apagar()}>
                  Apagar
                </button>
                <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setConfirmarApagar(false)}>
                  Manter
                </button>
              </span>
            </span>
          ) : (
            <button type="button" className="botao-texto botao-perigo" onClick={() => setConfirmarApagar(true)}>
              Apagar este roteiro
            </button>
          ))}
      </div>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

      <ol className="etapas-lista">
        <li className="etapa">
          <h2 className="etapa-titulo"><span className="etapa-numero">1</span> Tema e pesquisa</h2>
          <div className="etapa-corpo">
            <label className="campo">
              <span className="rotulo">Tema do vídeo</span>
              <input value={etapas.tema} maxLength={160} onChange={(e) => mudar({ tema: e.target.value })} placeholder="Uma ideia só. Ex.: por que o rotativo do cartão é a pior dívida do Brasil" />
            </label>
            <label className="campo">
              <span className="rotulo">Vídeo ou texto de referência (opcional)</span>
              <textarea rows={3} value={etapas.base} maxLength={1500} onChange={(e) => mudar({ base: e.target.value })} placeholder="Cole o link e o que chamou atenção. Pela aba Canais isto vem preenchido." />
            </label>
            <p className="roteiro-acoes">
              <button type="button" className="botao botao-primario" disabled={etapas.tema.trim().length < 3 || !!ocupado} onClick={() => void fazerPesquisa()}>
                {ocupado === "pesquisa" ? "Pesquisando (até 1 min)" : p ? "Pesquisar de novo" : "Pesquisar com IA"}
              </button>
              <span className="campo-ajuda">A IA não navega na internet: confira cada fato no lugar indicado antes de gravar.</span>
            </p>
            {p && (
              <div className="etapa-resultado">
                <p className="radar-resumo">{p.resumo}</p>
                <div className="etapa-contraste">
                  <div>
                    <span className="roteiro-etiqueta">O que todo mundo acha</span>
                    <p>{p.crencaComum}</p>
                  </div>
                  <div>
                    <span className="roteiro-etiqueta">O que acontece de verdade</span>
                    <p>{p.realidadeContraria}</p>
                  </div>
                </div>
                <div className="ideia-secao">
                  <span className="roteiro-etiqueta">Erro comum</span>
                  <p>{p.erroComum}</p>
                </div>
                <div className="ideia-secao">
                  <span className="roteiro-etiqueta">Fatos para conferir</span>
                  <ul className="etapa-lista-simples">
                    {p.fatos.map((f) => (
                      <li key={f.texto}>
                        {f.texto} <span className="etapa-conferir">Conferir: {f.conferir}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="ideia-secao">
                  <span className="roteiro-etiqueta">O que o público pergunta</span>
                  <ul className="etapa-lista-simples">
                    {p.perguntas.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                </div>
                <div className="ideia-secao">
                  <span className="roteiro-etiqueta">Ângulos</span>
                  <ul className="etapa-lista-simples">
                    {p.angulos.map((a) => (
                      <li key={a.titulo}>
                        <strong>{a.titulo}.</strong> {a.porque}
                      </li>
                    ))}
                  </ul>
                </div>
                {p.referencias.length > 0 && (
                  <div className="ideia-secao">
                    <span className="roteiro-etiqueta">Vídeos fora da curva sobre o tema</span>
                    <ul className="etapa-lista-simples">
                      {p.referencias.map((r) => (
                        <li key={r.url}>
                          <a className="link" href={r.url} target="_blank" rel="noreferrer">{r.url.replace(/^https:\/\/(www\.)?/, "")}</a> {r.porque}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <label className="campo">
              <span className="rotulo">Suas anotações</span>
              <textarea rows={3} value={etapas.anotacoes} maxLength={2000} onChange={(e) => mudar({ anotacoes: e.target.value })} placeholder="Sua prova, sua história, seus números. Valem mais que a pesquisa da IA." />
            </label>
          </div>
        </li>

        <li className="etapa">
          <h2 className="etapa-titulo"><span className="etapa-numero">2</span> Gancho</h2>
          <div className="etapa-corpo">
            <p className="roteiro-acoes">
              <button type="button" className="botao botao-primario" disabled={!temMaterial || etapas.tema.trim().length < 3 || !!ocupado} onClick={() => void fazerGanchos()}>
                {ocupado === "ganchos" ? "Escrevendo ganchos" : etapas.ganchos.length ? "Sugerir outros" : "Sugerir ganchos"}
              </button>
              <span className="campo-ajuda">
                {temMaterial ? "Saem dos modelos do calendário e dos vídeos fora da curva da aba Canais." : "Faça a pesquisa (ou escreva suas anotações) primeiro."}
              </span>
            </p>
            {etapas.ganchos.length > 0 && (
              <ul className="etapa-ganchos">
                {etapas.ganchos.map((g) => {
                  const escolhido = etapas.gancho?.ganchoFalado === g.ganchoFalado;
                  return (
                    <li key={g.ganchoFalado} className={`etapa-gancho${escolhido ? " etapa-gancho-escolhido" : ""}`}>
                      <p className="plano-celula-meta"><span>{nomeTipoGancho(g.tipo)}</span></p>
                      <p className="plano-celula-tela">{g.textoNaTela}</p>
                      <p>{g.ganchoFalado}</p>
                      <p className="roteiro-nota">
                        {g.porque} Inspiração: <Inspiracao g={g} />.
                      </p>
                      <p>
                        <button type="button" className="botao botao-secundario botao-pequeno" aria-pressed={escolhido} onClick={() => void escolherGancho(g)}>
                          {escolhido ? "Escolhido" : "Usar este"}
                        </button>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="etapa-meu-gancho">
              <summary>Ou escreva o seu</summary>
              <div className="campos-linha campos-metades">
                <label className="campo">
                  <span className="rotulo">Texto na tela</span>
                  <input value={meuGancho.textoNaTela} maxLength={120} onChange={(e) => setMeuGancho((m) => ({ ...m, textoNaTela: e.target.value }))} />
                </label>
                <label className="campo">
                  <span className="rotulo">Gancho falado</span>
                  <input value={meuGancho.ganchoFalado} maxLength={160} onChange={(e) => setMeuGancho((m) => ({ ...m, ganchoFalado: e.target.value }))} />
                </label>
              </div>
              <button
                type="button"
                className="botao botao-secundario botao-pequeno"
                disabled={meuGancho.ganchoFalado.trim().length < 5}
                onClick={() =>
                  void escolherGancho({
                    textoNaTela: meuGancho.textoNaTela.trim() || meuGancho.ganchoFalado.trim(),
                    ganchoFalado: meuGancho.ganchoFalado.trim(),
                    tipo: "",
                    diaCalendario: null,
                    inspiracao: "escrito pelo time",
                    porque: "",
                  })
                }
              >
                Usar o meu
              </button>
            </details>
            {etapas.gancho && !etapas.ganchos.some((g) => g.ganchoFalado === etapas.gancho?.ganchoFalado) && (
              <p className="campo-ajuda">Gancho escolhido: {etapas.gancho.ganchoFalado}</p>
            )}
          </div>
        </li>

        <li className="etapa">
          <h2 className="etapa-titulo"><span className="etapa-numero">3</span> Estrutura</h2>
          <div className="etapa-corpo">
            <div className="campos-linha campos-metades">
              <label className="campo">
                <span className="rotulo">Formato de história</span>
                <select value={etapas.formatoHistoria} onChange={(e) => mudar({ formatoHistoria: e.target.value })}>
                  {FORMATOS_HISTORIA.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span className="rotulo">Duração</span>
                <select value={etapas.duracao} onChange={(e) => mudar({ duracao: e.target.value })}>
                  {DURACOES.map((d) => <option key={d} value={d}>{d} s</option>)}
                </select>
              </label>
            </div>
            <fieldset className="etapa-contrastes">
              <legend className="rotulo">Contraste</legend>
              {CONTRASTES.map((c) => (
                <label key={c} className="etapa-marcar">
                  <input
                    type="checkbox"
                    checked={etapas.contraste.includes(c)}
                    onChange={(e) => mudar({ contraste: e.target.checked ? [...etapas.contraste, c] : etapas.contraste.filter((x) => x !== c) })}
                  />
                  {c}
                </label>
              ))}
            </fieldset>
            <p className="roteiro-acoes">
              <button type="button" className="botao botao-primario" disabled={!etapas.gancho || !!ocupado} onClick={() => void fazerEsboco()}>
                {ocupado === "esboco" ? "Montando o esboço" : etapas.esboco ? "Montar de novo" : "Montar esboço"}
              </button>
              {!etapas.gancho && <span className="campo-ajuda">Escolha um gancho primeiro.</span>}
            </p>
            {etapas.esboco && (
              <div className="etapa-resultado">
                <p className="campo-ajuda">Formato: {nomeFormato(etapas.esboco.formato)}. Edite o que quiser: o roteiro segue este esboço.</p>
                <ol className="etapa-batidas">
                  {etapas.esboco.batidas.map((b, i) => (
                    <li key={i}>
                      <span className="roteiro-etiqueta">{b.titulo} · {b.papel}</span>
                      <textarea
                        rows={2}
                        value={b.oQueDizer}
                        onChange={(e) => {
                          const batidas = etapas.esboco!.batidas.map((x, j) => (j === i ? { ...x, oQueDizer: e.target.value } : x));
                          mudar({ esboco: { ...etapas.esboco!, batidas } });
                        }}
                      />
                    </li>
                  ))}
                </ol>
                <label className="campo">
                  <span className="rotulo">Religar perto da metade</span>
                  <input value={etapas.esboco.religar} onChange={(e) => mudar({ esboco: { ...etapas.esboco!, religar: e.target.value } })} />
                </label>
                <label className="campo">
                  <span className="rotulo">Fechamento</span>
                  <input value={etapas.esboco.fechamento} onChange={(e) => mudar({ esboco: { ...etapas.esboco!, fechamento: e.target.value } })} />
                </label>
                {etapas.esboco.avisos.length > 0 && (
                  <ul className="roteiro-avisos">
                    {etapas.esboco.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </li>

        <li className="etapa">
          <h2 className="etapa-titulo"><span className="etapa-numero">4</span> Roteiro</h2>
          <div className="etapa-corpo">
            <div className="campos-linha campos-metades">
              <label className="campo">
                <span className="rotulo">Formato de gravação</span>
                <select value={etapas.formato} onChange={(e) => mudar({ formato: e.target.value })}>
                  {FORMATOS_ROTEIRO.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className="campo">
                <span className="rotulo">Chamada no fim</span>
                <select value={etapas.cta} onChange={(e) => mudar({ cta: e.target.value })}>
                  {CTAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <p className="roteiro-acoes">
              <button type="button" className="botao botao-primario" disabled={!etapas.gancho || !!ocupado} onClick={() => void escrever()}>
                {ocupado === "escrever" ? "Escrevendo (até 1 min)" : versoes.length ? "Escrever nova versão" : "Escrever o roteiro"}
              </button>
              <span className="campo-ajuda">Cada texto vira uma versão guardada; nada se perde ao escrever de novo.</span>
            </p>
          </div>
        </li>
      </ol>

      {versoes.length > 0 && versao && (
        <div className="etapas-saida">
          <aside className="etapas-versoes" aria-label="Versões">
            <h2 className="roteiro-etiqueta">Versões</h2>
            <ol>
              {versoes.map((v) => (
                <li key={v.id}>
                  <button type="button" className="etapas-versao" aria-current={v.id === versaoId} onClick={() => setVersaoId(v.id)}>
                    <span className="mono">v{v.numero}</span> {NOME_ORIGEM[v.origem]}
                    <span className="etapas-versao-nota">{v.nota} · {quando(v.criado_em)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
          <section className="roteiro-saida" aria-live="polite" aria-label={`Versão ${versao.numero}`}>
            <RoteiroSaida
              roteiro={versao.conteudo}
              origem={`Versão ${versao.numero}, ${NOME_ORIGEM[versao.origem]}`}
              acoes={
                <div className="etapas-ajustes">
                  <label className="campo campo-compacto">
                    <span className="rotulo">Nova duração</span>
                    <select value={novaDuracao} onChange={(e) => setNovaDuracao(e.target.value)}>
                      {DURACOES.map((d) => <option key={d} value={d}>{d} s</option>)}
                    </select>
                  </label>
                  <button type="button" className="botao botao-secundario botao-pequeno" disabled={!!ocupado} onClick={() => void mudarDuracao()}>
                    {ocupado === "duracao" ? "Reescrevendo" : "Mudar duração"}
                  </button>
                  <label className="campo campo-compacto">
                    <span className="rotulo">Idioma</span>
                    <select value={idioma} onChange={(e) => setIdioma(e.target.value as "inglês" | "espanhol")}>
                      <option value="inglês">Inglês</option>
                      <option value="espanhol">Espanhol</option>
                    </select>
                  </label>
                  <button type="button" className="botao botao-secundario botao-pequeno" disabled={!!ocupado} onClick={() => void fazerTraducao()}>
                    {ocupado === "traducao" ? "Traduzindo" : "Traduzir"}
                  </button>
                </div>
              }
            />
          </section>
        </div>
      )}
    </div>
  );
}
