// Gera a página única do artefato: CSS e JS do build embutidos no HTML,
// sem <html>/<head>/<body> (o claude.ai põe o esqueleto na publicação).
// Uso: node scripts/artefato.mjs [saida.html]   (padrão: dist-artefato/pauta.html)
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const saida = process.argv[2] ?? "dist-artefato/pauta.html";

execSync("node node_modules/vite/bin/vite.js build --emptyOutDir", { stdio: "inherit" });

const assets = readdirSync("dist/assets");
const js = assets.find((f) => f.endsWith(".js"));
const css = assets.find((f) => f.endsWith(".css"));
if (!js || !css) throw new Error("Build sem JS ou CSS em dist/assets.");

// Um "</script" dentro do código fecharia a tag antes da hora.
const codigo = readFileSync(join("dist/assets", js), "utf8").replace(/<\/script/gi, "<\\/script");
const estilo = readFileSync(join("dist/assets", css), "utf8").replace(/<\/style/gi, "<\\/style");

const pagina = `<title>Pauta</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap">
<style>${estilo}</style>
<div id="raiz"></div>
<script type="module">${codigo}</script>
`;

mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, pagina);
console.log(`Página do artefato: ${saida} (${Math.round(pagina.length / 1024)} KB)`);
