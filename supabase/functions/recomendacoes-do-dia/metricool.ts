// Sincronia com a API do Metricool (https://app.metricool.com/api), a mesma
// que o servidor MCP oficial deles usa: cabeçalho X-Mc-Auth com o token do
// usuário e os parâmetros userId e blogId. A API só existe nos planos pagos
// do Metricool. Sem os três segredos (METRICOOL_USER_TOKEN, METRICOOL_USER_ID,
// METRICOOL_BLOG_ID) a função pula esta parte e usa o que já está no banco.
//
// Os nomes dos campos da resposta não têm documentação pública; a leitura
// aceita os nomes prováveis de cada métrica e ignora a linha sem id ou data.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.75.0";

const BASE = "https://app.metricool.com/api";

export interface ResultadoSincronia {
  ok: boolean;
  mensagem: string;
  publicacoes?: number;
}

type Obj = Record<string, unknown>;

function pegar(o: Obj, ...nomes: string[]): unknown {
  for (const n of nomes) {
    const v = o[n];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function inteiro(v: unknown) {
  const n = numero(v);
  return n == null ? null : Math.round(n);
}

function data(v: unknown): string | null {
  if (v && typeof v === "object" && "dateTime" in (v as Obj)) v = (v as Obj).dateTime;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (typeof v !== "string") return null;
  const compacto = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/);
  if (compacto) {
    const [, a, m, d, h = "00", mi = "00", s = "00"] = compacto;
    return `${a}-${m}-${d}T${h}:${mi}:${s}-03:00`;
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function lista(resposta: unknown): Obj[] {
  if (Array.isArray(resposta)) return resposta as Obj[];
  if (resposta && typeof resposta === "object") {
    const d = (resposta as Obj).data;
    if (Array.isArray(d)) return d as Obj[];
  }
  return [];
}

async function buscar(caminho: string, token: string) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "X-Mc-Auth": token }, signal: AbortSignal.timeout(30_000) });
  if (r.status === 401 || r.status === 403) throw new Error("O Metricool recusou o token (confira o segredo METRICOOL_USER_TOKEN e se o plano tem API).");
  if (!r.ok) throw new Error(`O Metricool respondeu ${r.status} em ${caminho.split("?")[0]}.`);
  return r.json();
}

function codigoDoLink(url: string | null, rede: string): string | null {
  if (!url) return null;
  if (rede === "tiktok") return url.match(/\/video\/(\d+)/)?.[1] ?? null;
  return url.match(/\/(?:reel|p)\/([^/?#]+)/)?.[1] ?? null;
}

export async function sincronizarMetricool(servico: SupabaseClient): Promise<ResultadoSincronia> {
  const token = Deno.env.get("METRICOOL_USER_TOKEN");
  const userId = Deno.env.get("METRICOOL_USER_ID");
  const blogId = Deno.env.get("METRICOOL_BLOG_ID");
  if (!token || !userId || !blogId) {
    return { ok: false, mensagem: "Sem token da API do Metricool: usei as métricas que já estavam no banco." };
  }
  const ate = new Date();
  const de = new Date(ate.getTime() - 120 * 86_400_000);
  const intervalo = (d: Date, fim: boolean) => encodeURIComponent(`${d.toISOString().slice(0, 10)}T${fim ? "23:59:59" : "00:00:00"}`);
  const comum = `from=${intervalo(de, false)}&to=${intervalo(ate, true)}&blogId=${blogId}&userId=${userId}`;

  try {
    const [reels, posts, tiktok] = await Promise.all([
      buscar(`/v2/analytics/reels/instagram?${comum}`, token),
      buscar(`/v2/analytics/posts/instagram?${comum}`, token),
      buscar(`/v2/analytics/posts/tiktok?${comum}`, token).catch(() => []),
    ]);

    const linhas: Obj[] = [];
    const montar = (o: Obj, rede: "instagram" | "tiktok", tipoPadrao: string) => {
      const url = (pegar(o, "url", "permalink", "shareUrl", "shareurl", "link") as string | null) ?? null;
      const codigo = codigoDoLink(url, rede) ?? (pegar(o, "reelId", "postId", "videoId", "id") as string | null);
      const publicado = data(pegar(o, "publishedAt", "timestamp", "created", "date", "publicationDate"));
      if (!codigo || !publicado) return;
      const tipoBruto = String(pegar(o, "type", "mediaProductType") ?? "").toUpperCase();
      const tipo = rede === "tiktok" ? "video" : tipoPadrao === "reel" ? "reel" : tipoBruto.includes("CAROUSEL") ? "carrossel" : tipoBruto.includes("REEL") || tipoBruto.includes("VIDEO") ? "reel" : "post";
      const linha: Obj = {
        id: `${rede}:${codigo}`,
        rede,
        tipo,
        publicado_em: publicado,
        legenda: String(pegar(o, "content", "caption", "text", "description") ?? ""),
        url,
        views: inteiro(pegar(o, "views", "videoViews", "plays", "impressions")),
        alcance: inteiro(pegar(o, "reach")),
        curtidas: inteiro(pegar(o, "likes", "likeCount")),
        comentarios: inteiro(pegar(o, "comments", "commentsCount")),
        salvos: inteiro(pegar(o, "saved", "saves")),
        compartilhamentos: inteiro(pegar(o, "shares")),
        seguidores: inteiro(pegar(o, "follows")),
        tempo_medio_seg: numero(pegar(o, "averageWatchTime", "avgWatchTime", "averageTimeWatched")),
        taxa_3s: numero(pegar(o, "reelsViewRate", "viewRate")),
        engajamento: numero(pegar(o, "engagement")),
        atualizado_em: new Date().toISOString(),
      };
      const duracao = numero(pegar(o, "durationSeconds", "duration"));
      if (duracao) {
        linha.duracao_seg = duracao;
        linha.duracao_origem = "rede";
      }
      const retencao = numero(pegar(o, "retention"));
      if (retencao != null) linha.retencao = retencao;
      linhas.push(linha);
    };
    lista(reels).forEach((o) => montar(o, "instagram", "reel"));
    lista(posts).forEach((o) => montar(o, "instagram", "post"));
    lista(tiktok).forEach((o) => montar(o, "tiktok", "video"));

    if (!linhas.length) return { ok: false, mensagem: "O Metricool respondeu, mas sem publicações reconhecíveis: usei o que já estava no banco." };
    // Um upsert por conjunto de colunas: se as linhas misturassem colunas, o
    // PostgREST gravaria null nas que faltam e apagaria a duração e a retenção
    // estimadas que já estão no banco (e o tema classificado).
    const grupos = new Map<string, Obj[]>();
    for (const l of linhas) {
      const chave = Object.keys(l).sort().join(",");
      grupos.set(chave, [...(grupos.get(chave) ?? []), l]);
    }
    for (const grupo of grupos.values()) {
      const { error } = await servico.from("metricas_publicacoes").upsert(grupo, { onConflict: "id" });
      if (error) return { ok: false, mensagem: `Não deu para gravar as métricas do Metricool: ${error.message}` };
    }
    return { ok: true, mensagem: `Métricas atualizadas pelo Metricool (${linhas.length} publicações).`, publicacoes: linhas.length };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "O Metricool não respondeu." };
  }
}
