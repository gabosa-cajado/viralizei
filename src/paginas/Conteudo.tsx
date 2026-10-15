import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Gancho } from "../componentes/Gancho";
import {
  apagarDia,
  diasOrdenados,
  exportarConteudo,
  importarConteudo,
  nomeDoFormato,
  novoId,
  salvarDia,
  salvarFormatos,
  useEstado,
} from "../dados/armazenamento";
import { lerReferencia } from "../dados/referencia";
import type { Dia } from "../dados/tipos";

function diaEmBranco(numero: number, formatoId: string): Dia {
  return { id: novoId("d"), numero, gancho: "", descricao: "", formatoId, referenciaUrl: "", exemplos: [] };
}

export function Conteudo() {
  const { conteudo, modo, podeEditar } = useEstado();
  const dias = useMemo(() => diasOrdenados(conteudo), [conteudo]);
  const [params, setParams] = useSearchParams();
  const selecionadoId = params.get("dia");
  const selecionado = dias.find((d) => d.id === selecionadoId) ?? null;
  const proximoNumero = (dias.at(-1)?.numero ?? 0) + 1;

  const [rascunho, setRascunho] = useState<Dia | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroImport, setErroImport] = useState<string | null>(null);
  const [novoFormato, setNovoFormato] = useState("");
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroFormato, setErroFormato] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  // Só recarrega o rascunho quando muda o dia escolhido, para não apagar o que está sendo digitado.
  useEffect(() => {
    setConfirmarApagar(false);
    if (selecionado) setRascunho(selecionado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadoId]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2200);
    return () => clearTimeout(t);
  }, [aviso]);

  function abrir(dia: Dia) {
    setParams({ dia: dia.id });
    setRascunho(dia);
    setConfirmarApagar(false);
  }

  function criar() {
    const novo = diaEmBranco(proximoNumero, conteudo.formatos[0]?.id ?? "");
    setParams({});
    setRascunho(novo);
  }

  const numeroRepetido =
    rascunho && dias.some((d) => d.numero === rascunho.numero && d.id !== rascunho.id);
  const linkInvalido = rascunho?.referenciaUrl.trim() && !lerReferencia(rascunho.referenciaUrl);
  const podeSalvar = rascunho && rascunho.gancho.trim() && rascunho.numero > 0 && !numeroRepetido;

  async function salvar() {
    if (!rascunho || !podeSalvar || salvando) return;
    const limpo: Dia = {
      ...rascunho,
      gancho: rascunho.gancho.trim(),
      descricao: rascunho.descricao.trim(),
      referenciaUrl: rascunho.referenciaUrl.trim(),
      exemplos: rascunho.exemplos.filter((e) => e.texto.trim()),
    };
    setSalvando(true);
    try {
      await salvarDia(limpo);
      setParams({ dia: limpo.id });
      setAviso(`Dia ${limpo.numero} salvo`);
    } catch {
      // A mensagem de erro aparece no topo, vinda do armazenamento.
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!rascunho) return;
    const existe = dias.some((d) => d.id === rascunho.id);
    if (!existe) {
      setRascunho(null);
      return;
    }
    try {
      await apagarDia(rascunho.id);
      setParams({});
      setRascunho(null);
      setConfirmarApagar(false);
      setAviso(`Dia ${rascunho.numero} apagado`);
    } catch {
      setConfirmarApagar(false);
    }
  }

  function exportar() {
    const blob = new Blob([exportarConteudo()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pauta-conteudo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar(arquivoEscolhido: File) {
    setErroImport(null);
    if (!window.confirm(`Trocar todo o conteúdo pelo de “${arquivoEscolhido.name}”? Os dias atuais serão substituídos.`))
      return;
    const erro = importarConteudo(await arquivoEscolhido.text());
    if (erro) setErroImport(erro);
    else {
      setParams({});
      setRascunho(null);
      setAviso("Conteúdo importado");
    }
  }

  function adicionarFormato() {
    const nome = novoFormato.trim();
    setErroFormato(null);
    if (!nome) return;
    if (conteudo.formatos.some((f) => f.nome.toLowerCase() === nome.toLowerCase())) {
      setErroFormato(`Já existe o formato “${nome}”.`);
      return;
    }
    salvarFormatos([...conteudo.formatos, { id: novoId("f"), nome }]).catch(() => undefined);
    setNovoFormato("");
  }

  function removerFormato(id: string) {
    const emUso = dias.filter((d) => d.formatoId === id).length;
    const nome = nomeDoFormato(conteudo, id);
    setErroFormato(null);
    if (emUso > 0) {
      setErroFormato(`“${nome}” está em ${emUso === 1 ? "1 dia" : `${emUso} dias`}. Troque o formato desses dias antes de remover.`);
      return;
    }
    salvarFormatos(conteudo.formatos.filter((f) => f.id !== id)).catch(() => undefined);
  }

  const mudar = (parcial: Partial<Dia>) => rascunho && setRascunho({ ...rascunho, ...parcial });

  return (
    <div className="editor">
      <div className="editor-topo">
        <h1 className="titulo-secao">Gerenciar dias</h1>
        {modo === "local" && (
        <div className="editor-arquivo">
          <button type="button" className="botao botao-texto" onClick={exportar}>
            Exportar conteúdo
          </button>
          <button type="button" className="botao botao-texto" onClick={() => arquivo.current?.click()}>
            Importar conteúdo
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar(f);
              e.target.value = "";
            }}
          />
        </div>
        )}
      </div>
      <p className="descricao-curta editor-nota">
        {modo === "local"
          ? "Tudo fica neste navegador. Para passar o conteúdo a um sócio, exporte o arquivo e ele importa do lado dele."
          : podeEditar
            ? "O que você salvar aqui aparece na hora para todos os sócios."
            : "Você pode ver o conteúdo, mas não editar. Peça ao dono do Viralizei acesso de Contribuidor."}
      </p>
      {erroImport && <p className="mensagem-erro">{erroImport}</p>}

      <div className="editor-grade">
        <nav className="editor-lista" aria-label="Dias">
          {podeEditar && (
            <button type="button" className="botao botao-primario editor-novo" onClick={criar}>
              Novo dia
            </button>
          )}
          {dias.length === 0 ? (
            <p className="descricao-curta">{podeEditar ? "Nenhum dia ainda. Crie o primeiro acima." : "Nenhum dia ainda."}</p>
          ) : (
            <ol>
              {dias.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="editor-item"
                    aria-current={rascunho?.id === d.id ? "true" : undefined}
                    onClick={() => abrir(d)}
                  >
                    <span className="linha-numero tabular">{String(d.numero).padStart(2, "0")}</span>
                    <Gancho gancho={d.gancho} className="gancho editor-item-gancho" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          <section className="formatos" aria-labelledby="titulo-formatos">
            <h2 id="titulo-formatos" className="titulo-bloco">
              Formatos
            </h2>
            <ul>
              {conteudo.formatos.map((f) => (
                <li key={f.id} className="formato-item">
                  <span>{f.nome}</span>
                  {podeEditar && (
                    <button
                      type="button"
                      className="botao-texto"
                      aria-label={`Remover o formato ${f.nome}`}
                      onClick={() => removerFormato(f.id)}
                    >
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {erroFormato && <p className="mensagem-erro">{erroFormato}</p>}
            {podeEditar && (
            <form
              className="formato-novo"
              onSubmit={(e) => {
                e.preventDefault();
                adicionarFormato();
              }}
            >
              <label className="campo">
                <span className="visualmente-oculto">Nome do novo formato</span>
                <input value={novoFormato} onChange={(e) => setNovoFormato(e.target.value)} placeholder="Novo formato" />
              </label>
              <button type="submit" className="botao botao-secundario">
                Adicionar
              </button>
            </form>
            )}
          </section>
        </nav>

        {rascunho ? (
          <form
            className="editor-formulario"
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
          >
            <fieldset className="editor-campos" disabled={!podeEditar}>
            <div className="campos-linha">
              <label className="campo campo-numero">
                <span className="campo-rotulo">Dia</span>
                <input
                  type="number"
                  min={1}
                  value={rascunho.numero || ""}
                  onChange={(e) => mudar({ numero: Number(e.target.value) })}
                />
              </label>
              <label className="campo">
                <span className="campo-rotulo">Formato</span>
                <select value={rascunho.formatoId} onChange={(e) => mudar({ formatoId: e.target.value })}>
                  {conteudo.formatos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {numeroRepetido && <p className="mensagem-erro">Já existe um dia {rascunho.numero}. Escolha outro número.</p>}

            <label className="campo">
              <span className="campo-rotulo">Gancho</span>
              <input
                className="campo-gancho"
                value={rascunho.gancho}
                onChange={(e) => mudar({ gancho: e.target.value })}
                placeholder="O erro que eu repeti por ___ anos"
              />
              <span className="campo-ajuda">Use ___ onde quem for gravar completa a frase.</span>
            </label>
            {rascunho.gancho.trim() && (
              <p className="previa" aria-label="Prévia do gancho">
                <Gancho gancho={rascunho.gancho} className="gancho" />
              </p>
            )}

            <label className="campo">
              <span className="campo-rotulo">Por que funciona</span>
              <textarea
                rows={3}
                value={rascunho.descricao}
                onChange={(e) => mudar({ descricao: e.target.value })}
                placeholder="O que esse gancho provoca em quem assiste"
              />
            </label>

            <label className="campo">
              <span className="campo-rotulo">Vídeo de referência</span>
              <input
                type="url"
                value={rascunho.referenciaUrl}
                onChange={(e) => mudar({ referenciaUrl: e.target.value })}
                placeholder="Link do Instagram, TikTok ou YouTube"
              />
              {linkInvalido ? (
                <span className="campo-ajuda campo-ajuda-erro">
                  Este link não abre dentro do app. Use o link de um vídeo do Instagram, TikTok ou YouTube.
                </span>
              ) : (
                <span className="campo-ajuda">
                  {modo === "local"
                    ? "Cole o link do post. Ele aparece ao lado do gancho."
                    : "Cole o link do post. Ele vira um botão para assistir ao lado do gancho."}
                </span>
              )}
            </label>

            <fieldset className="campo exemplos-editor">
              <legend className="campo-rotulo">Exemplos</legend>
              {rascunho.exemplos.map((ex, i) => (
                <div key={i} className="exemplo-editor">
                  <input
                    aria-label={`Nicho do exemplo ${i + 1}`}
                    value={ex.nicho}
                    placeholder="Nicho"
                    onChange={(e) =>
                      mudar({
                        exemplos: rascunho.exemplos.map((x, j) => (j === i ? { ...x, nicho: e.target.value } : x)),
                      })
                    }
                  />
                  <input
                    aria-label={`Texto do exemplo ${i + 1}`}
                    value={ex.texto}
                    placeholder="O gancho completo para esse nicho"
                    onChange={(e) =>
                      mudar({
                        exemplos: rascunho.exemplos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="botao-texto"
                    aria-label={`Remover o exemplo ${i + 1}`}
                    onClick={() => mudar({ exemplos: rascunho.exemplos.filter((_, j) => j !== i) })}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => mudar({ exemplos: [...rascunho.exemplos, { nicho: "", texto: "" }] })}
              >
                Adicionar exemplo
              </button>
            </fieldset>

            </fieldset>

            {confirmarApagar ? (
              <div className="confirmacao" role="alert">
                <p>
                  Apagar o dia {rascunho.numero}, “{rascunho.gancho}”? Ele some para todos os sócios e não tem volta.
                </p>
                <div className="confirmacao-acoes">
                  <button type="button" className="botao botao-perigo-cheio" onClick={apagar}>
                    Apagar o dia {rascunho.numero}
                  </button>
                  <button type="button" className="botao botao-texto" onClick={() => setConfirmarApagar(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="editor-acoes">
                {podeEditar && (
                  <button type="submit" className="botao botao-primario" disabled={!podeSalvar || salvando}>
                    {salvando ? "Salvando" : "Salvar dia"}
                  </button>
                )}
                {dias.some((d) => d.id === rascunho.id) && (
                  <Link to={`/dia/${rascunho.numero}`} className="botao botao-texto">
                    Abrir o dia
                  </Link>
                )}
                {podeEditar && (
                  <button
                    type="button"
                    className="botao botao-texto botao-perigo"
                    onClick={() => (dias.some((d) => d.id === rascunho.id) ? setConfirmarApagar(true) : apagar())}
                  >
                    {dias.some((d) => d.id === rascunho.id) ? "Apagar dia" : "Descartar"}
                  </button>
                )}
              </div>
            )}
          </form>
        ) : (
          <div className="vazio editor-vazio">
            <p className="vazio-texto">Escolha um dia à esquerda para editar, ou crie um novo.</p>
          </div>
        )}
      </div>

      <div className="aviso" role="status" aria-live="polite">
        {aviso}
      </div>
    </div>
  );
}
