import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { criarRotaExemplos } from "./server/gerarExemplos";
import { criarRotaRoteiro } from "./server/gerarRoteiro";

// A chave fica no servidor do Vite; o navegador só conhece /api/exemplos.
function rotaExemplos(chave: string | undefined): Plugin {
  const rota = criarRotaExemplos(chave);
  const roteiro = criarRotaRoteiro(chave);
  return {
    name: "rota-exemplos",
    configureServer(server) {
      server.middlewares.use("/api/exemplos", rota);
      server.middlewares.use("/api/roteiro", roteiro);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/exemplos", rota);
      server.middlewares.use("/api/roteiro", roteiro);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // Caminhos relativos: o site funciona em qualquer subpasta (GitHub Pages).
    base: "./",
    plugins: [react(), rotaExemplos(env.ANTHROPIC_API_KEY)],
  };
});
