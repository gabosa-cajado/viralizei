import type { Clima } from "./trilhas";
import { chamarRoteiroNoSite, ENTRADA_VAZIA, FORMATOS_ROTEIRO, type EntradaRoteiro } from "./roteiro";
import { supabase } from "./site";
import type { Dia, Formato } from "./tipos";

// Laboratório de ideias: qualquer sócio joga uma ideia crua; ela é lapidada
// (com IA no site, pela função gerar-roteiro no modo "ideia"; sem IA, por
// regras com os modelos de gancho do calendário) e segue para o Roteiro.
// - site: tabela public.ideias (sócios leem, criam, editam e apagam; o autor
//   é sempre auth.uid()).
// - artefato e local: no navegador.

export type StatusIdeia = "fila" | "lapidada" | "roteiro" | "descartada";

export const STATUS: { id: StatusIdeia; nome: string; vazio: string }[] = [
  { id: "fila", nome: "Na fila", vazio: "Nenhuma ideia na fila. Escreva a primeira acima." },
  { id: "lapidada", nome: "Lapidadas", vazio: "Nenhuma ideia lapidada ainda. Na fila, clique em Lapidar." },
  { id: "roteiro", nome: "No roteiro", vazio: "Nenhuma ideia foi para o Roteiro ainda." },
  { id: "descartada", nome: "Descartadas", vazio: "Nada descartado." },
];

export interface GanchoLapidado {
  textoNaTela: string;
  ganchoFalado: string;
  padrao: string;
  diaCalendario: number | null;
}

export interface Lapidacao {
  resumo: string;
  angulo: string;
  publico: string;
  ganchos: GanchoLapidado[];
  formato: string;
  climaTrilha: Clima;
  provaSugerida: string;
  proximoPasso: string;
  riscos: string[];
}

export interface Ideia {
  id: string;
  texto: string;
  origemUrl: string | null;
  status: StatusIdeia;
  lapidacao: Lapidacao | null;
  lapidadaCom: "ia" | "regras" | null;
  /** null no modo local: foi você. */
  criadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

const CHAVE_LOCAL = "pauta:ideias";

function lerLocal(): Ideia[] {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCAL);
    return bruto ? (JSON.parse(bruto) as Ideia[]) : [];
  } catch {
    return [];
  }
}

function gravarLocal(ideias: Ideia[]) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(ideias));
  } catch {
    // Sem armazenamento: vale só nesta aba.
  }
}

