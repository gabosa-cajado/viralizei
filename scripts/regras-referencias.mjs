// Gera, a partir de conteudo/referencias.json, o texto de regras que as
// Edge Functions (gerar-roteiro, radar-trends) e a rota local do roteiro
// colocam no prompt. Assim o que a IA segue é exatamente o estudo publicado
// na seção Referências. Rode: npm run regras
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ref = JSON.parse(readFileSync(join(raiz, "conteudo/referencias.json"), "utf8"));

const linhas = [];
linhas.push(`ESTUDO DE REFERÊNCIAS (${ref.atualizado}): ${ref.criadores.map((c) => `${c.nome} (${c.nicho})`).join("; ")}.`);
linhas.push("");
linhas.push("PADRÕES QUE SE REPETEM NOS CINCO:");
for (const p of ref.padroes) linhas.push(`- ${p.titulo}. ${p.texto}`);
linhas.push("");
linhas.push("CHECKLISTS (o roteiro precisa passar em cada item):");
for (const c of ref.checklists) {
  linhas.push(`${c.titulo} [${c.fonte}]:`);
  for (const i of c.itens) linhas.push(`  - ${i}`);
}
linhas.push("");
linhas.push("FRAMEWORKS COM NOME (cite pelo nome quando usar):");
for (const f of ref.frameworks) linhas.push(`- ${f.nome}: ${f.resumo}`);

const texto = linhas.join("\n");
const nomes = [
  ...ref.padroes.map((p) => p.titulo),
  ...ref.frameworks.map((f) => f.nome),
];

const arquivo = `// GERADO por scripts/regras-referencias.mjs a partir de conteudo/referencias.json.
// Não edite à mão: mude o JSON e rode "npm run regras".
export const REGRAS_ATUALIZADO = ${JSON.stringify(ref.atualizado)};
export const CRIADORES = ${JSON.stringify(ref.criadores.map((c) => c.nome))};
export const NOMES_DOS_PADROES: string[] = ${JSON.stringify(nomes)};
export const REGRAS = ${JSON.stringify(texto)};
`;

for (const destino of ["supabase/functions/gerar-roteiro/regras.ts", "supabase/functions/radar-trends/regras.ts", "supabase/functions/recomendacoes-do-dia/regras.ts", "server/regras.ts"]) {
  writeFileSync(join(raiz, destino), arquivo);
  console.log("escrito", destino);
}
console.log(texto.length, "caracteres de regras");
