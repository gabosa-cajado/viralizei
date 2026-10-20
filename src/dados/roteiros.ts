import { chamarRoteiroNoSite, type EntradaRoteiro, type Roteiro } from "./roteiro";
import { supabase } from "./site";

// Roteiro em etapas (como o Sandcastles: pesquisa → gancho → estrutura →
// rascunho) com histórico de versões. Só no site: tabela public.roteiros
// (as etapas em jsonb; sócios leem, criam, editam e apagam) e
// public.roteiro_versoes (cada versão do texto; o número vem do banco e
// versão não se edita, só se cria outra).

export interface Pesquisa {
  resumo: string;
  crencaComum: string;
  realidadeContraria: string;
  erroComum: string;
  fatos: { texto: string; conferir: string }[];
  perguntas: string[];
  angulos: { titulo: string; porque: string }[];
  referencias: { url: string; porque: string }[];
}

export interface GanchoOpcao {
  textoNaTela: string;
  ganchoFalado: string;
  tipo: string;
  diaCalendario: number | null;
  inspiracao: string;
  porque: string;
}

export interface Batida {
  titulo: string;
  papel: string;
  oQueDizer: string;
}

export interface Esboco {
  formato: string;
  batidas: Batida[];
  religar: string;
  fechamento: string;
  avisos: string[];
}

export interface Etapas {
  tema: string;
  base: string;
  pesquisa: Pesquisa | null;
  anotacoes: string;
  ganchos: GanchoOpcao[];
  gancho: GanchoOpcao | null;
  formatoHistoria: string;
  contraste: string[];
  duracao: string;
  esboco: Esboco | null;
  formato: string;
  cta: string;
}

export const CONTRASTES = [
  "Crença comum contra realidade contrária",
  "Erro comum (e o certo)",
  "Aprendizado pessoal (eu achava, descobri)",
  "Antes e depois",
];

export const ETAPAS_VAZIAS: Etapas = {
  tema: "",
  base: "",
  pesquisa: null,
  anotacoes: "",
  ganchos: [],
  gancho: null,
  formatoHistoria: "erro",
  contraste: [CONTRASTES[0]],
  duracao: "60",
  esboco: null,
  formato: "Fala para câmera",
  cta: "Pergunta de uma palavra nos comentários",
};

export type Origem = "regras" | "ia" | "melhorar" | "duracao" | "traducao";

export const NOME_ORIGEM: Record<Origem, string> = {
  regras: "por regras",
  ia: "escrita com IA",
  melhorar: "melhorada com IA",
  duracao: "nova duração",
  traducao: "tradução",
};

export interface RoteiroSalvo {
  id: string;
  titulo: string;
  etapas: Etapas;
  criado_em: string;
  atualizado_em: string;
}

export interface Versao {
  id: string;
  roteiro_id: string;
  numero: number;
  origem: Origem;
  nota: string;
  conteudo: Roteiro;
  criado_em: string;
}

const SO_NO_SITE = "O Roteiro em etapas usa a IA e o banco do site. Abra o Viralizei pelo site e entre com a sua conta.";

function exigir() {
  if (!supabase) throw new Error(SO_NO_SITE);
  return supabase;
}

export async function lerRoteiros(): Promise<RoteiroSalvo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("roteiros").select("*").order("atualizado_em", { ascending: false }).limit(50);
  if (error) throw new Error("Não deu para carregar os roteiros. Confira a internet e recarregue.");
  return (data as RoteiroSalvo[]).map((r) => ({ ...r, etapas: { ...ETAPAS_VAZIAS, ...r.etapas } }));
}

const tituloDe = (e: Etapas) => (e.tema.trim() || "Roteiro sem tema").slice(0, 160);

export async function criarRoteiro(etapas: Etapas): Promise<RoteiroSalvo> {
  const { data, error } = await exigir().from("roteiros").insert({ titulo: tituloDe(etapas), etapas }).select("*").single();
  if (error) throw new Error("Não deu para guardar o roteiro. Tente de novo.");
  return data as RoteiroSalvo;
}

export async function salvarEtapas(id: string, etapas: Etapas): Promise<void> {
  const { error } = await exigir().from("roteiros").update({ titulo: tituloDe(etapas), etapas }).eq("id", id);
  if (error) throw new Error("Não deu para guardar as etapas. Confira a internet e tente de novo.");
}

export async function apagarRoteiro(id: string): Promise<void> {
  const { error } = await exigir().from("roteiros").delete().eq("id", id);
  if (error) throw new Error("Não deu para apagar o roteiro. Tente de novo.");
}

export async function lerVersoes(roteiroId: string): Promise<Versao[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("roteiro_versoes").select("*").eq("roteiro_id", roteiroId).order("numero", { ascending: false });
  if (error) throw new Error("Não deu para carregar as versões. Confira a internet e recarregue.");
  return data as Versao[];
}

