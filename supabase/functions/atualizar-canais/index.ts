// Viralizei — atualiza os canais do YouTube acompanhados na aba Canais.
// Lê a aba Shorts de cada canal ativo (views de cada short), abre a página
// dos shorts que ainda não têm data (data, views exatas e duração) e grava
// tudo com public.carregar_canal, que recalcula a mediana e a nota de outlier
// (views ÷ mediana do canal). Instagram e TikTok exigem sessão: entram pela
// rotina no Chrome do autor, com a mesma função do banco.
//
// Autorização: header x-viralizei-cron com o segredo do Vault (pg_cron
// "canais-diario"), ou JWT de sócio ("Atualizar YouTube agora" na tela).
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viralizei-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAVEGADOR = {
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

const DETALHES_POR_CANAL = 15;

interface Video {
  codigo: string;
  url: string;
  legenda: string;
  views: number | null;
  publicado_em?: string;
  duracao_seg?: number;
}

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** "100 mil visualizações" → 100000; "1,2 mi" → 1200000; "987 visualizações" → 987. */
export function numeroDeViews(texto: string): number | null {
  const t = texto.replace(/\u00a0/g, " ").toLowerCase();
  const m = t.match(/([\d.,]+)\s*(mi|mil|bi)?\b/);
  if (!m) return null;
  const unidade = m[2] ?? "";
  const n = unidade ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : parseInt(m[1].replace(/[.,]/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (unidade === "bi" ? 1e9 : unidade === "mi" ? 1e6 : unidade === "mil" ? 1e3 : 1));
}

async function lerPagina(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(20000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** Shorts da aba do canal: id, título e views (texto arredondado). */
export function lerShorts(html: string): { nome: string; seguidores: number | null; videos: Video[] } | null {
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const videos: Video[] = [];
  const andar = (o: unknown, prof: number) => {
    if (!o || typeof o !== "object" || prof > 60 || videos.length >= 60) return;
    if (Array.isArray(o)) {
      for (const x of o) andar(x, prof + 1);
      return;
    }
    const obj = o as Record<string, unknown>;
    const lock = obj.shortsLockupViewModel as Record<string, any> | undefined;
    if (lock) {
      const id = lock.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId as string | undefined;
      if (id) {
        videos.push({
          codigo: id,
          url: `https://www.youtube.com/shorts/${id}`,
          legenda: String(lock.overlayMetadata?.primaryText?.content ?? "").slice(0, 300),
          views: numeroDeViews(String(lock.overlayMetadata?.secondaryText?.content ?? "")),
        });
      }
      return;
    }
    const reel = obj.reelItemRenderer as Record<string, any> | undefined;
    if (reel?.videoId) {
      videos.push({
        codigo: reel.videoId,
        url: `https://www.youtube.com/shorts/${reel.videoId}`,
        legenda: String(reel.headline?.simpleText ?? "").slice(0, 300),
        views: numeroDeViews(String(reel.viewCountText?.simpleText ?? "")),
      });
      return;
    }
    for (const k in obj) andar(obj[k], prof + 1);
  };
  andar(dados, 0);
  const meta = (dados as Record<string, any>)?.metadata?.channelMetadataRenderer;
  const inscritos = html.match(/"([\d.,]+\s*(?:mil|mi)?)\s*de inscritos"/);
  return {
    nome: String(meta?.title ?? "").slice(0, 120),
    seguidores: inscritos ? numeroDeViews(inscritos[1]) : null,
    videos,
  };
}

/** Página de um short: data de publicação, views exatas e duração. */
export function lerDetalhe(html: string): { publicado_em?: string; views?: number; duracao_seg?: number } {
  const data = html.match(/"publishDate":"([^"]+)"/)?.[1] ?? html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1];
  const views = html.match(/"viewCount":"(\d+)"/)?.[1];
  const duracao = html.match(/"lengthSeconds":"(\d+)"/)?.[1];
  return {
    publicado_em: data && !Number.isNaN(Date.parse(data)) ? new Date(data).toISOString() : undefined,
    views: views ? Number(views) : undefined,
    duracao_seg: duracao ? Number(duracao) : undefined,
  };
}

/** Data, views e duração pela API do player (a página do vídeo vem sem dados para servidor). */
async function lerDetalheApi(id: string): Promise<{ publicado_em?: string; views?: number; duracao_seg?: number }> {
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { ...NAVEGADOR, "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: id, context: { client: { clientName: "WEB", clientVersion: "2.20251001.00.00", hl: "pt", gl: "BR" } } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return {};
    const d = await r.json();
    const data = d?.microformat?.playerMicroformatRenderer?.publishDate as string | undefined;
    const views = Number(d?.videoDetails?.viewCount);
    const duracao = Number(d?.videoDetails?.lengthSeconds);
    return {
      publicado_em: data && !Number.isNaN(Date.parse(data)) ? new Date(data).toISOString() : undefined,
      views: Number.isFinite(views) && views > 0 ? views : undefined,
      duracao_seg: Number.isFinite(duracao) && duracao > 0 ? duracao : undefined,
    };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const segredo = req.headers.get("x-viralizei-cron");
  let autorizado = false;
  if (segredo) {
    const { data } = await servico.rpc("radar_segredo_confere", { s: segredo });
    autorizado = data === true;
  } else {
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data } = await comoUsuario.rpc("sou_socio");
    autorizado = data === true;
  }
  if (!autorizado) return responder(403, { erro: "Só o cron do banco ou um sócio podem atualizar os canais." });

  let corpo: { canalId?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio: todos os canais
  }
  let consulta = servico.from("canais").select("id, handle").eq("rede", "youtube").eq("ativo", true);
  if (corpo.canalId) consulta = consulta.eq("id", corpo.canalId);
  const { data: canais, error } = await consulta;
  if (error) return responder(500, { erro: "Não deu para ler os canais." });

  const inicio = Date.now();
  const resultado: { handle: string; videos: number; datas?: number; erro?: string }[] = [];
  for (const canal of (canais ?? []) as { id: string; handle: string }[]) {
    if (Date.now() - inicio > 110_000) {
      resultado.push({ handle: canal.handle, videos: 0, erro: "ficou para a próxima rodada (tempo)" });
      continue;
    }
    const html = await lerPagina(`https://www.youtube.com/@${encodeURIComponent(canal.handle)}/shorts?hl=pt&gl=BR`);
    const lido = html ? lerShorts(html) : null;
    if (!lido || lido.videos.length === 0) {
      const erro = !html ? "o YouTube não abriu a página do canal" : "nenhum short encontrado; confira o @ do canal";
      await servico.rpc("carregar_canal", { p: { rede: "youtube", handle: canal.handle, erro } });
      resultado.push({ handle: canal.handle, videos: 0, erro });
      continue;
    }
    // Data e views exatas dos que ainda não têm data no banco.
    const { data: conhecidos } = await servico
      .from("canal_videos")
      .select("id")
      .eq("canal_id", canal.id)
      .not("publicado_em", "is", null);
    const comData = new Set((conhecidos ?? []).map((v: { id: string }) => v.id));
    const faltam = lido.videos.filter((v) => !comData.has(`youtube:${v.codigo}`)).slice(0, DETALHES_POR_CANAL);
    // De 5 em 5 (rajada maior o YouTube corta); sem data pela API, tenta a página do short.
    let datas = 0;
    for (let i = 0; i < faltam.length; i += 5) {
      await Promise.all(
        faltam.slice(i, i + 5).map(async (v) => {
          let d = await lerDetalheApi(v.codigo);
          if (!d.publicado_em) d = lerDetalhe((await lerPagina(`https://www.youtube.com/shorts/${v.codigo}?hl=pt&gl=BR`)) ?? "");
          if (d.publicado_em) {
            v.publicado_em = d.publicado_em;
            datas++;
          }
          if (d.views != null) v.views = d.views;
          if (d.duracao_seg != null) v.duracao_seg = d.duracao_seg;
        }),
      );
    }
    const { error: erroCarga } = await servico.rpc("carregar_canal", {
      p: { rede: "youtube", handle: canal.handle, nome: lido.nome, seguidores: lido.seguidores, videos: lido.videos },
    });
    resultado.push({ handle: canal.handle, videos: lido.videos.length, datas, erro: erroCarga ? erroCarga.message : undefined });
  }
  return responder(200, { canais: resultado });
});
