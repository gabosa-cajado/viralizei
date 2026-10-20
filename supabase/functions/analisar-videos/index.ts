// Viralizei — analisa vídeos fora da curva dos canais acompanhados.
// Para cada vídeo, a IA lê a legenda (ou o título do Short) e os números e
// devolve: o gancho como está, o gancho como modelo com lacunas (___), o tipo
// de gancho, o formato de história, o tema, a semente da ideia, o ângulo, a
// crença comum que o vídeo desafia e a prova que ele usa. Grava em
// public.canal_videos (só a função escreve). É o banco de ganchos da aba
// Canais e do Roteiro em etapas.
//
// Corpo: { ids?: string[] } analisa esses vídeos; sem ids, os maiores
// outliers (1,5x ou mais) ainda sem análise, até 12 por chamada.
// Autorização: header x-viralizei-cron com o segredo do Vault, ou JWT de sócio.
// Chave da Anthropic no segredo ANTHROPIC_API_KEY_VIRALIZEI.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viralizei-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mesmos ids de TIPOS_GANCHO e FORMATOS_HISTORIA em gerar-roteiro/comum.ts.
const TIPOS = {
  erro: "Erro e alerta",
  lista: "Lista",
  experiencia: "Experiência própria",
  segredo: "Verdade escondida",
  comofazer: "Como fazer",
  contraste: "Contraste",
  resultado: "Teste e resultado",
  numero: "Número e custo",
  pergunta: "Pergunta",
  identificacao: "Identificação",
  historia: "História e bastidor",
  oferta: "Palavra-chave",
};
const FORMATOS = {
  lista: "Lista",
  ranking: "Ranking",
  tutorial: "Tutorial",
  comparativo: "Comparativo",
  erro: "Erro comum ou mito",
  opiniao: "Opinião forte",
  caso: "Estudo de caso",
  cenario: "Cenário",
  historia: "História pessoal",
  bastidores: "Bastidores e jornada",
  conversa: "Conversa ou entrevista",
  noticia: "Notícia com ângulo",
  reacao: "Reação ou remix",
};
const chaves = (o: Record<string, string>) => Object.keys(o) as [string, ...string[]];

const Analise = z.object({
  videos: z.array(
    z.object({
      id: z.string(),
      ganchoTexto: z.string(),
      ganchoModelo: z.string(),
      tipo: z.enum(chaves(TIPOS)),
      formato: z.enum(chaves(FORMATOS)),
      tema: z.string(),
      ideia: z.string(),
      angulo: z.string(),
      crenca: z.string(),
      prova: z.string(),
    }),
  ),
});

const SISTEMA = `Você analisa Reels, Shorts e TikToks que foram muito acima da média do próprio canal, para um time brasileiro que grava vídeos curtos. Recebe a legenda ou o título de cada vídeo, o canal e os números. Não há transcrição: trabalhe com o que veio e não invente o que o vídeo diz.

Para cada vídeo devolva, sempre em português do Brasil (traduza e adapte quando o original for em outra língua):
- id: o id como veio.
- ganchoTexto: o gancho do vídeo como dá para ler (primeira frase da legenda ou o título), limpo de hashtag e emoji; se a legenda não traz gancho, escreva a promessa do vídeo em uma frase e comece com "(pela legenda)".
- ganchoModelo: o mesmo gancho virado modelo reutilizável, com ___ no lugar do assunto, do número ou do nome (ex.: "Testei ___ por 30 dias. Olha o que sobrou"). Máximo 14 palavras, natural de falar em português, sem copiar a frase do criador.
- tipo: um destes ids: ${Object.entries(TIPOS).map(([k, v]) => `${k} (${v})`).join(", ")}.
- formato: um destes ids: ${Object.entries(FORMATOS).map(([k, v]) => `${k} (${v})`).join(", ")}.
- tema: o assunto em até 6 palavras.
- ideia: a semente da ideia em uma frase (o que o vídeo entrega para quem assiste).
- angulo: o que torna o vídeo diferente dos outros sobre o mesmo tema, em uma frase.
- crenca: a crença comum que o vídeo desafia, como o público diria; vazio se não desafia nenhuma.
- prova: a prova que o vídeo parece usar (número, print, nome, caso); vazio se não dá para saber.
Sem emoji.`;

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

