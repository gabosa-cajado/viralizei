import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CAMPOS_PERSONA, PERSONA_VAZIA, type Persona as P } from "../../supabase/functions/gerar-roteiro/comum";
import { useEstado } from "../dados/armazenamento";
import { lerPersona, salvarPersona } from "../dados/persona";

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Persona() {
  const { modo } = useEstado();
  const [persona, setPersona] = useState<P>(PERSONA_VAZIA);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [mudou, setMudou] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (modo !== "site") {
      setCarregando(false);
      return;
    }
    let vivo = true;
    lerPersona()
      .then(({ atualizadoEm, ...p }) => {
        if (!vivo) return;
        setPersona(p);
        setSalvoEm(atualizadoEm);
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [modo]);

  function mudar(chave: keyof P, valor: string) {
    setPersona((p) => ({ ...p, [chave]: valor }));
    setMudou(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      setSalvoEm(await salvarPersona(persona));
      setMudou(false);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
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
        <p className="vazio-titulo">A Persona do canal existe só no site</p>
        <p className="vazio-texto">Ela fica no banco do site e é lida pela IA de lá. Abra o Viralizei pelo site e entre com a sua conta.</p>
      </section>
    );
  }

  return (
    <div className="persona">
      <section className="abertura" aria-labelledby="titulo-persona">
        <p className="abertura-numero" aria-hidden="true">P</p>
        <div className="abertura-texto">
          <h1 id="titulo-persona" className="rotulo">Persona do canal</h1>
          <p className="abertura-gancho">Quem somos, para quem falamos e como. Escreva uma vez; toda IA do Viralizei lê daqui.</p>
          <p className="radar-resumo">
            Vale para o <Link to="/roteiro" className="link">Roteiro</Link> (todos os modos), o{" "}
            <Link to="/laboratorio" className="link">Laboratório</Link>, o <Link to="/plano" className="link">Plano</Link> e o{" "}
            <Link to="/radar" className="link">Radar</Link>. Quanto mais concreto, menos genérico sai o texto.
          </p>
        </div>
      </section>

      {carregando ? (
        <p className="sem-dado radar-vazio">Buscando a persona.</p>
      ) : (
        <form className="persona-formulario" onSubmit={(e) => void salvar(e)}>
          {CAMPOS_PERSONA.map((c) => (
            <label key={c.chave} className="campo">
              <span className="rotulo">{c.rotulo}</span>
              <textarea
                rows={c.chave === "nicho" ? 2 : 3}
                maxLength={c.chave === "nicho" ? 300 : 600}
                value={persona[c.chave]}
                onChange={(e) => mudar(c.chave, e.target.value)}
                placeholder={c.ajuda}
              />
            </label>
          ))}
          <p className="roteiro-acoes persona-acoes">
            <button type="submit" className="botao botao-primario" disabled={salvando || !mudou}>
              {salvando ? "Guardando" : "Guardar a persona"}
            </button>
            <span className="campo-ajuda" role="status">
              {mudou ? "Há mudanças sem guardar." : salvoEm ? `Guardada em ${quando(salvoEm)}.` : ""}
            </span>
          </p>
          {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
        </form>
      )}
    </div>
  );
}
