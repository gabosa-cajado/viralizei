import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FORMATOS_HISTORIA, nomeFormato, nomeLayout, nomeTipoGancho } from "../../supabase/functions/gerar-roteiro/comum";
import { useEstado } from "../dados/armazenamento";
import {
  apagarPlano,
  criarPlano,
  dobrar,
  FORMATOS_PADRAO,
  lerPlanos,
  lerPublicacoes,
  levarParaRoteiro,
  salvarCelulas,
  type Celula,
  type Plano as P,
  type Publicacao,
} from "../dados/plano";
import { lerRecomendacoes } from "../dados/recomendacoes";

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function primeiraLinha(legenda: string) {
  const linha = (legenda.split("\n").find((l) => l.trim()) ?? "").replace(/#\S+/g, "").trim();
  return linha.length > 60 ? linha.slice(0, 57).replace(/\s+\S*$/, "") + "…" : linha || "(sem legenda)";
}

function dataCurta(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

function CartaoCelula({
  c,
  publicacoes,
  onLevar,
  onLigar,
  destaque,
}: {
  c: Celula;
  publicacoes: Publicacao[];
  onLevar: () => void;
  onLigar?: (id: string | null) => void;
  destaque?: boolean;
}) {
  const pub = c.publicacaoId ? publicacoes.find((p) => p.id === c.publicacaoId) : undefined;
  return (
    <article className={`plano-celula${destaque ? " plano-celula-decimo" : ""}`}>
      <p className="plano-celula-meta">
        <span>{nomeFormato(c.formato)}</span>
        <span>{nomeLayout(c.layout)}</span>
        <span>{nomeTipoGancho(c.tipoGancho)}</span>
      </p>
      <h3 className="plano-celula-titulo">{c.titulo}</h3>
      <div className="ideia-secao">
        <span className="roteiro-etiqueta">Na tela</span>
        <p className="plano-celula-tela">{c.ganchoTela}</p>
      </div>
      <div className="ideia-secao">
        <span className="roteiro-etiqueta">Falado</span>
        <p>{c.ganchoFalado}</p>
      </div>
      <p className="roteiro-nota">
        {c.porque}
        {c.diaCalendario != null && (
          <>
            {" "}
            <Link className="link" to={`/dia/${c.diaCalendario}`}>Modelo do dia {c.diaCalendario}</Link>
          </>
        )}
      </p>
      {onLigar && (
        <label className="campo campo-compacto plano-ligar">
          <span className="roteiro-etiqueta">Virou o vídeo</span>
          <select value={c.publicacaoId ?? ""} onChange={(e) => onLigar(e.target.value || null)}>
            <option value="">Ainda não postado</option>
            {publicacoes.map((p) => (
              <option key={p.id} value={p.id}>
                {dataCurta(p.publicado_em)} · {primeiraLinha(p.legenda)}
              </option>
            ))}
          </select>
        </label>
      )}
      {pub && (
        <p className="plano-resultado">
          {num(pub.views)} views · {pub.taxa_3s == null ? "—" : `${Math.round(pub.taxa_3s)}%`} passam dos 3 s · {num(pub.salvos)} salvos
          {pub.url && (
            <>
              {" · "}
              <a className="link" href={pub.url} target="_blank" rel="noreferrer">ver</a>
            </>
          )}
        </p>
      )}
      <p className="plano-celula-acoes">
        <button type="button" className="botao botao-secundario botao-pequeno" onClick={onLevar}>
          Levar para o Roteiro
        </button>
      </p>
    </article>
  );
}

export function Plano() {
  const { modo } = useEstado();
  const navigate = useNavigate();
  const [planos, setPlanos] = useState<P[]>([]);
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [temas, setTemas] = useState(["", "", ""]);
  const [formatos, setFormatos] = useState(FORMATOS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<"" | "montando" | "dobrando">("");
  const [erro, setErro] = useState("");
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  useEffect(() => {
    if (modo !== "site") {
      setCarregando(false);
      return;
    }
    let vivo = true;
    Promise.all([lerPlanos(), lerPublicacoes(), lerRecomendacoes().catch(() => [])])
      .then(([ps, pubs, recs]) => {
        if (!vivo) return;
        setPlanos(ps);
        setPublicacoes(pubs);
        setAtualId(ps[0]?.id ?? null);
        // Os 3 temas que mais rendem na conta já vêm preenchidos.
        const top = (recs[0]?.numeros.temas ?? []).map((t) => t.tema).slice(0, 3);
        if (top.length) setTemas((ts) => ts.map((t, i) => t || top[i] || ""));
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [modo]);

  const atual = planos.find((p) => p.id === atualId) ?? null;
  const formatosValidos = new Set(formatos).size === 3;
  const podeMontar = temas.every((t) => t.trim().length >= 2) && formatosValidos && !ocupado;

  async function montar(e: FormEvent) {
    e.preventDefault();
    if (!podeMontar) return;
    setErro("");
    setOcupado("montando");
    try {
      const novo = await criarPlano(temas.map((t) => t.trim()), formatos);
      setPlanos((ps) => [novo, ...ps]);
      setAtualId(novo.id);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }

  async function ligar(indice: number, publicacaoId: string | null) {
    if (!atual) return;
    const celulas = atual.celulas.map((c, i) => (i === indice ? { ...c, publicacaoId } : c));
    setPlanos((ps) => ps.map((p) => (p.id === atual.id ? { ...p, celulas } : p)));
    try {
      await salvarCelulas(atual.id, celulas);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function decimo() {
    if (!atual) return;
    setErro("");
    setOcupado("dobrando");
    try {
      const novo = await dobrar(atual, publicacoes);
      setPlanos((ps) => ps.map((p) => (p.id === novo.id ? novo : p)));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }

  async function apagar() {
    if (!atual) return;
    try {
      await apagarPlano(atual.id);
      const resto = planos.filter((p) => p.id !== atual.id);
      setPlanos(resto);
      setAtualId(resto[0]?.id ?? null);
      setConfirmarApagar(false);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function levar(c: Celula) {
    levarParaRoteiro(c);
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
        <p className="vazio-titulo">O Plano 3-3-1 existe só no site</p>
        <p className="vazio-texto">
          Ele usa a IA e as métricas da conta, que ficam no banco do site. Abra o Viralizei pelo site e entre com a sua conta.
        </p>
      </section>
    );
  }

  const ligados = atual ? atual.celulas.filter((c) => c.publicacaoId).length : 0;

  return (
    <div className="plano">
      <section className="abertura" aria-labelledby="titulo-plano">
        <p className="abertura-numero" aria-hidden="true">331</p>
        <div className="abertura-texto">
          <h1 id="titulo-plano" className="rotulo">Plano 3-3-1</h1>
          <p className="abertura-gancho">3 temas × 3 formatos = 9 vídeos. O 10º dobra o que funcionou.</p>
          <p className="radar-resumo">
            Em vez de chutar um vídeo por vez, grave a grade inteira e deixe os números dizerem qual combinação repetir. Os
            ganchos saem dos modelos do <Link to="/" className="link">calendário</Link>; as fórmulas que já rendem na conta estão em{" "}
            <Link to="/recomendacoes" className="link">Recomendações</Link>.
          </p>
        </div>
      </section>

      <form className="plano-formulario" onSubmit={(e) => void montar(e)}>
        <fieldset className="plano-grupo">
          <legend className="rotulo">3 temas</legend>
          {temas.map((t, i) => (
            <label key={i} className="campo">
              <span className="visualmente-oculto">Tema {i + 1}</span>
              <input
                value={t}
                maxLength={80}
                onChange={(e) => setTemas((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={["Ex.: IA e ferramentas", "Ex.: Dinheiro do pequeno negócio", "Ex.: Disciplina"][i]}
              />
            </label>
          ))}
        </fieldset>
        <fieldset className="plano-grupo">
          <legend className="rotulo">3 formatos</legend>
          {formatos.map((f, i) => (
            <label key={i} className="campo">
              <span className="visualmente-oculto">Formato {i + 1}</span>
              <select value={f} onChange={(e) => setFormatos((fs) => fs.map((x, j) => (j === i ? e.target.value : x)))}>
                {FORMATOS_HISTORIA.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome} ({o.facil ? "fácil" : "ambicioso"})
                  </option>
                ))}
              </select>
            </label>
          ))}
          {!formatosValidos && <p className="campo-ajuda">Escolha 3 formatos diferentes.</p>}
        </fieldset>
        <p className="roteiro-acoes">
          <button type="submit" className="botao botao-primario" disabled={!podeMontar}>
            {ocupado === "montando" ? "Montando os 9 vídeos" : "Montar os 9 vídeos"}
          </button>
          <span className="campo-ajuda">Dois formatos fáceis e um ambicioso é o equilíbrio do método. Leva cerca de um minuto.</span>
        </p>
      </form>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

      {carregando ? (
        <p className="sem-dado radar-vazio">Buscando os planos.</p>
      ) : !atual ? (
        <div className="vazio vazio-lista">
          <p className="vazio-texto">Nenhum plano ainda. Escolha 3 temas e 3 formatos acima e monte o primeiro.</p>
        </div>
      ) : (
        <section className="plano-atual" aria-labelledby="titulo-plano-atual">
          <div className="ferramentas">
            <h2 id="titulo-plano-atual" className="ferramentas-titulo">{atual.titulo}</h2>
            {planos.length > 1 && (
              <label className="campo campo-compacto">
                <span className="visualmente-oculto">Plano</span>
                <select value={atual.id} onChange={(e) => setAtualId(e.target.value)}>
                  {planos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {dataCurta(p.criado_em)} · {p.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <ol className="plano-grade">
            {atual.celulas.map((c, i) => (
              <li key={i} className="plano-item">
                <span className="plano-tema">{c.tema}</span>
                <CartaoCelula c={c} publicacoes={publicacoes} onLevar={() => levar(c)} onLigar={(id) => void ligar(i, id)} />
              </li>
            ))}
          </ol>

          <section className="plano-dobra" aria-labelledby="titulo-dobra">
            <h2 id="titulo-dobra" className="rotulo">O 10º vídeo</h2>
            <p className="radar-resumo">
              {ligados > 0
                ? `${ligados} de 9 vídeos ligados aos números. A IA escolhe a combinação que mais rendeu e propõe um ângulo novo nela.`
                : "Ligue cada célula ao vídeo postado (em \"Virou o vídeo\"). Sem vídeos ligados, a IA usa as fórmulas que já rendem na conta."}
            </p>
            {atual.decimo && (
              <CartaoCelula c={atual.decimo} publicacoes={publicacoes} onLevar={() => levar(atual.decimo!)} destaque />
            )}
            <p className="roteiro-acoes">
              <button type="button" className="botao botao-primario" disabled={!!ocupado} onClick={() => void decimo()}>
                {ocupado === "dobrando" ? "Escolhendo o 10º" : atual.decimo ? "Escolher de novo" : "Escolher o 10º vídeo"}
              </button>
            </p>
          </section>

          <p className="rodape-lista">
            {confirmarApagar ? (
              <span className="confirmacao">
                Apagar o plano "{atual.titulo}"?{" "}
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
                Apagar este plano
              </button>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
