import { useState } from "react";
import { Link } from "react-router-dom";
import { REFERENCIAS } from "../dados/referencias";

type Aba = "criadores" | "padroes" | "checklists" | "frameworks";

export function Referencias() {
  const [aba, setAba] = useState<Aba>("criadores");
  const { criadores, padroes, checklists, frameworks, atualizado } = REFERENCIAS;

  const abas: { id: Aba; nome: string; total: number }[] = [
    { id: "criadores", nome: "Criadores", total: criadores.length },
    { id: "padroes", nome: "O que se repete", total: padroes.length },
    { id: "checklists", nome: "Checklists", total: checklists.length },
    { id: "frameworks", nome: "Frameworks", total: frameworks.length },
  ];

  return (
    <div className="referencias">
      <section className="abertura" aria-labelledby="titulo-referencias">
        <p className="abertura-numero" aria-hidden="true">
          {String(criadores.length).padStart(2, "0")}
        </p>
        <div className="abertura-texto">
          <h1 id="titulo-referencias" className="rotulo">
            Referências, estudo de {atualizado.split("-").reverse().join("/")}
          </h1>
          <p className="abertura-gancho">Quem cresce rápido no nosso nicho, e por quê.</p>
          <p className="abertura-acoes">
            <span>
              Cinco perfis lidos por inteiro: números, ganchos, legendas, roupa, luz, voz, horários, patrocínio. Use os
              checklists antes de gravar.
            </span>
          </p>
        </div>
      </section>

      <div className="ferramentas">
        <div className="abas" role="tablist" aria-label="Seções das referências">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              className="aba"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
            >
              {a.nome}
              <span className="contagem">{a.total}</span>
            </button>
          ))}
        </div>
      </div>

      {aba === "criadores" && (
        <ul className="criadores">
          {criadores.map((c, i) => (
            <li key={c.slug} className="criador-linha">
              <span className="dia-linha-numero" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Link to={`/referencias/${c.slug}`} className="criador-corpo">
                <span className="criador-nome">{c.nome}</span>
                <span className="criador-nicho">{c.nicho}</span>
                <span className="criador-numeros mono">
                  {c.numeros.Instagram.split("·")[0].trim()} · {c.numeros["Mediana de views"]}
                </span>
              </Link>
              <span className="criador-handle mono">@{c.handle}</span>
            </li>
          ))}
        </ul>
      )}

      {aba === "padroes" && (
        <ol className="padroes">
          {padroes.map((p, i) => (
            <li key={p.titulo} className="padrao">
              <span className="padrao-numero" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="padrao-corpo">
                <h2 className="padrao-titulo">{p.titulo}</h2>
                <p className="padrao-texto">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {aba === "checklists" && (
        <div className="checklists">
          {checklists.map((c) => (
            <section key={c.titulo} className="checklist" aria-labelledby={`chk-${c.titulo}`}>
              <h2 id={`chk-${c.titulo}`} className="checklist-titulo">
                {c.titulo}
              </h2>
              <p className="checklist-fonte">Fonte: {c.fonte}</p>
              <ul className="checklist-itens">
                {c.itens.map((item) => (
                  <li key={item}>
                    <span className="marcador-caixa" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {aba === "frameworks" && (
        <dl className="ficha ficha-larga">
          {frameworks.map((f) => (
            <div key={f.nome}>
              <dt>{f.nome}</dt>
              <dd>{f.resumo}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="referencias-metodo">{REFERENCIAS.metodo}</p>
    </div>
  );
}
