import { useState } from "react";
import { entrar } from "../dados/armazenamento";

export function Entrar() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  return (
    <section className="entrar" aria-labelledby="titulo-entrar">
      <p className="abertura-numero" aria-hidden="true">
        V
      </p>
      <div className="entrar-corpo">
        <h1 id="titulo-entrar" className="vazio-titulo">
          Entre no Viralizei
        </h1>
        <p className="vazio-texto">Use o e-mail e a senha que o dono do Viralizei criou para você.</p>
        <form
          className="entrar-formulario"
          onSubmit={async (e) => {
            e.preventDefault();
            setEntrando(true);
            setErro(await entrar(email, senha));
            setEntrando(false);
          }}
        >
          <label className="campo">
            <span className="rotulo">E-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="campo">
            <span className="rotulo">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>
          {erro && <p className="mensagem-erro">{erro}</p>}
          <button type="submit" className="botao botao-primario" disabled={entrando}>
            {entrando ? "Entrando" : "Entrar"}
          </button>
        </form>
        <p className="vazio-texto">Esqueceu a senha? Peça ao dono do Viralizei para criar uma nova.</p>
      </div>
    </section>
  );
}
