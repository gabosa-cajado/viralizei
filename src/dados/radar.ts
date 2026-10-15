import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./site";

// Radar diário: a Edge Function radar-trends grava uma linha por dia em
// public.radar (pg_cron às 7h de Brasília). O site só lê; "Atualizar agora"
// chama a função com a sessão do sócio.

export interface Tendencia {
  titulo: string;
  trafego: string;
  noticia: string;
  url: string;
}

export interface VideoQuente {
  consulta: string;
  id: string;
  titulo: string;
  canal: string;
  views: string;
  viewsNumero: number;
  publicado: string;
  duracao: string;
  url: string;
}

export interface Ideia {
  titulo: string;
  porqueAgora: string;
  textoNaTela: string;
  ganchoFalado: string;
  formato: string;
  diaCalendario: number | null;
  fonte: string;
}

export interface Radar {
  data: string;
  fontes: { tendencias?: Tendencia[]; videos?: VideoQuente[]; consultas?: string[] };
  ideias: Ideia[];
  resumo: string;
  modelo: string;
  criado_em: string;
}

export async function lerRadares(): Promise<Radar[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("radar").select("*").order("data", { ascending: false }).limit(7);
  if (error) throw new Error("Não deu para carregar o radar. Confira a internet e recarregue.");
  return (data ?? []) as Radar[];
}

export async function rodarRadar(): Promise<Radar> {
  if (!supabase) throw new Error("O radar existe só no site.");
  const { data, error } = await supabase.functions.invoke("radar-trends", { body: {} });
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
    throw new Error(corpo.erro ?? "O radar não respondeu. Tente de novo em instantes.");
  }
  return data as Radar;
}
