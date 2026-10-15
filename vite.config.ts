import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { criarRotaExemplos } from "./server/gerarExemplos";
import { criarRotaRoteiro } from "./server/gerarRoteiro";
import { criarRotaAvaliar } from "./server/avaliarVideo";

// A chave fica no servidor do Vite; o navegador só conhece /api/exemplos.
function rotaExemplos(chave: string | undefined, chaveOpenAI?: string): Plugin {
  const rota = criarRotaExemplos(chave);
  const roteiro = criarRotaRoteiro(chave);
  const avaliar = criarRotaAvaliar(chave, chaveOpenAI);
  return {
    name: "rota-exemplos",
    configureServer(server) {
      server.middlewares.use("/api/exemplos", rota);
      server.middlewares.use("/api/roteiro", roteiro);
      server.middlewares.use("/api/avaliar", avaliar);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/exemplos", rota);
      server.middlewares.use("/api/roteiro", roteiro);
      server.middlewares.use("/api/avaliar", avaliar);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // Caminhos relativos: o site funciona em qualquer subpasta (GitHub Pages).
    base: "./",
    plugins: [react(), rotaExemplos(env.ANTHROPIC_API_KEY, env.OPENAI_API_KEY)],
  };
});