interface Linha {
  id: string;
  legenda: string;
  views: number | null;
  outlier: number | null;
  duracao_seg: number | null;
  canais: { nome: string; handle: string; rede: string } | { nome: string; handle: string; rede: string }[] | null;
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
  if (!autorizado) return responder(403, { erro: "Só o cron do banco ou um sócio podem analisar vídeos." });

  let corpo: { ids?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio: os maiores outliers sem análise
  }
  const ids = Array.isArray(corpo.ids) ? corpo.ids.map(String).slice(0, 12) : [];

  let consulta = servico
    .from("canal_videos")
    .select("id, legenda, views, outlier, duracao_seg, canais(nome, handle, rede)")
    .neq("legenda", "");
  consulta = ids.length
    ? consulta.in("id", ids)
    : consulta.is("analisado_em", null).gte("outlier", 1.5).order("outlier", { ascending: false }).limit(12);
  const { data, error } = await consulta;
  if (error) return responder(500, { erro: "Não deu para ler os vídeos." });
  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) {
    return responder(200, { analisados: 0, aviso: ids.length ? "Esses vídeos não têm legenda para analisar." : "Nenhum vídeo fora da curva esperando análise." });
  }

  const chave = Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return responder(503, { erro: "A IA ainda não foi ligada. O dono precisa cadastrar a chave da Anthropic no Supabase." });

  const pedido = linhas
    .map((v) => {
      const c = Array.isArray(v.canais) ? v.canais[0] : v.canais;
      return `id: ${v.id}\ncanal: ${c?.nome || "@" + (c?.handle ?? "?")} (${c?.rede ?? "?"})\nviews: ${v.views ?? "?"} · ${v.outlier ?? "?"}x a mediana do canal${v.duracao_seg ? ` · ${v.duracao_seg} s` : ""}\nlegenda/título: ${v.legenda.replace(/\s+/g, " ").slice(0, 600)}`;
    })
    .join("\n\n");

  const cliente = new Anthropic({ apiKey: chave });
  try {
    const resposta = await cliente.beta.messages.parse({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 8000,
      output_config: { effort: "low", format: betaZodOutputFormat(Analise) },
      system: SISTEMA,
      messages: [{ role: "user", content: pedido }],
    });
    const saida = resposta.parsed_output?.videos ?? [];
    const validos = new Set(linhas.map((v) => v.id));
    const agora = new Date().toISOString();
    let gravados = 0;
    for (const a of saida) {
      if (!validos.has(a.id)) continue;
      const { error: e } = await servico
        .from("canal_videos")
        .update({
          gancho_texto: a.ganchoTexto.slice(0, 300),
          gancho_modelo: a.ganchoModelo.slice(0, 200),
          gancho_tipo: a.tipo,
          formato: a.formato,
          analise: { tema: a.tema, ideia: a.ideia, angulo: a.angulo, crenca: a.crenca, prova: a.prova },
          analisado_em: agora,
        })
        .eq("id", a.id);
      if (!e) gravados++;
    }
    return responder(200, { analisados: gravados });
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) return responder(502, { erro: "A chave da Anthropic foi recusada. O dono precisa conferir o segredo no Supabase." });
    if (erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)) return responder(402, { erro: "A conta da Anthropic está sem crédito." });
    if (erro instanceof Anthropic.APIError) return responder(502, { erro: `O serviço de IA respondeu com erro ${erro.status}.` });
    return responder(502, { erro: "Não foi possível falar com o serviço de IA. Tente de novo." });
  }
});
