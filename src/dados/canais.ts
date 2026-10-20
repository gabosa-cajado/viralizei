import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./site";

// Canais acompanhados e os vídeos deles com a nota de outlier (views ÷
// mediana de views do próprio canal, a conta do Sandcastles). Sócios leem,
// adicionam (rede e @), pausam e removem canais e marcam ganchos favoritos; os
// vídeos só o banco grava, pela função carregar_canal: a Edge Function
// atualizar-canais (YouTube, todo dia) ou a rotina de coleta (Instagram e
// TikTok). A análise (gancho como modelo, tipo, formato, ideia) vem da Edge
// Function analisar-videos; as sugestões de canais, da sugerir-canais.

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
  capa_url: string | null;
  /** Análise da IA (analisar-videos): gancho como está e como modelo com ___. */
  gancho_texto: string | null;
  gancho_modelo: string | null;
  gancho_tipo: string | null;
  formato: string | null;
  analise: { tema: string; ideia: string; angulo: string; crenca: string; prova: string } | null;
  analisado_em: string | null;
}

export type Ordem = "outlier" | "views" | "engajamento" | "recentes";

export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "outlier", nome: "Maior nota" },
  { id: "views", nome: "Mais views" },
  { id: "engajamento", nome: "Mais engajamento" },
  { id: "recentes", nome: "Mais recentes" },
];

/** Filtros da aba Vídeos, como no Sandcastles: busca, faixas de nota, views e engajamento, período, rede, canal e ordem. */
export interface Filtro {
  busca: string;
  canalId: string;
  rede: "" | Rede;
  notaMin: number | null;
  notaMax: number | null;
  viewsMin: number | null;
  viewsMax: number | null;
  engMin: number | null;
  engMax: number | null;
  dias: number;
  ordem: Ordem;
  soAnalisados: boolean;
  tipoGancho: string;
  formato: string;
}

export const FILTRO_PADRAO: Filtro = {
  busca: "",
  canalId: "",
  rede: "",
  notaMin: 2,
  notaMax: null,
  viewsMin: null,
  viewsMax: null,
  engMin: null,
  engMax: null,
  dias: 0,
  ordem: "outlier",
  soAnalisados: false,
  tipoGancho: "",
  formato: "",
};

const COLUNAS_VIDEO =
  "id, canal_id, url, legenda, views, curtidas, comentarios, duracao_seg, publicado_em, data_estimada, outlier, engajamento, capa_url, gancho_texto, gancho_modelo, gancho_tipo, formato, analise, analisado_em";

const SO_NO_SITE = "A aba Canais usa o banco do site. Abra o Viralizei pelo site e entre com a sua conta.";

export async function lerCanais(): Promise<Canal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("canais").select("*").order("nome");
  if (error) throw new Error("Não deu para carregar os canais. Confira a internet e recarregue.");
  return data as Canal[];
}

