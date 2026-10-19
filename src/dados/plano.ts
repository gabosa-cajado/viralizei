import { FORMATOS_HISTORIA } from "../../supabase/functions/gerar-roteiro/comum";
import { chamarRoteiroNoSite, ENTRADA_VAZIA, FORMATOS_ROTEIRO, type EntradaRoteiro } from "./roteiro";
import { supabase } from "./site";

// Plano 3-3-1 (Kallaway): 3 temas × 3 formatos = 9 vídeos; quando os 9 saem,
// o 10º dobra a combinação que mais rendeu. A IA (gerar-roteiro, modos
// "plano" e "dobrar") monta as células com os modelos do calendário e as
// fórmulas da conta; a tabela public.planos guarda (sócios leem e escrevem).
// Só no site: sem banco não há métricas para ligar a célula ao vídeo postado.

export interface Celula {
  tema: string;
  formato: string;
  layout: string;
  titulo: string;
  ganchoTela: string;
  ganchoFalado: string;
  tipoGancho: string;
  diaCalendario: number | null;
  porque: string;
  /** Publicação (metricas_publicacoes.id) em que a célula virou vídeo. */
  publicacaoId?: string | null;
}

export interface Plano {
  id: string;
  titulo: string;
  temas: string[];
  formatos: string[];
  celulas: Celula[];
  decimo: Celula | null;
  criado_por: string | null;
  criado_em: string;
}

export interface Publicacao {
  id: string;
  url: string | null;
  legenda: string;
  views: number | null;
  taxa_3s: number | null;
  salvos: number | null;
  publicado_em: string;
}

const SO_NO_SITE = "O Plano 3-3-1 usa a IA e as métricas do site. Abra o Viralizei pelo site e entre com a sua conta.";

export async function lerPlanos(): Promise<Plano[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("planos").select("*").order("criado_em", { ascending: false }).limit(20);
  if (error) throw new Error("Não deu para carregar os planos. Confira a internet e recarregue.");
  return (data ?? []) as Plano[];
}

/** Reels do Instagram já medidos, para ligar cada célula ao vídeo que saiu dela. */
export async function lerPublicacoes(): Promise<Publicacao[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("metricas_publicacoes")
    .select("id, url, legenda, views, taxa_3s, salvos, publicado_em")
    .eq("rede", "instagram")
    .eq("tipo", "reel")
    .order("publicado_em", { ascending: false })
    .limit(80);
  return (data ?? []) as Publicacao[];
}

export async function criarPlano(temas: string[], formatos: string[]): Promise<Plano> {
  const { celulas } = await chamarRoteiroNoSite<{ celulas: Celula[] }>({ modo: "plano", temas, formatos }, SO_NO_SITE);
  if (!supabase) throw new Error(SO_NO_SITE);
  const titulo = temas.join(" · ").slice(0, 120);
  const { data, error } = await supabase.from("planos").insert({ titulo, temas, formatos, celulas }).select("*").single();
  if (error) throw new Error("O plano saiu, mas não deu para guardar. Tente de novo.");
  return data as Plano;
}

export async function salvarCelulas(id: string, celulas: Celula[]) {
  if (!supabase) return;
  const { error } = await supabase.from("planos").update({ celulas }).eq("id", id);
  if (error) throw new Error("Não deu para guardar a mudança. Confira a internet e tente de novo.");
}

export async function apagarPlano(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("planos").delete().eq("id", id);
  if (error) throw new Error("Não deu para apagar o plano. Tente de novo.");
}

/** O 10º vídeo: a IA escolhe a combinação que mais rendeu (ou, sem vídeos ligados, a fórmula da conta). */
export async function dobrar(plano: Plano, publicacoes: Publicacao[]): Promise<Plano> {
  const porId = new Map(publicacoes.map((p) => [p.id, p]));
  const celulas = plano.celulas.map((c) => {
    const p = c.publicacaoId ? porId.get(c.publicacaoId) : undefined;
    return {
      tema: c.tema,
      formato: c.formato,
      layout: c.layout,
      tipoGancho: c.tipoGancho,
      titulo: c.titulo,
      resultado: p ? { views: p.views, taxa3s: p.taxa_3s, salvos: p.salvos } : null,
    };
  });
  const decimo = await chamarRoteiroNoSite<Celula>({ modo: "dobrar", celulas }, SO_NO_SITE);
  if (!supabase) throw new Error(SO_NO_SITE);
  const { error } = await supabase.from("planos").update({ decimo }).eq("id", plano.id);
  if (error) throw new Error("O 10º vídeo saiu, mas não deu para guardar. Tente de novo.");
  return { ...plano, decimo };
}

const FORMATO_NO_ROTEIRO: Record<string, string> = {
  lista: "Lista",
  ranking: "Lista",
  tutorial: "Tutorial na tela",
  comparativo: "Comparativo",
  bastidores: "Bastidores",
  conversa: "Conversa com convidado",
  reacao: "React (vídeo de outra pessoa)",
};

/** Preenche o formulário do Roteiro com a célula (o Roteiro lê do navegador ao abrir). */
export function levarParaRoteiro(c: Celula) {
  let atual: EntradaRoteiro = ENTRADA_VAZIA;
  try {
    const bruto = localStorage.getItem("pauta:roteiro-entrada");
    if (bruto) atual = { ...ENTRADA_VAZIA, ...(JSON.parse(bruto) as Partial<EntradaRoteiro>) };
  } catch {
    // começa vazio
  }
  const formato = FORMATO_NO_ROTEIRO[c.formato] ?? (c.layout === "acao" ? "Walk-and-talk" : FORMATOS_ROTEIRO[0]);
  const nova: EntradaRoteiro = {
    ...atual,
    tema: `${c.titulo}. Gancho: "${c.ganchoFalado}"`.slice(0, 300),
    resultado: "",
    prova: "",
    historia: "",
    posicao: "",
    formato,
  };
  try {
    localStorage.setItem("pauta:roteiro-entrada", JSON.stringify(nova));
    localStorage.setItem("pauta:roteiro-modo", JSON.stringify("montar"));
  } catch {
    // sem armazenamento: o Roteiro abre como estava
  }
}

/** Formatos para escolher: dois fáceis e um ambicioso é o equilíbrio do método. */
export const FORMATOS_PADRAO = ["lista", "opiniao", "caso"];
export const formatoFacil = (id: string) => FORMATOS_HISTORIA.find((f) => f.id === id)?.facil ?? false;
