import { NavLink, Outlet } from "react-router-dom";
import { limparErro, sair, useEstado } from "../dados/armazenamento";
import { Entrar } from "../paginas/Entrar";
import { BotaoTema } from "./Tema";

export function Moldura() {
  const { erro, conteudo, gravados, modo } = useEstado();
  const total = conteudo.dias.length;
  const feitos = conteudo.dias.filter((d) => gravados.includes(d.id)).length;
  const mostrarProgresso = total > 0 && (modo === "local" || modo === "artefato" || modo === "site");

  return (
    <div className="moldura">
      <header className="topo">
        <NavLink to="/" className="marca" aria-label="Viralizei, ir para os ganchos virais">
          Viralizei
        </NavLink>
        {modo !== "login" && (
        <nav className="navegacao" aria-label="Seções">
          <NavLink to="/" end>
            Ganchos virais
          </NavLink>
          <NavLink to="/referencias">Referências</NavLink>
          <NavLink to="/roteiro">Roteiro</NavLink>
          <NavLink to="/avaliar">Avaliar</NavLink>
          <NavLink to="/radar">Radar</NavLink>
        </nav>
        )}
        <div className="topo-direita">
        {mostrarProgresso && (
          <div className="progresso" role="group" aria-label="Seu progresso">
            <span className="mono">
              {feitos}/{total}
            </span>
            <span className="progresso-rotulo">gravados</span>
            <span
              className="progresso-trilho"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={feitos}
              aria-label="Dias que você gravou"
            >
              <span className="progresso-barra" style={{ width: `${(feitos / total) * 100}%` }} />
            </span>
          </div>
        )}
        <BotaoTema />
        {(modo === "site" || modo === "sem-acesso") && (
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => void sair()}>
            Sair
          </button>
        )}
        </div>
      </header>
      {erro && (
        <div className="erro-global" role="alert">
          <p>{erro}</p>
          <button type="button" className="botao-texto" onClick={limparErro}>
            Fechar
          </button>
        </div>
      )}
      <main className="conteudo-principal">
        {modo === "login" ? <Entrar /> : <Outlet />}
      </main>
    </div>
  );
}