interface Linha {
  id: string;
  texto: string;
  origem_url: string | null;
  status: StatusIdeia;
  lapidacao: Lapidacao | null;
  lapidada_com: "ia" | "regras" | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

function daLinha(l: Linha): Ideia {
  return {
    id: l.id,
    texto: l.texto,
    origemUrl: l.origem_url,
    status: l.status,
    lapidacao: l.lapidacao,
    lapidadaCom: l.lapidada_com,
    criadoPor: l.criado_por,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

function erroDeEscrita(mensagem: string, e: { code?: string } | null) {
  if (e?.code === "23514") return new Error("A ideia precisa de pelo menos 5 letras, e o link precisa começar com https://.");
  return new Error(mensagem);
}

export async function carregarIdeias(noSiteLogado: boolean): Promise<Ideia[]> {
  if (!noSiteLogado || !supabase) return lerLocal();
  const { data, error } = await supabase.from("ideias").select("*").order("criado_em", { ascending: false }).limit(500);
  if (error) throw new Error("Não deu para carregar as ideias. Confira a internet e recarregue.");
  return (data as Linha[]).map(daLinha);
}

export async function criarIdeia(noSiteLogado: boolean, texto: string, origemUrl: string): Promise<Ideia> {
  const limpo = texto.trim();
  const origem = origemUrl.trim() || null;
  if (limpo.length < 5) throw new Error("Escreva a ideia em pelo menos uma frase.");
  if (origem && !/^https:\/\//.test(origem)) throw new Error("O link precisa começar com https://.");
  if (!noSiteLogado || !supabase) {
    const agora = new Date().toISOString();
    const nova: Ideia = {
      id: `i${Date.now().toString(36)}`,
      texto: limpo,
      origemUrl: origem,
      status: "fila",
      lapidacao: null,
      lapidadaCom: null,
      criadoPor: null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    gravarLocal([nova, ...lerLocal()]);
    return nova;
  }
  const { data, error } = await supabase.from("ideias").insert({ texto: limpo, origem_url: origem }).select("*").single();
  if (error) throw erroDeEscrita("Não deu para guardar a ideia. Tente de novo.", error);
  return daLinha(data as Linha);
}

type Campos = Partial<Pick<Ideia, "status" | "lapidacao" | "lapidadaCom">>;

export async function atualizarIdeia(noSiteLogado: boolean, id: string, campos: Campos): Promise<void> {
  if (!noSiteLogado || !supabase) {
    gravarLocal(lerLocal().map((i) => (i.id === id ? { ...i, ...campos, atualizadoEm: new Date().toISOString() } : i)));
    return;
  }
  const linha: Record<string, unknown> = {};
  if (campos.status) linha.status = campos.status;
  if (campos.lapidacao !== undefined) linha.lapidacao = campos.lapidacao;
  if (campos.lapidadaCom !== undefined) linha.lapidada_com = campos.lapidadaCom;
  const { error } = await supabase.from("ideias").update(linha).eq("id", id);
  if (error) throw erroDeEscrita("Não deu para salvar. Tente de novo.", error);
}

export async function apagarIdeia(noSiteLogado: boolean, id: string): Promise<void> {
  if (!noSiteLogado || !supabase) {
    gravarLocal(lerLocal().filter((i) => i.id !== id));
    return;
  }
  const { error } = await supabase.from("ideias").delete().eq("id", id);
  if (error) throw erroDeEscrita("Não deu para apagar. Tente de novo.", error);
}

// ---------- Lapidar ----------

export function lapidarComIA(ideia: string, nicho: string): Promise<Lapidacao> {
  return chamarRoteiroNoSite<Lapidacao>(
    { modo: "ideia", ideia, nicho },
    "Lapidar com IA usa a IA do site. Use \"Lapidar sem IA\" ou abra o Viralizei pelo site.",
  );
}

const PALAVRAS_VAZIAS = new Set(
  "para pelo pela como mais mas que com sem uma umas uns dos das nos nas por isso esse essa este esta você voce quando sobre entre muito muita tudo nada porque ainda depois antes onde quem qual cada mesmo".split(" "),
);

function palavras(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 3 && !PALAVRAS_VAZIAS.has(p));
}

function primeiraFrase(texto: string) {
  const frase = texto.trim().split(/(?<=[.!?])\s/)[0] ?? texto;
  return frase.length > 160 ? frase.slice(0, 157).replace(/\s+\S*$/, "") + "…" : frase;
}

/**
 * Sem IA: escolhe quatro modelos de gancho do calendário, de formatos
 * diferentes, pelos que mais compartilham palavras com a ideia. Quem lapida
 * preenche as lacunas.
 */
export function lapidarPorRegras(ideia: string, dias: Dia[], formatos: Formato[]): Lapidacao {
  const daIdeia = new Set(palavras(ideia));
  const semente = [...ideia].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pontuados = dias
    .map((d, i) => ({
      d,
      pontos: palavras(`${d.gancho} ${d.descricao}`).filter((p) => daIdeia.has(p)).length,
      desempate: (i * 2654435761 + semente) >>> 0,
    }))
    .sort((a, b) => b.pontos - a.pontos || a.desempate - b.desempate);
  const escolhidos: Dia[] = [];
  const formatosUsados = new Set<string>();
  const textosUsados = new Set<string>();
  for (const { d } of pontuados) {
    if (escolhidos.length >= 4) break;
    const textoNormal = d.gancho.trim().toLowerCase();
    if (formatosUsados.has(d.formatoId) || textosUsados.has(textoNormal)) continue;
    escolhidos.push(d);
    formatosUsados.add(d.formatoId);
    textosUsados.add(textoNormal);
  }
  const nomeFormato = (id: string) => formatos.find((f) => f.id === id)?.nome ?? id;
  return {
    resumo: primeiraFrase(ideia),
    angulo: "Sem IA, o ângulo fica com você: qual é a sua posição firme sobre isso, e o que quase ninguém diz?",
    publico: "",
    ganchos: escolhidos.map((d) => ({
      textoNaTela: d.gancho,
      ganchoFalado: "Preencha as lacunas com a sua ideia e fale em até 12 palavras.",
      padrao: `Modelo do dia ${d.numero} (${nomeFormato(d.formatoId)})`,
      diaCalendario: d.numero,
    })),
    formato: escolhidos[0] ? nomeFormato(escolhidos[0].formatoId) : "Fala para câmera",
    climaTrilha: "reflexiva",
    provaSugerida: "Um número, um print ou um caso seu que prove a ideia na tela.",
    proximoPasso: "Escolha um gancho, preencha as lacunas e leve para o Roteiro.",
    riscos: [],
  };
}

// ---------- Ir para o Roteiro ----------

/** Preenche o formulário do Roteiro com a ideia lapidada (o Roteiro lê do navegador ao abrir). */
export function prepararRoteiro(ideia: Ideia) {
  let atual: EntradaRoteiro = ENTRADA_VAZIA;
  try {
    const bruto = localStorage.getItem("pauta:roteiro-entrada");
    if (bruto) atual = { ...ENTRADA_VAZIA, ...(JSON.parse(bruto) as Partial<EntradaRoteiro>) };
  } catch {
    // começa vazio
  }
  const l = ideia.lapidacao;
  const formato = l && FORMATOS_ROTEIRO.includes(l.formato) ? l.formato : atual.formato;
  const nova: EntradaRoteiro = {
    ...atual,
    tema: l?.resumo || ideia.texto.slice(0, 300),
    publico: l?.publico || "",
    resultado: "",
    prova: "",
    historia: "",
    posicao: l?.angulo && !l.angulo.startsWith("Sem IA") ? l.angulo : "",
    formato,
  };
  try {
    localStorage.setItem("pauta:roteiro-entrada", JSON.stringify(nova));
    localStorage.setItem("pauta:roteiro-modo", JSON.stringify("montar"));
  } catch {
    // sem armazenamento: o Roteiro abre como estava
  }
}