export async function salvarVersao(roteiroId: string, origem: Origem, nota: string, conteudo: Roteiro): Promise<Versao> {
  const { data, error } = await exigir()
    .from("roteiro_versoes")
    .insert({ roteiro_id: roteiroId, origem, nota: nota.slice(0, 200), conteudo })
    .select("*")
    .single();
  if (error) throw new Error("O roteiro saiu, mas não deu para guardar a versão. Copie o texto antes de sair.");
  return data as Versao;
}

// ---------- IA (Edge Function gerar-roteiro) ----------

export function pesquisar(tema: string, base: string): Promise<Pesquisa> {
  return chamarRoteiroNoSite<Pesquisa>({ modo: "pesquisa", tema, base }, SO_NO_SITE);
}

export function pesquisaEmTexto(p: Pesquisa | null, anotacoes: string): string {
  if (!p) return anotacoes.trim() ? `Anotações do autor: ${anotacoes.trim()}` : "";
  return [
    `Resumo: ${p.resumo}`,
    `Crença comum: ${p.crencaComum}`,
    `Realidade contrária: ${p.realidadeContraria}`,
    `Erro comum: ${p.erroComum}`,
    `Fatos (conferir antes de gravar): ${p.fatos.map((f) => `${f.texto} [conferir: ${f.conferir}]`).join(" | ")}`,
    `Perguntas do público: ${p.perguntas.join(" | ")}`,
    `Ângulos: ${p.angulos.map((a) => `${a.titulo} (${a.porque})`).join(" | ")}`,
    anotacoes.trim() ? `Anotações do autor (valem mais que o resto): ${anotacoes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sugerirGanchos(e: Etapas): Promise<GanchoOpcao[]> {
  const r = await chamarRoteiroNoSite<{ ganchos: GanchoOpcao[] }>(
    { modo: "ganchos", tema: e.tema, pesquisa: pesquisaEmTexto(e.pesquisa, e.anotacoes) },
    SO_NO_SITE,
  );
  return r.ganchos;
}

const ganchoEmTexto = (g: GanchoOpcao) => `Na tela: ${g.textoNaTela.replace(/\n/g, " / ")} | Falado: ${g.ganchoFalado}`;

export function montarEsboco(e: Etapas): Promise<Esboco> {
  if (!e.gancho) throw new Error("Escolha um gancho antes de montar o esboço.");
  return chamarRoteiroNoSite<Esboco>(
    {
      modo: "esboco",
      tema: e.tema,
      pesquisa: pesquisaEmTexto(e.pesquisa, e.anotacoes),
      gancho: ganchoEmTexto(e.gancho),
      formatoHistoria: e.formatoHistoria,
      contraste: e.contraste,
      duracao: e.duracao,
    },
    SO_NO_SITE,
  );
}

/** O material das três etapas, no texto que o modo "criar" recebe em "etapas". */
export function etapasEmTexto(e: Etapas): string {
  return [
    e.gancho ? `GANCHO ESCOLHIDO: ${ganchoEmTexto(e.gancho)}` : "",
    e.esboco
      ? `ESBOÇO (${e.esboco.formato}):\n${e.esboco.batidas.map((b, i) => `${i + 1}. ${b.titulo} [${b.papel}]: ${b.oQueDizer}`).join("\n")}\nReligar perto da metade: ${e.esboco.religar}\nFechamento: ${e.esboco.fechamento}`
      : "",
    `PESQUISA:\n${pesquisaEmTexto(e.pesquisa, e.anotacoes)}`,
    e.base.trim() ? `VÍDEO DE REFERÊNCIA (adapte o mecanismo, não copie o texto): ${e.base.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function escreverComEtapas(e: Etapas): Promise<Roteiro> {
  const entrada: Partial<EntradaRoteiro> & { modo: string; etapas: string } = {
    modo: "criar",
    tema: e.tema,
    posicao: e.pesquisa?.realidadeContraria ?? "",
    formato: e.formato,
    duracao: e.duracao,
    cta: e.cta,
    etapas: etapasEmTexto(e),
  };
  return chamarRoteiroNoSite<Roteiro>(entrada, SO_NO_SITE);
}

export function ajustarDuracao(r: Roteiro, duracao: string): Promise<Roteiro> {
  return chamarRoteiroNoSite<Roteiro>({ modo: "ajustar", roteiro: r, duracao }, SO_NO_SITE);
}

export function traduzir(r: Roteiro, idioma: "inglês" | "espanhol"): Promise<Roteiro> {
  return chamarRoteiroNoSite<Roteiro>({ modo: "ajustar", roteiro: r, idioma }, SO_NO_SITE);
}