export async function lerVideos(f: Filtro, canais: Canal[]): Promise<VideoCanal[]> {
  if (!supabase) return [];
  let q = supabase.from("canal_videos").select(COLUNAS_VIDEO).not("outlier", "is", null);
  if (f.notaMin != null) q = q.gte("outlier", f.notaMin);
  if (f.notaMax != null) q = q.lte("outlier", f.notaMax);
  if (f.viewsMin != null) q = q.gte("views", f.viewsMin);
  if (f.viewsMax != null) q = q.lte("views", f.viewsMax);
  if (f.engMin != null) q = q.gte("engajamento", f.engMin);
  if (f.engMax != null) q = q.lte("engajamento", f.engMax);
  if (f.soAnalisados) q = q.not("analisado_em", "is", null);
  if (f.tipoGancho) q = q.eq("gancho_tipo", f.tipoGancho);
  if (f.formato) q = q.eq("formato", f.formato);
  // Busca na legenda, no gancho e no tema; tira o que quebraria o filtro do PostgREST.
  const termo = f.busca.replace(/[%,()*\\:"]/g, " ").trim();
  if (termo) {
    const t = `*${termo}*`;
    q = q.or(`legenda.ilike.${t},gancho_texto.ilike.${t},gancho_modelo.ilike.${t},analise->>tema.ilike.${t}`);
  }
  if (f.canalId) q = q.eq("canal_id", f.canalId);
  else if (f.rede) {
    const ids = canais.filter((c) => c.rede === f.rede).map((c) => c.id);
    if (!ids.length) return [];
    q = q.in("canal_id", ids);
  }
  if (f.dias > 0) q = q.gte("publicado_em", new Date(Date.now() - f.dias * 86_400_000).toISOString());
  q =
    f.ordem === "recentes"
      ? q.order("publicado_em", { ascending: false, nullsFirst: false })
      : q.order(f.ordem === "views" ? "views" : f.ordem === "engajamento" ? "engajamento" : "outlier", { ascending: false, nullsFirst: false });
  const { data, error } = await q.limit(150);
  if (error) throw new Error("Não deu para carregar os vídeos. Confira a internet e recarregue.");
  return data as VideoCanal[];
}

/** Banco de ganchos: vídeos já analisados, do maior outlier para o menor. */
export async function lerGanchos(): Promise<VideoCanal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("canal_videos")
    .select(COLUNAS_VIDEO)
    .not("gancho_modelo", "is", null)
    .order("outlier", { ascending: false, nullsFirst: false })
    .limit(300);
  if (error) throw new Error("Não deu para carregar os ganchos. Confira a internet e recarregue.");
  return data as VideoCanal[];
}

export async function lerFavoritos(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.from("ganchos_favoritos").select("video_id");
  if (error) return new Set();
  return new Set((data as { video_id: string }[]).map((f) => f.video_id));
}

export async function marcarFavorito(videoId: string, favorito: boolean) {
  if (!supabase) throw new Error(SO_NO_SITE);
  const { error } = favorito
    ? await supabase.from("ganchos_favoritos").insert({ video_id: videoId })
    : await supabase.from("ganchos_favoritos").delete().eq("video_id", videoId);
  if (error && error.code !== "23505") throw new Error("Não deu para marcar o gancho. Tente de novo.");
}

async function chamar<T>(funcao: string, corpo: Record<string, unknown>, padrao: string): Promise<T> {
  if (!supabase) throw new Error(SO_NO_SITE);
  const { data, error } = await supabase.functions.invoke(funcao, { body: corpo });
  if (error) {
    const r = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
    throw new Error(r.erro ?? padrao);
  }
  return data as T;
}

/** Analisa com IA (gancho como modelo, tipo, formato, ideia). Sem ids: os maiores outliers sem análise. */
export function analisarVideos(ids?: string[]) {
  return chamar<{ analisados: number; aviso?: string }>("analisar-videos", ids?.length ? { ids } : {}, "Não deu para analisar agora. Tente de novo em um minuto.");
}

export interface CanalSugerido {
  handle: string;
  nome: string;
  seguidores: number | null;
  shorts: number;
  mediana: number | null;
  maiorOutlier: number | null;
  foraDaCurva: number;
  melhor: { url: string; titulo: string; views: number | null } | null;
  buscas: string[];
}

/** Canais do YouTube no nicho (da Persona ou dos termos) acima da própria média. */
export function sugerirCanais(termos: string) {
  return chamar<{ buscas: string[]; canais: CanalSugerido[] }>("sugerir-canais", { termos }, "Não deu para buscar canais agora. Tente de novo em um minuto.");
}

/** Capa 9:16: a que veio na coleta ou, no YouTube, a gerada pelo id do Short. */
export function capaDoVideo(v: VideoCanal): string | null {
  if (v.capa_url) return v.capa_url;
  const yt = v.id.match(/^youtube:(.+)$/)?.[1];
  return yt ? `https://i.ytimg.com/vi/${yt}/oardefault.jpg` : null;
}

const CHAVE_FILTROS = "pauta:canais-filtros-salvos";

export interface FiltroSalvo {
  nome: string;
  filtro: Filtro;
}

export function lerFiltrosSalvos(): FiltroSalvo[] {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE_FILTROS) ?? "[]") as FiltroSalvo[];
    return Array.isArray(l) ? l.map((x) => ({ nome: x.nome, filtro: { ...FILTRO_PADRAO, ...x.filtro } })) : [];
  } catch {
    return [];
  }
}

export function guardarFiltrosSalvos(l: FiltroSalvo[]) {
  try {
    localStorage.setItem(CHAVE_FILTROS, JSON.stringify(l.slice(0, 12)));
  } catch {
    // sem armazenamento: o filtro vale só nesta visita
  }
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
  const r = await chamar<{ canais: { handle: string; videos: number; erro?: string }[] }>(
    "atualizar-canais",
    canalId ? { canalId } : {},
    "Não deu para atualizar agora. Confira a internet e tente de novo.",
  );
  return r.canais;
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
  const a = v.analise;
  const base = [
    v.url,
    `${canal ? `${canal.nome || "@" + canal.handle} (${nomeRede(canal.rede)}), ` : ""}${numeroCurto(v.views)} views, ${v.outlier ?? "?"}x a mediana do canal.`,
    v.gancho_texto ? `Gancho: ${v.gancho_texto}` : `Legenda: ${tituloDoVideo(v.legenda, 300)}`,
    v.gancho_modelo ? `Modelo do gancho: ${v.gancho_modelo}` : "",
    a?.ideia ? `Ideia: ${a.ideia}` : "",
    a?.angulo ? `Ângulo: ${a.angulo}` : "",
    a?.crenca ? `Crença que desafia: ${a.crenca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    localStorage.setItem("pauta:etapas-base", JSON.stringify(base));
    localStorage.setItem("pauta:roteiro-modo", JSON.stringify("etapas"));
  } catch {
    // sem armazenamento: o Roteiro abre como estava
  }
}
