// Viralizei — radar diário de tendências.
// Roda todo dia às 7h (Brasília) pelo pg_cron, ou quando um sócio pede
// "Atualizar agora". Lê o Google Trends do Brasil e os vídeos mais vistos da
// semana no YouTube em buscas do nicho, cruza com os ganchos do calendário e,
// com a chave da Anthropic, pede ao Claude uma manchete, um resumo e 4 a 6
// ideias, cada uma com o que fazer e como aplicar. Grava em public.radar (só
// a função escreve; sócios leem). As regras do estudo de referências vêm de
// regras.ts (npm run regras).
//
// Autorização: header x-viralizei-cron com o segredo guardado no Vault do
// banco (conferido pela função public.radar_segredo_confere, chamada com a
// chave de serviço), ou JWT de sócio (public.sou_socio).
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { REGRAS } from "./regras.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viralizei-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CONSULTAS = [
  "empreendedorismo",
  "marketing digital",
  "inteligência artificial negócios",
  "dinheiro investimentos",
  "produtividade carreira",
];

interface Tendencia {
  titulo: string;
  trafego: string;
  noticia: string;
  url: string;
}

interface VideoQuente {
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

interface Ideia {
  titulo: string;
  porqueAgora: string;
  oQueFazer: string;
  comoAplicar: string[];
  textoNaTela: string;
  ganchoFalado: string;
  provaNaTela: string;
  formato: string;
  diaCalendario: number | null;
  fonte: string;
}

const Resposta = z.object({
  manchete: z.string(),
  resumo: z.string(),
  ideias: z.array(
    z.object({
      titulo: z.string(),
      porqueAgora: z.string(),
      oQueFazer: z.string(),
      comoAplicar: z.array(z.string()).min(3).max(5),
      textoNaTela: z.string(),
      ganchoFalado: z.string(),
      provaNaTela: z.string(),
      formato: z.string(),
      diaCalendario: z.number().nullable(),
      fonte: z.string(),
    }),
  ).min(3).max(6),
});

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function limpar(texto: string) {
  return texto
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** "500000+" vira "500 mil+"; "20000+" vira "20 mil+". */
function trafegoLegivel(bruto: string) {
  const m = bruto.match(/^(\d+)(\+?)$/);
  if (!m) return bruto;
  const n = Number(m[1]);
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi${m[2]}`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} mil${m[2]}`;
  return bruto;
}

async function lerTendencias(): Promise<Tendencia[]> {
  try {
    const r = await fetch("https://trends.google.com/trending/rss?geo=BR", {
      headers: { "Accept-Language": "pt-BR,pt;q=0.9", "User-Agent": "Mozilla/5.0 (Viralizei radar)" },
      signal: AbortSignal.timeout(15000),
    });
    const xml = await r.text();
    const itens = xml.split("<item>").slice(1, 21);
    return itens.map((it) => {
      const pega = (tag: string) => limpar((it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) ?? [])[1] ?? "");
      return {
        titulo: pega("title"),
        trafego: trafegoLegivel(pega("ht:approx_traffic")),
        noticia: pega("ht:news_item_title"),
        url: pega("ht:news_item_url"),
      };
    }).filter((t) => t.titulo);
  } catch {
    return [];
  }
}

function numeroDeViews(texto: string): number {
  const m = texto.replace(/\./g, "").match(/([\d,]+)\s*(mi|mil|k|m)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(",", "."));
  const u = (m[2] ?? "").toLowerCase();
  return Math.round(n * (u === "mi" || u === "m" ? 1_000_000 : u === "mil" || u === "k" ? 1_000 : 1));
}

async function lerYouTube(consulta: string): Promise<VideoQuente[]> {
  try {
    // sp=CAMSBAgDEAE: ordenar por visualizações, enviados esta semana.
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}&sp=CAMSBAgDEAE%3D&hl=pt&gl=BR`;
    const r = await fetch(url, {
      headers: {
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
        Cookie: "CONSENT=YES+1; SOCS=CAI",
      },
      signal: AbortSignal.timeout(20000),
    });
    const html = await r.text();
    const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!m) return [];
    const dados = JSON.parse(m[1]);
    const achados: VideoQuente[] = [];
    const andar = (o: unknown, prof: number) => {
      if (!o || typeof o !== "object" || prof > 40 || achados.length >= 12) return;
      if (Array.isArray(o)) {
        for (const x of o) andar(x, prof + 1);
        return;
      }
      const obj = o as Record<string, unknown>;
      const v = obj.videoRenderer as Record<string, unknown> | undefined;
      if (v && typeof v.videoId === "string") {
        const texto = (x: unknown) => {
          const t = x as { simpleText?: string; runs?: { text: string }[] } | undefined;
          return t?.simpleText ?? t?.runs?.map((r) => r.text).join("") ?? "";
        };
        const views = texto(v.viewCountText);
        achados.push({
          consulta,
          id: v.videoId,
          titulo: texto(v.title).slice(0, 120),
          canal: texto(v.ownerText).slice(0, 60),
          views,
          viewsNumero: numeroDeViews(views),
          publicado: texto(v.publishedTimeText),
          duracao: texto(v.lengthText),
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
        });
        return;
      }
      for (const k in obj) andar(obj[k], prof + 1);
    };
    andar(dados, 0);
    return achados.sort((a, b) => b.viewsNumero - a.viewsNumero).slice(0, 5);
  } catch {
    return [];
  }
}

const SISTEMA = `Você é o radar diário do Viralizei, um time que grava Reels sobre negócios, tecnologia e motivação em português do Brasil. Todo dia de manhã você lê o que o Brasil está buscando e os vídeos mais vistos da semana no nicho, e diz ao time o que gravar hoje e como.

Recebe: os assuntos mais buscados no Brasil hoje (com tráfego aproximado), os vídeos mais vistos da semana no YouTube em buscas do nicho, e a lista de ganchos do calendário do time.

Devolva:
- manchete: uma frase de até 12 palavras dizendo o que está quente hoje e o ângulo (ex.: "Dívida pública em alta: dia de falar de dinheiro no bolso").
- resumo: 2 ou 3 frases curtas, uma ideia por frase, explicando o que puxa atenção hoje e por que o time deve pegar carona. Números com separador legível (500 mil, 10 mil, 1,2 mi), nunca "500000+".
- ideias: de 4 a 6, só dentro do nicho (negócios, dinheiro, tecnologia, carreira, mentalidade). Ignore esporte, celebridade, novela, crime e política partidária, a menos que haja um ângulo claro de negócio ou dinheiro.
Cada ideia tem:
- titulo: curto, nomeando o assunto.
- porqueAgora: o dado que justifica (tráfego ou views, com o número legível).
- oQueFazer: uma frase imperativa dizendo o vídeo a gravar hoje (formato + ângulo + para quem).
- comoAplicar: 3 a 5 passos concretos e curtos, na ordem de execução: o que mostrar nos 2 primeiros segundos, qual prova colocar na tela, como montar o corpo, a chamada no fim e o horário de postar (17h–19h). Cada passo cita o padrão do estudo que aplica.
- textoNaTela: até 2 linhas, sem pontuação, com número ou nome próprio quando houver.
- ganchoFalado: até 12 palavras, assunto + o que a pessoa ganha.
- provaNaTela: o print, número, gráfico ou nome que aparece na zona de trava.
- formato: Fala para câmera, React, Lista, Comparativo, Tutorial na tela, Conversa ou Bastidores.
- diaCalendario: número do dia do calendário cujo gancho melhor serve (ou null).
- fonte: título da notícia ou URL do vídeo.

${REGRAS}

Nada de emoji, hashtag ou aspas decorativas.`;

function ideiasSemModelo(tendencias: Tendencia[], videos: VideoQuente[], dias: { numero: number; gancho: string }[]): Ideia[] {
  const ideias: Ideia[] = [];
  const ganchos = dias.length ? dias : [{ numero: 0, gancho: "Te explico ___ em um minuto" }];
  const passosBase = (prova: string, cta: string) => [
    `Primeiros 2 segundos: título na tela em até 2 linhas e a primeira palavra antes de 0,3 s (padrão dos cinco).`,
    `Zona de trava: mostre ${prova} na tela logo depois do gancho (prova na tela, não na fala).`,
    "Corpo em 2 ou 3 blocos: o que está em jogo, uma pergunta, uma virada; frases de até 12 palavras.",
    `Fechamento: posição firme em uma frase + ${cta}. Poste entre 17h e 19h.`,
  ];
  tendencias.slice(0, 3).forEach((t, i) => {
    const g = ganchos[(i * 7) % ganchos.length];
    ideias.push({
      titulo: `${t.titulo}: o que isso tem a ver com o seu negócio`,
      porqueAgora: `Está entre os assuntos mais buscados do Brasil hoje (${t.trafego || "tráfego alto"}).`,
      oQueFazer: `Grave hoje uma fala para câmera ligando "${t.titulo}" a uma decisão de dinheiro ou negócio do seu público.`,
      comoAplicar: passosBase(`o número da notícia (${t.trafego || "buscas de hoje"})`, "pergunta de uma palavra nos comentários"),
      textoNaTela: `${t.titulo.toUpperCase()}\nE O SEU BOLSO`,
      ganchoFalado: g.gancho.replace(/___/g, t.titulo),
      provaNaTela: t.noticia ? `Manchete: ${t.noticia}` : `Buscas de hoje: ${t.trafego}`,
      formato: "Fala para câmera",
      diaCalendario: g.numero || null,
      fonte: t.noticia || t.titulo,
    });
  });
  videos.slice(0, 2).forEach((v, i) => {
    const g = ganchos[(i * 11 + 3) % ganchos.length];
    ideias.push({
      titulo: `Reagir a "${v.titulo}"`,
      porqueAgora: `${v.views} em uma semana no YouTube (${v.canal}).`,
      oQueFazer: `Grave um React: o vídeo em quadro menor no alto, você comenta o que concorda e o que faria diferente.`,
      comoAplicar: passosBase(`o contador de views do vídeo original (${v.views})`, "palavra-chave nos comentários para mandar o seu material"),
      textoNaTela: `O VÍDEO DE ${v.views.toUpperCase()}\nESTÁ ERRADO?`,
      ganchoFalado: g.gancho.replace(/___/g, v.titulo.split(/[:|(]/)[0].trim()),
      provaNaTela: `Print do vídeo com ${v.views}`,
      formato: "React",
      diaCalendario: g.numero || null,
      fonte: v.url,
    });
  });
  return ideias;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Quem chama: o cron (segredo do Vault) ou um sócio logado.
  const segredo = req.headers.get("x-viralizei-cron");
  let autorizado = false;
  if (segredo) {
    const { data } = await servico.rpc("radar_segredo_confere", { s: segredo });
    autorizado = data === true;
  } else {
    const autorizacao = req.headers.get("Authorization") ?? "";
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: autorizacao } },
    });
    const { data } = await comoUsuario.rpc("sou_socio");
    autorizado = data === true;
  }
  if (!autorizado) return responder(403, { erro: "Só o cron do banco ou um sócio podem rodar o radar." });

  const [tendencias, ...porConsulta] = await Promise.all([lerTendencias(), ...CONSULTAS.map(lerYouTube)]);
  const videos = porConsulta.flat().sort((a, b) => b.viewsNumero - a.viewsNumero);
  const { data: diasBanco } = await servico.from("dias").select("numero, gancho").order("numero");
  const dias = (diasBanco ?? []) as { numero: number; gancho: string }[];

  let ideias: Ideia[] = [];
  let manchete = "";
  let resumo = "";
  let modelo = "regras";
  let motivo = "";
  const chave = (Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY"));
  if (chave && (tendencias.length || videos.length)) {
    try {
      const cliente = new Anthropic({ apiKey: chave });
      const resposta = await cliente.beta.messages.parse({
        model: "claude-opus-5-5",
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 6000,
        output_config: { effort: "medium", format: betaZodOutputFormat(Resposta) },
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content: `Assuntos mais buscados no Brasil hoje:\n${tendencias.map((t) => `- ${t.titulo} (${t.trafego}) — ${t.noticia}`).join("\n") || "(sem dados)"}\n\nVídeos mais vistos da semana no YouTube:\n${videos.slice(0, 15).map((v) => `- [${v.consulta}] ${v.titulo} — ${v.canal} — ${v.views} — ${v.url}`).join("\n") || "(sem dados)"}\n\nGanchos do calendário:\n${dias.map((d) => `${d.numero}. ${d.gancho}`).join("\n")}`,
          },
        ],
      });
      if (resposta.parsed_output) {
        ideias = resposta.parsed_output.ideias;
        manchete = resposta.parsed_output.manchete;
        resumo = resposta.parsed_output.resumo;
        modelo = resposta.model ?? "claude";
      }
    } catch (erro) {
      // Sem modelo hoje: as regras abaixo garantem o radar mesmo assim.
      motivo = erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)
        ? "a conta da Anthropic está sem crédito"
        : erro instanceof Error ? erro.message.slice(0, 120) : "erro desconhecido";
    }
  }
  if (ideias.length === 0) {
    ideias = ideiasSemModelo(tendencias, videos, dias);
    manchete = tendencias[0] ? `${tendencias[0].titulo} lidera as buscas de hoje` : "Radar por regras, sem IA hoje";
    resumo = chave
      ? `O modelo não respondeu hoje (${motivo}); as ideias abaixo vieram só do cruzamento de tendência com gancho.`
      : "Sem chave da Anthropic no Supabase: as ideias abaixo vieram só do cruzamento de tendência com gancho. O dono liga a IA cadastrando ANTHROPIC_API_KEY_VIRALIZEI.";
  }

  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // Brasília (sem horário de verão)
  const linha = {
    data: hoje,
    fontes: { tendencias, videos: videos.slice(0, 20), consultas: CONSULTAS, manchete, motivo: motivo || undefined },
    ideias,
    resumo,
    modelo,
    criado_em: new Date().toISOString(),
  };
  const { error } = await servico.from("radar").upsert(linha, { onConflict: "data" });
  if (error) return responder(500, { erro: "Não deu para gravar o radar: " + error.message });
  return responder(200, linha);
});
