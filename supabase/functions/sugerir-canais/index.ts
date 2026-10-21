// Viralizei — sugere canais do YouTube do nicho que estão acima da própria média.
// 1. Monta as buscas: os termos que o sócio escreveu ou, sem eles, a IA tira
//    6 buscas da Persona do canal (public.persona).
// 2. Busca Shorts no YouTube por cada termo e pega os mais vistos.
// 3. Descobre o @ do canal de cada Short pelo oEmbed.
// 4. Lê a aba Shorts dos canais mais frequentes e calcula a mediana de views
//    e o maior outlier (views ÷ mediana), como na aba Canais.
// Devolve os canais por constância (Shorts acima de 2x a mediana), com os de
// mediana pequena no fim, sem os que já estão na lista.
// Não grava nada: o sócio escolhe quem acompanhar na tela.
// Autorização: JWT de sócio. A IA (só para as buscas) usa ANTHROPIC_API_KEY_VIRALIZEI.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAVEGADOR = {
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

const SHORTS_POR_BUSCA = 10;
const CANAIS_ANALISADOS = 12;

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** "100 mil visualizações" → 100000; "1,2 mi" → 1200000; "987 visualizações" → 987. */
function numeroDeViews(texto: string): number | null {
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

function dadosIniciais(html: string): unknown {
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

interface ShortLido {
  id: string;
  titulo: string;
  views: number | null;
}

/** Shorts de uma página (busca ou aba Shorts do canal). */
function shortsDaPagina(dados: unknown, limite: number): ShortLido[] {
  const lidos: ShortLido[] = [];
  const andar = (o: unknown, prof: number) => {
    if (!o || typeof o !== "object" || prof > 60 || lidos.length >= limite) return;
    if (Array.isArray(o)) {
      for (const x of o) andar(x, prof + 1);
      return;
    }
    const obj = o as Record<string, unknown>;
    // deno-lint-ignore no-explicit-any
    const lock = obj.shortsLockupViewModel as Record<string, any> | undefined;
    if (lock) {
      const id = lock.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId as string | undefined;
      if (id) {
        const titulo = String(lock.overlayMetadata?.primaryText?.content ?? "");
        const viewsTexto = String(lock.overlayMetadata?.secondaryText?.content ?? "");
        // Na busca o texto de views só vem na descrição de acessibilidade: "Título, 476 mil visualizações - ver o Shorts".
        const acess = String(lock.accessibilityText ?? "");
        const m = acess.match(/^(.*), ([\d.,]+(?:\s*(?:mil|mi|bi))?) visualiza/);
        lidos.push({
          id,
          titulo: (titulo || m?.[1] || "").slice(0, 200),
          views: numeroDeViews(viewsTexto) ?? (m ? numeroDeViews(m[2]) : null),
        });
      }
      return;
    }
    for (const k in obj) andar(obj[k], prof + 1);
  };
  andar(dados, 0);
  return lidos;
}

async function donoDoShort(id: string): Promise<{ handle: string; nome: string } | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/shorts/${id}`)}&format=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const handle = String(d.author_url ?? "").match(/\/@([^/?#]+)/)?.[1];
    return handle ? { handle: decodeURIComponent(handle).toLowerCase(), nome: String(d.author_name ?? "") } : null;
  } catch {
    return null;
  }
}

/** Abaixo disto a mediana do canal é pequena demais para a nota dizer algo. */
const MEDIANA_MINIMA = 3000;

function mediana(ns: number[]) {
  if (!ns.length) return null;
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  return saida;
}

const Buscas = z.object({ buscas: z.array(z.string()).min(3).max(8) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: socio } = await comoUsuario.rpc("sou_socio");
  if (socio !== true) return responder(403, { erro: "Sua conta não está na lista de sócios do Viralizei." });

  let corpo: { termos?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    // sem termos: usa a Persona
  }
  const inicio = Date.now();
  let buscas = String(corpo.termos ?? "")
    .split(/[,;\n]/)
    .map((t) => t.trim().slice(0, 80))
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  if (!buscas.length) {
    const { data: p } = await comoUsuario.from("persona").select("nicho, publico, evitar").maybeSingle();
    const persona = (p ?? {}) as { nicho?: string; publico?: string; evitar?: string };
    if (!persona.nicho?.trim()) return responder(400, { erro: "Escreva os temas da busca ou preencha o nicho na Persona primeiro." });
    const chave = Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (chave) {
      try {
        const r = await new Anthropic({ apiKey: chave }).beta.messages.parse({
          model: "claude-opus-5-5",
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          max_tokens: 1000,
          output_config: { effort: "low", format: betaZodOutputFormat(Buscas) },
          system:
            "Você escreve buscas curtas (2 a 5 palavras, em português do Brasil, como uma pessoa digita no YouTube) para achar Shorts de criadores brasileiros de um nicho. Cubra subtemas diferentes do nicho; nada do que está em 'evitar'.",
          messages: [{ role: "user", content: `Nicho: ${persona.nicho}\nPúblico: ${persona.publico ?? ""}\nEvitar: ${persona.evitar ?? ""}\nDevolva 6 buscas.` }],
        });
        buscas = (r.parsed_output?.buscas ?? []).map((b) => b.slice(0, 80)).slice(0, 6);
      } catch {
        // sem IA: os pedaços do nicho viram as buscas
      }
    }
    if (!buscas.length) buscas = persona.nicho.split(/,|;|\se\s/).map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 6);
  }

  // 2. Shorts mais vistos de cada busca (filtro de Shorts do YouTube).
  const porBusca = await emLotes(buscas, 3, async (b) => {
    const html = await lerPagina(`https://www.youtube.com/results?search_query=${encodeURIComponent(b)}&sp=EgIYAQ%253D%253D&hl=pt&gl=BR`);
    const lidos = html ? shortsDaPagina(dadosIniciais(html), 40) : [];
    return lidos.sort((a, c) => (c.views ?? 0) - (a.views ?? 0)).slice(0, SHORTS_POR_BUSCA).map((s) => ({ ...s, busca: b }));
  });
  const vistos = new Set<string>();
  const shorts = porBusca.flat().filter((s) => !vistos.has(s.id) && vistos.add(s.id));

  // 3. Dono de cada Short.
  const donos = await emLotes(shorts, 10, async (s) => ({ s, dono: await donoDoShort(s.id) }));
  const { data: jaTem } = await comoUsuario.from("canais").select("handle").eq("rede", "youtube");
  const acompanhados = new Set((jaTem ?? []).map((c: { handle: string }) => c.handle));
  const grupos = new Map<string, { handle: string; nome: string; buscas: Set<string>; achados: ShortLido[] }>();
  for (const { s, dono } of donos) {
    if (!dono || acompanhados.has(dono.handle)) continue;
    const g = grupos.get(dono.handle) ?? { handle: dono.handle, nome: dono.nome, buscas: new Set(), achados: [] };
    g.buscas.add(s.busca);
    g.achados.push(s);
    grupos.set(dono.handle, g);
  }
  const candidatos = [...grupos.values()]
    .sort((a, b) => b.buscas.size - a.buscas.size || Math.max(...b.achados.map((x) => x.views ?? 0)) - Math.max(...a.achados.map((x) => x.views ?? 0)))
    .slice(0, CANAIS_ANALISADOS);

  // 4. Mediana e maior outlier pela aba Shorts de cada candidato.
  const canais = await emLotes(candidatos, 4, async (g) => {
    if (Date.now() - inicio > 115_000) return null;
    const html = await lerPagina(`https://www.youtube.com/@${encodeURIComponent(g.handle)}/shorts?hl=pt&gl=BR`);
    const dados = html ? dadosIniciais(html) : null;
    const lista = dados ? shortsDaPagina(dados, 48) : [];
    const views = lista.map((v) => v.views).filter((v): v is number => v != null);
    // Os 30 mais recentes, como na aba Canais (a aba Shorts vem do mais novo para o mais velho).
    const med = mediana(views.slice(0, 30));
    const melhor = [...lista].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
    const inscritos = html?.match(/"([\d.,]+\s*(?:mil|mi)?)\s*de inscritos"/)?.[1];
    return {
      handle: g.handle,
      nome: g.nome,
      seguidores: inscritos ? numeroDeViews(inscritos) : null,
      shorts: lista.length,
      mediana: med,
      maiorOutlier: med && melhor?.views ? Math.round((melhor.views / med) * 10) / 10 : null,
      foraDaCurva: med ? lista.filter((v) => (v.views ?? 0) >= 2 * med).length : 0,
      melhor: melhor ? { url: `https://www.youtube.com/shorts/${melhor.id}`, titulo: melhor.titulo, views: melhor.views } : null,
      buscas: [...g.buscas],
    };
  });

  // Canal com mediana baixa tem nota inflada (um viral sobre 800 views dá
  // 5.000x): esses vão para o fim. Entre os outros, manda a constância (quantos
  // Shorts passaram de 2x a mediana) e depois o tamanho da mediana.
  const lista = canais
    .filter((c): c is NonNullable<typeof c> => !!c && c.shorts >= 6)
    .map((c) => ({ ...c, pequeno: (c.mediana ?? 0) < MEDIANA_MINIMA }))
    .sort((a, b) => Number(a.pequeno) - Number(b.pequeno) || b.foraDaCurva - a.foraDaCurva || (b.mediana ?? 0) - (a.mediana ?? 0));
  return responder(200, { buscas, canais: lista });
});
