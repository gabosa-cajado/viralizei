import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gancho } from "../componentes/Gancho";
import { noSite as noSiteMsg } from "../dados/site";
import { Gravadores, usePerfis } from "../componentes/Pessoas";
import { alternarGravado, carregarSemente, diasOrdenados, emEquipe, nomeDoFormato, quemGravou, useEstado } from "../dados/armazenamento";

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Aba = "agravar" | "gravados" | "todos";

export function Calendario() {
  const { conteudo, gravados, gravadosPorPessoa, modo, podeEditar } = useEstado();
  const [aba, setAba] = useState<Aba>("agravar");
  const [formato, setFormato] = useState("");
  const [busca, setBusca] = useState("");
  const pessoas = Object.keys(gravadosPorPessoa).filter((id) => gravadosPorPessoa[id].length > 0);
  const perfis = usePerfis(pessoas);

  const dias = useMemo(() => diasOrdenados(conteudo), [conteudo]);
  const proximo = dias.find((d) => !gravados.includes(d.id));
  const aGravar = dias.filter((d) => !gravados.includes(d.id));
  const feitos = dias.filter((d) => gravados.includes(d.id));
  const formatosEmUso = conteudo.formatos.filter((f) => dias.some((d) => d.formatoId === f.id));

  const daAba = aba === "agravar" ? aGravar : aba === "gravados" ? feitos : dias;
  const termo = semAcento(busca.trim());
  const visiveis = daAba.filter(
    (d) =>
      (!formato || d.formatoId === formato) &&
      (!termo || semAcento(`${d.gancho} ${d.descricao} ${nomeDoFormato(conteudo, d.formatoId)}`).includes(termo)),
  );
  const filtrando = !!formato || !!termo;

  if (modo === "carregando") {
    return (
      <section className="vazio" aria-busy="true">
        <p className="vazio-titulo">Abrindo o Viralizei</p>
        <p className="vazio-texto">Buscando os dias e o progresso de todos.</p>
      </section>
    );
  }

  if (modo === "sem-acesso") {
    return (
      <section className="vazio">
        <p className="vazio-titulo">
          {noSiteMsg ? "Sua conta ainda não tem acesso" : "Entre no claude.ai para ver o Viralizei"}
        </p>
        <p className="vazio-texto">
          {noSiteMsg
            ? "Peça ao dono do Viralizei para colocar o seu e-mail na lista de sócios. Depois, saia e entre de novo."
            : "Os dias e o progresso ficam guardados na conta de quem tem acesso. Entre com a conta que recebeu o convite e abra este link de novo."}
        </p>
      </section>
    );
  }

  if (dias.length === 0) {
    return (
      <section className="vazio">
        <p className="vazio-titulo">Nenhum gancho ainda</p>
        {podeEditar ? (
          <>
            <p className="vazio-texto">
              Carregue os 72 dias prontos, com ganchos, exemplos e vídeos de referência, ou crie o primeiro do zero.
            </p>
            <p className="abertura-acoes">
              {modo === "site" && (
                <button
                  type="button"
                  className="botao botao-primario"
                  onClick={() => void carregarSemente().catch(() => undefined)}
                >
                  Carregar os 72 dias
                </button>
              )}
              <Link className="botao botao-secundario" to="/conteudo">
                Criar o primeiro dia
              </Link>
            </p>
          </>
        ) : (
          <p className="vazio-texto">Quando alguém da equipe criar o primeiro dia, ele aparece aqui.</p>
        )}
      </section>
    );
  }

  const abas: { id: Aba; nome: string; total: number }[] = [
    { id: "agravar", nome: "A gravar", total: aGravar.length },
    { id: "gravados", nome: "Gravados", total: feitos.length },
    { id: "todos", nome: "Todos", total: dias.length },
  ];

  return (
    <div className="calendario">
      <section className="abertura" aria-labelledby="titulo-proximo">
        {proximo ? (
          <>
            <p className="abertura-numero" aria-hidden="true">
              {String(proximo.numero).padStart(2, "0")}
            </p>
            <div className="abertura-texto">
              <h1 id="titulo-proximo" className="rotulo">
                Próximo a gravar, dia {proximo.numero}
              </h1>
              <Link to={`/dia/${proximo.numero}`} className="abertura-gancho">
                <Gancho gancho={proximo.gancho} className="gancho" />
              </Link>
              <p className="abertura-acoes">
                <Link to={`/dia/${proximo.numero}`} className="botao botao-primario">
                  Abrir o dia
                </Link>
                <span>{nomeDoFormato(conteudo, proximo.formatoId)}</span>
              </p>
            </div>
          </>
        ) : (
          <div className="abertura-texto abertura-cheia">
            <h1 id="titulo-proximo" className="rotulo">
              Próximo a gravar
            </h1>
            <p className="abertura-gancho">Você gravou todos os dias.</p>
            {podeEditar && (
              <p className="abertura-acoes">
                <Link to="/conteudo" className="botao botao-secundario">
                  Criar mais dias
                </Link>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="lista" aria-labelledby="titulo-lista">
        <h2 id="titulo-lista" className="visualmente-oculto">
          Dias
        </h2>
        <div className="ferramentas">
          <div className="abas" role="tablist" aria-label="Mostrar">
            {abas.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                className="aba"
                onClick={() => setAba(a.id)}
              >
                {a.nome}
                <span className="contagem">{a.total}</span>
              </button>
            ))}
          </div>
          <div className="filtros">
            <label className="campo campo-compacto">
              <span className="visualmente-oculto">Formato</span>
              <select value={formato} onChange={(e) => setFormato(e.target.value)}>
                <option value="">Todos os formatos</option>
                {formatosEmUso.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo campo-compacto busca">
              <span className="visualmente-oculto">Buscar</span>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar gancho" />
            </label>
          </div>
        </div>

        {visiveis.length === 0 ? (
          <div className="vazio vazio-lista">
            <p className="vazio-texto">
              {filtrando
                ? "Nenhum dia com esse filtro."
                : aba === "agravar"
                  ? "Nada a gravar. Você já gravou todos os dias."
                  : aba === "gravados"
                    ? "Nenhum dia gravado ainda. Abra um dia e marque quando gravar."
                    : "Nenhum dia."}
            </p>
            {filtrando && (
              <button
                type="button"
                className="botao botao-secundario botao-pequeno"
                onClick={() => {
                  setBusca("");
                  setFormato("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <ol className="dias" role="tabpanel">
            {visiveis.map((d) => {
              const gravado = gravados.includes(d.id);
              const quem = emEquipe(modo) ? quemGravou(d.id) : [];
              return (
                <li key={d.id} className={`dia-linha${gravado ? " gravado" : ""}`}>
                  <span className="dia-linha-numero" aria-hidden="true">
                    {String(d.numero).padStart(2, "0")}
                  </span>
                  <Link to={`/dia/${d.numero}`} className="dia-linha-corpo">
                    <span className="visualmente-oculto">Dia {d.numero}: </span>
                    <Gancho gancho={d.gancho} className="gancho dia-linha-gancho" />
                    <span className="dia-linha-meta">{nomeDoFormato(conteudo, d.formatoId)}</span>
                  </Link>
                  <span className="dia-linha-equipe">
                    <Gravadores ids={quem} perfis={perfis} />
                  </span>
                  <button
                    type="button"
                    className="marcador"
                    aria-pressed={gravado}
                    aria-label={`Dia ${d.numero} gravado`}
                    title={gravado ? "Desmarcar" : "Marcar como gravado"}
                    onClick={() => alternarGravado(d.id)}
                  >
                    <span className="marcador-caixa" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {podeEditar && (
        <p className="rodape-lista">
          <Link to="/conteudo" className="link">
            Gerenciar dias
          </Link>
          <span>: criar, editar, importar e exportar os ganchos.</span>
        </p>
      )}
    </div>
  );
}
