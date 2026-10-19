import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./site";

// Recomendações do dia: a Edge Function recomendacoes-do-dia lê as métricas
// da conta (public.metricas_*, vindas do Metricool), calcula os números e grava
// uma linha por dia em public.recomendacoes (pg_cron às 7h30 de Brasília).
// O site só lê; "Atualizar agora" chama a função com a sessão do sócio.
// Os tipos espelham supabase/functions/recomendacoes-do-dia/numeros.ts.

export interface Resumo {
  n: number;
  medianaViews: number | null;
  mediaTaxa3s: number | null;
  mediaTempoMedio: number | null;
  mediaRetencao: number | null;
  salvosPorMil: number | null;
  compartPorMil: number | null;
  comentariosPorMil: number | null;
}

export interface Item {
  id: string;
  url: string | null;
  titulo: string;
  rede: string;
  tipo: string;
  data: string;
  views: number | null;
  taxa3s: number | null;
  tempoMedio: number | null;
  retencao: number | null;
  salvos: number | null;
  compartilhamentos: number | null;
  tema: string | null;
}

/** Desempenho de um grupo de reels (fórmula, formato, layout ou tipo de gancho). */
export interface Desempenho {
  n: number;
  medianaViews: number | null;
  mediaTaxa3s: number | null;
  salvosPorMil: number | null;
}

export interface DesempenhoTipo extends Desempenho {
  tipo: string;
}

export interface Formula extends Desempenho {
  tema: string;
  formato: string;
  layout: string;
  exemplo: { titulo: string; url: string | null } | null;
}

export interface Numeros {
  dadosAte: string | null;
  seguidores: { atual: number; inicio: number; desde: string; ganhosNoPeriodo: number } | null;
  reels: Resumo;
  carrosseis: Resumo;
  tiktok: Resumo;
  reelsUltimos14: Resumo;
  reels14Anteriores: Resumo;
  topReels: Item[];
  ganchosFracos: Item[];
  chamada: { comComenta: Resumo; semComenta: Resumo };
  repetidos: { titulo: string; versoes: { url: string | null; views: number | null; taxa3s: number | null; data: string }[] }[];
  melhoresHorarios: { dia: string; hora: number; valor: number }[];
  horasPostadas: { faixa: string; n: number; medianaViews: number | null }[];
  duracao: { faixa: string; n: number; medianaViews: number | null; mediaTaxa3s: number | null }[];
  publico: {
    total: number;
    faixas: { faixa: string; pct: number }[];
    genero: { masculino: number; feminino: number; naoInformado: number };
    paises: { chave: string; pct: number }[];
    cidades: { chave: string; pct: number }[];
  } | null;
  temas: { tema: string; n: number; medianaViews: number | null; mediaTaxa3s: number | null; salvosPorMil: number | null }[];
  formulas?: Formula[];
  formatos?: (Desempenho & { formato: string })[];
  layouts?: (Desempenho & { layout: string })[];
  tiposGancho?: DesempenhoTipo[];
  sincronia?: { ok: boolean; mensagem: string; publicacoes?: number };
  publicacoesLidas?: number;
}

export type Area = "gancho" | "retencao" | "tema" | "formato" | "chamada" | "horario" | "frequencia" | "publico";

export interface Recomendacao {
  titulo: string;
  area: Area;
  prioridade: "alta" | "media" | "baixa";
  porque: string;
  acao: string;
  diaCalendario: number | null;
}

export interface Conteudo {
  manchete: string;
  diagnostico: string;
  destaques: { titulo: string; evidencia: string; leitura: string }[];
  recomendacoes: Recomendacao[];
  gravarHoje: { tema: string; ganchoTela: string; ganchoFalado: string; formato: string; chamada: string; porque: string; diaCalendario: number | null };
  postar: { quando: string; porque: string };
  parar: string[];
  publico: string;
  motivo?: string;
}

export interface Recomendacoes {
  data: string;
  manchete: string;
  diagnostico: string;
  conteudo: Conteudo;
  numeros: Numeros;
  dados_ate: string | null;
  fonte: string;
  modelo: string;
  criado_em: string;
}

export const NOME_DA_AREA: Record<Area, string> = {
  gancho: "Gancho",
  retencao: "Retenção",
  tema: "Tema",
  formato: "Formato",
  chamada: "Chamada",
  horario: "Horário",
  frequencia: "Frequência",
  publico: "Público",
};

export async function lerRecomendacoes(): Promise<Recomendacoes[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("recomendacoes").select("*").order("data", { ascending: false }).limit(7);
  if (error) throw new Error("Não deu para carregar as recomendações. Confira a internet e recarregue.");
  return (data ?? []) as Recomendacoes[];
}

export async function rodarRecomendacoes(): Promise<Recomendacoes> {
  if (!supabase) throw new Error("As recomendações existem só no site.");
  const { data, error } = await supabase.functions.invoke("recomendacoes-do-dia", { body: {} });
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
    throw new Error(corpo.erro ?? "As recomendações não responderam. Tente de novo em instantes.");
  }
  return data as Recomendacoes;
}
