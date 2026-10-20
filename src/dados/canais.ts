import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./site";

// Canais acompanhados e os vídeos deles com a nota de outlier (views ÷
// mediana de views do próprio canal, a conta do Sandcastles). Sócios leem,
// adicionam (rede e @), pausam e removem canais; os vídeos só o banco grava,
// pela função carregar_canal: a Edge Function atualizar-canais (YouTube, todo
// dia) ou a rotina no Chrome do autor (Instagram e TikTok, que pedem sessão).

export type Rede = "instagram" | "youtube" | "tiktok";

export const REDES: { id: Rede; nome: string }[] = [
  { id: "instagram", nome: "Instagram" },
  { id: "youtube", nome: "YouTube" },
  { id: "tiktok", nome: "TikTok" },
];

export const nomeRede = (r: string) => REDES.find((x) => x.id === r)?.nome ?? r;

export interface Canal {
  id: string;
  rede: Rede;
  handle: string;
  nome: string;
  ativo: boolean;
  seguidores: number | null;
  mediana_views: number | null;
  videos_na_mediana: number;
  coletado_em: string | null;
  erro_coleta: string | null;
  criado_em: string;
}

export interface VideoCanal {
  id: string;
  canal_id: string;
  url: string;
  legenda: string;
  views: number | null;
  curtidas: number | null;
  comentarios: number | null;
  duracao_seg: number | null;
  publicado_em: string | null;
  /** Data em que o vídeo apareceu na coleta (o YouTube não dá a data ao servidor). */
  data_estimada: boolean;
  outlier: number | null;
  engajamento: number | null;
}

export interface Filtro {
  canalId: string;
  rede: "" | Rede;
  notaMinima: number;
  dias: number;
}

export const FILTRO_PADRAO: Filtro = { canalId: "", rede: "", notaMinima: 2, dias: 0 };

const SO_NO_SITE = "A aba Canais usa o banco do site. Abra o Viralizei pelo site e entre com a sua conta.";

export async function lerCanais(): Promise<Canal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("canais").select("*").order("nome");
  if (error) throw new Error("Não deu para carregar os canais. Confira a internet e recarregue.");
  return data as Canal[];
}

export async function lerVideos(f: Filtro, canais: Canal[]): Promise<VideoCanal[]> {
  if (!supabase) return [];
  let q = supabase
    .from("canal_videos")
    .select("id, canal_id, url, legenda, views, curtidas, comentarios, duracao_seg, publicado_em, data_estimada, outlier, engajamento")
    .gte("outlier", f.notaMinima)
    .order("outlier", { ascending: false })
    .limit(150);
  if (f.canalId) q = q.eq("canal_id", f.canalId);
  else if (f.rede) {
    const ids = canais.filter((c) => c.rede === f.rede).map((c) => c.id);
    if (!ids.length) return [];
    q = q.in("canal_id", ids);
  }
  if (f.dias > 0) q = q.gte("publicado_em", new Date(Date.now() - f.dias * 86_400_000).toISOString());
  const { data, error } = await q;
  if (error) throw new Error("Não deu para carregar os vídeos. Confira a internet e recarregue.");
  return data as VideoCanal[];
}

/** Lê um link de perfil ou um @: devolve rede e @ quando dá para saber. */
export function lerCanalDoTexto(texto: string, redePadrao: Rede): { rede: Rede; handle: string } | null {
  const t = texto.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//.test(t) ? t : `https://${t}`);
    const host = u.hostname.replace(/^(www|m)\./, "");
    const partes = u.pathname.split("/").filter(Boolean);
    if (host === "instagram.com" && partes[0] && !["reel", "p", "reels", "explore"].includes(partes[0])) {
      return { rede: "instagram", handle: partes[0].toLowerCase() };
    }
    if (host === "youtube.com" && partes[0]?.startsWith("@")) return { rede: "youtube", handle: partes[0].slice(1).toLowerCase() };
    if (host === "tiktok.com" && partes[0]?.startsWith("@")) return { rede: "tiktok", handle: partes[0].slice(1).toLowerCase() };
  } catch {
    // não é link: tenta como @
  }
  const handle = t.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._-]{1,60}$/.test(handle) ? { rede: redePadrao, handle } : null;
}

export async function adicionarCanal(rede: Rede, handle: string, nome: string): Promise<Canal> {
  if (!supabase) throw new Error(SO_NO_SITE);
  const { data, error } = await supabase
    .from("canais")
    .insert({ rede, handle, nome: nome.trim().slice(0, 120) })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Esse canal já está na lista.");
    if (error.code === "23514") throw new Error("O @ só pode ter letras, números, ponto, traço e sublinhado.");
    throw new Error("Não deu para adicionar o canal. Tente de novo.");
  }
  return data as Canal;
}

export async function pausarCanal(id: string, ativo: boolean) {
  if (!supabase) throw new Error(SO_NO_SITE);
  const { error } = await supabase.from("canais").update({ ativo }).eq("id", id);
  if (error) throw new Error("Não deu para mudar o canal. Tente de novo.");
}

export async function removerCanal(id: string) {
  if (!supabase) throw new Error(SO_NO_SITE);
  const { error } = await supabase.from("canais").delete().eq("id", id);
  if (error) throw new Error("Não deu para remover o canal. Tente de novo.");
}

/** Roda a função atualizar-canais (só YouTube); um canal ou todos. */
export async function atualizarYouTube(canalId?: string): Promise<{ handle: string; videos: number; erro?: string }[]> {
  if (!supabase) throw new Error(SO_NO_SITE);
  const { data, error } = await supabase.functions.invoke("atualizar-canais", { body: canalId ? { canalId } : {} });
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
    throw new Error(corpo.erro ?? "Não deu para atualizar agora. Confira a internet e tente de novo.");
  }
  return (data as { canais: { handle: string; videos: number; erro?: string }[] }).canais;
}

/** Primeira linha da legenda, sem hashtag, para caber num cartão. */
export function tituloDoVideo(legenda: string, max = 140) {
  const linha = (legenda.split("\n").find((l) => l.trim()) ?? "").replace(/#\S+/g, "").trim();
  if (!linha) return "(sem legenda)";
  return linha.length > max ? linha.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : linha;
}

export function numeroCurto(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return n.toLocaleString("pt-BR");
}

/** Leva um vídeo fora da curva para o Roteiro em etapas (o Roteiro lê do navegador ao abrir). */
export function levarParaEtapas(v: VideoCanal, canal: Canal | undefined) {
  const base = `${v.url}\n${canal ? `${canal.nome || "@" + canal.handle} (${nomeRede(canal.rede)}), ` : ""}${numeroCurto(v.views)} views, ${v.outlier ?? "?"}x a mediana do canal.\nLegenda: ${tituloDoVideo(v.legenda, 300)}`;
  try {
    localStorage.setItem("pauta:etapas-base", JSON.stringify(base));
    localStorage.setItem("pauta:roteiro-modo", JSON.stringify("etapas"));
  } catch {
    // sem armazenamento: o Roteiro abre como estava
  }
}
