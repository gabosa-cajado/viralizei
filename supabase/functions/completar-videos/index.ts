// Viralizei — completa capa, legenda, curtidas e data dos vídeos do Instagram
// e do TikTok, sem login, e guarda a capa no Storage (bucket "capas").
//
// - Instagram: a página do Reel aberta como o robô de prévia de links
//   (facebookexternalhit) traz og:image (capa 640x640), og:title (legenda) e
//   a descrição "30K likes, 28K comments - perfil on June 8, 2026: ...".
//   Views não vêm: elas chegam pela coleta no Chrome (rotina local).
// - TikTok: o oEmbed público traz capa e título.
// Links de capa do Instagram e do TikTok são assinados e expiram em dias; por
// isso a imagem é baixada e guardada. YouTube fica de fora (ytimg não expira).
//
// Corpo: { limite?: number } (padrão 20, máximo 40). Cada vídeo é tentado no
// máximo uma vez por dia (canal_videos.completado_em).
// Autorização: header x-viralizei-cron com o segredo do Vault, ou JWT de sócio.
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viralizei-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROBO_PREVIA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MESES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function buscar(url: string, init: RequestInit = {}, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function desfazerHtml(t: string) {
  return t
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function meta(html: string, nome: string) {
  const m = html.match(new RegExp(`<meta (?:property|name)="${nome}" content="([^"]*)"`));
  return m ? desfazerHtml(m[1]) : "";
}

/** "30K" → 30000, "1.2M" → 1200000, "1,234" → 1234. */
function numero(t: string): number | null {
  const m = t.trim().match(/^([\d.,]+)\s*([KkMm]?)$/);
  if (!m) return null;
  const mult = m[2].toLowerCase() === "k" ? 1e3 : m[2].toLowerCase() === "m" ? 1e6 : 1;
  const base = mult === 1 ? Number(m[1].replace(/[.,]/g, "")) : Number(m[1].replace(",", "."));
  return Number.isFinite(base) ? Math.round(base * mult) : null;
}

interface Achado {
  capa?: string;
  legenda?: string;
  curtidas?: number | null;
  comentarios?: number | null;
  publicado_em?: string | null;
}

async function lerInstagram(codigo: string): Promise<Achado | null> {
  const r = await buscar(`https://www.instagram.com/reel/${codigo}/`, { headers: { "User-Agent": ROBO_PREVIA } });
  if (!r.ok) return null;
  const html = await r.text();
  const capa = meta(html, "og:image");
  if (!capa) return null;
  const titulo = meta(html, "og:title");
  const desc = meta(html, "og:description");
  // og:title: 'Nome on Instagram: "legenda"'
  const leg = titulo.match(/on Instagram: "([\s\S]*)"\s*$/)?.[1] ?? "";
  const nums = desc.match(/^([\d.,]+[KkMm]?) likes?, ([\d.,]+[KkMm]?) comments?/);
  const data = desc.match(/ on ([A-Z][a-z]+) (\d{1,2}), (\d{4}):/);
  let publicado_em: string | null = null;
  if (data && MESES[data[1].toLowerCase()] != null) {
    publicado_em = new Date(Date.UTC(Number(data[3]), MESES[data[1].toLowerCase()], Number(data[2]), 15)).toISOString();
  }
  return {
    capa,
    legenda: leg.trim(),
    curtidas: nums ? numero(nums[1]) : null,
    comentarios: nums ? numero(nums[2]) : null,
    publicado_em,
  };
}

async function lerTikTok(url: string): Promise<Achado | null> {
  const r = await buscar(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as { thumbnail_url?: string; title?: string } | null;
  if (!j?.thumbnail_url) return null;
  return { capa: j.thumbnail_url, legenda: (j.title ?? "").trim() };
}

interface Linha {
  id: string;
  canal_id: string;
  url: string;
  legenda: string;
  capa_url: string | null;
  curtidas: number | null;
  comentarios: number | null;
  publicado_em: string | null;
  data_estimada: boolean | null;
  canais: { rede: string } | { rede: string }[] | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const base = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const segredo = req.headers.get("x-viralizei-cron");
  let autorizado = false;
  if (segredo) {
    const { data } = await servico.rpc("radar_segredo_confere", { s: segredo });
    autorizado = data === true;
  } else {
    const comoUsuario = createClient(base, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data } = await comoUsuario.rpc("sou_socio");
    autorizado = data === true;
  }
  if (!autorizado) return responder(403, { erro: "Só o cron do banco ou um sócio podem completar vídeos." });

  let corpo: { limite?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio: limite padrão
  }
  const limite = Math.min(40, Math.max(1, Number(corpo.limite) || 20));
  const guardadas = `${base}/storage/v1/object/public/capas/`;
  const ontem = new Date(Date.now() - 20 * 3600 * 1000).toISOString();

  const { data, error } = await servico
    .from("canal_videos")
    .select("id, canal_id, url, legenda, capa_url, curtidas, comentarios, publicado_em, data_estimada, canais!inner(rede)")
    .in("canais.rede", ["instagram", "tiktok"])
    .or(`completado_em.is.null,completado_em.lt.${ontem}`)
    .order("outlier", { ascending: false, nullsFirst: false })
    .limit(400);
  if (error) return responder(500, { erro: "Não deu para ler os vídeos." });
  const fila = ((data ?? []) as Linha[])
    .filter((v) => !v.capa_url?.startsWith(guardadas) || !v.legenda)
    .slice(0, limite);

  const canaisMexidos = new Set<string>();
  let capas = 0;
  let legendas = 0;
  let falhas = 0;

  async function completar(v: Linha) {
    const rede = (Array.isArray(v.canais) ? v.canais[0] : v.canais)?.rede ?? "";
    const codigo = v.id.split(":").slice(1).join(":");
    const mudar: Record<string, unknown> = { completado_em: new Date().toISOString() };
    try {
      const achado = rede === "instagram" ? await lerInstagram(codigo) : await lerTikTok(v.url);
      if (!achado) {
        falhas++;
      } else {
        // Capa: baixa o link assinado e guarda no bucket.
        const origem = v.capa_url && !v.capa_url.startsWith(guardadas) ? v.capa_url : achado.capa;
        if (origem && !v.capa_url?.startsWith(guardadas)) {
          let img = await buscar(origem).catch(() => null);
          if ((!img || !img.ok) && achado.capa && origem !== achado.capa) img = await buscar(achado.capa).catch(() => null);
          const tipo = img?.headers.get("content-type") ?? "";
          if (img?.ok && tipo.startsWith("image/")) {
            const bytes = new Uint8Array(await img.arrayBuffer());
            if (bytes.length > 0 && bytes.length <= 2_000_000) {
              const caminho = `${rede}/${codigo.replace(/[^\w-]/g, "_")}.jpg`;
              const { error: e } = await servico.storage.from("capas").upload(caminho, bytes, { contentType: tipo.split(";")[0], upsert: true });
              if (!e) {
                mudar.capa_url = guardadas + caminho;
                capas++;
              }
            }
          }
        }
        if (!v.legenda && achado.legenda) {
          mudar.legenda = achado.legenda.slice(0, 4000);
          legendas++;
        }
        if (v.curtidas == null && achado.curtidas != null) mudar.curtidas = achado.curtidas;
        if (v.comentarios == null && achado.comentarios != null) mudar.comentarios = achado.comentarios;
        if (achado.publicado_em && (v.publicado_em == null || v.data_estimada)) {
          mudar.publicado_em = achado.publicado_em;
          mudar.data_estimada = false;
          canaisMexidos.add(v.canal_id);
        }
      }
    } catch {
      falhas++;
    }
    await servico.from("canal_videos").update(mudar).eq("id", v.id);
  }

  // Três por vez: educado com o Instagram e dentro dos 150 s da função.
  for (let i = 0; i < fila.length; i += 3) {
    await Promise.all(fila.slice(i, i + 3).map(completar));
  }
  for (const c of canaisMexidos) await servico.rpc("recalcular_outliers_servico", { c });

  const restantes = ((data ?? []) as Linha[]).filter((v) => !v.capa_url?.startsWith(guardadas) || !v.legenda).length - fila.length;
  return responder(200, { tentados: fila.length, capas, legendas, falhas, restantes });
});
