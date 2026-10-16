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
  /** Uma frase imperativa: o vídeo a gravar hoje. Radares antigos não têm. */
  oQueFazer?: string;
  /** Passos na ordem de execução, cada um citando o padrão do estudo. */
  comoAplicar?: string[];
  textoNaTela: string;
  ganchoFalado: string;
  provaNaTela?: string;
  formato: string;
  diaCalendario: number | null;
  fonte: string;
}

export interface Radar {
  data: string;
  fontes: { tendencias?: Tendencia[]; videos?: VideoQuente[]; consultas?: string[]; manchete?: string; motivo?: string };
  ideias: Ideia[];
  resumo: string;
  modelo: string;
  criado_em: string;
}

/** "500000+" vira "500 mil+" (radares antigos guardaram o bruto do Google). */
export function trafegoLegivel(bruto: string) {
  const m = bruto.match(/^(\d+)(\+?)$/);
  if (!m) return bruto;
  const n = Number(m[1]);
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi${m[2]}`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} mil${m[2]}`;
  return bruto;
}

/** Manchete do dia: a gravada pela IA ou, nos radares antigos, a primeira frase do resumo. */
export function mancheteDe(radar: Radar) {
  if (radar.fontes.manchete) return radar.fontes.manchete;
  const primeira = radar.resumo.split(/(?<=[.!?])\s/)[0] ?? "";
  return primeira.length > 110 ? primeira.slice(0, 107).replace(/\s+\S*$/, "") + "…" : primeira;
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
