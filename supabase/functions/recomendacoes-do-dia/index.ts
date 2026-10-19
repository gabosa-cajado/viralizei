// Viralizei — recomendações do dia a partir das métricas da conta.
// Roda todo dia às 7h30 (Brasília) pelo pg_cron, ou quando um sócio pede
// "Atualizar agora". Passos:
// 1. Se houver token da API do Metricool, atualiza public.metricas_* (ver
//    metricool.ts). Sem token, usa o que já está no banco.
// 2. Calcula os números (numeros.ts): medianas, quem passa dos 3 s, tempo
//    assistido, salvos e compartilhamentos por mil views, temas, chamada
//    "comenta", vídeos repetidos, horários, duração e público.
// 3. Com a chave da Anthropic, o Claude classifica cada publicação (tema; nos
//    Reels também formato de história, layout visual e tipo de gancho, que
//    viram as "fórmulas" da conta) e escreve diagnóstico, destaques,
//    recomendações, o que gravar hoje e o que parar; sem chave, as regras de
//    numeros.ts.
// 4. Grava em public.recomendacoes (uma linha por dia; só a função escreve).
// Autorização igual à do radar: x-viralizei-cron com o segredo do Vault, ou
// JWT de sócio.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { sincronizarMetricool } from "./metricool.ts";
import { calcular, porRegras, TEMAS, temaPorPalavras, type DiaConta, type Horario, type LinhaPublico, type Pub, type Saida } from "./numeros.ts";
import { REGRAS } from "./regras.ts";
import { FORMATOS_HISTORIA, LAYOUTS, TIPOS_GANCHO } from "./comum.ts";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id) as [string, ...string[]];
const lista = (xs: { id: string; nome: string; explicacao: string }[]) => xs.map((x) => `- ${x.id}: ${x.nome}. ${x.explicacao}`).join("\n");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viralizei-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AREAS = ["gancho", "retencao", "tema", "formato", "chamada", "horario", "frequencia", "publico"] as const;

const Resposta = z.object({
  temas: z.array(
    z.object({
      id: z.string(),
      tema: z.enum(TEMAS),
      formato: z.enum(ids(FORMATOS_HISTORIA)).nullable(),
      layout: z.enum(ids(LAYOUTS)).nullable(),
      tipoGancho: z.enum(ids(TIPOS_GANCHO)).nullable(),
    }),
  ),
  manchete: z.string(),
  diagnostico: z.string(),
  destaques: z.array(z.object({ titulo: z.string(), evidencia: z.string(), leitura: z.string() })).min(2).max(5),
  recomendacoes: z
    .array(
      z.object({
        titulo: z.string(),
        area: z.enum(AREAS),
        prioridade: z.enum(["alta", "media", "baixa"]),
        porque: z.string(),
        acao: z.string(),
        diaCalendario: z.number().nullable(),
      }),
    )
    .min(3)
    .max(7),
  gravarHoje: z.object({
    tema: z.string(),
    ganchoTela: z.string(),
    ganchoFalado: z.string(),
    formato: z.string(),
    chamada: z.string(),
    porque: z.string(),
    diaCalendario: z.number().nullable(),
  }),
  postar: z.object({ quando: z.string(), porque: z.string() }),
  parar: z.array(z.string()).max(4),
  publico: z.string(),
});

const SISTEMA = `Você é o analista de performance de um perfil pequeno de Reels em português do Brasil (negócios, IA, psicologia do consumo, motivação). Recebe as métricas reais da conta, já calculadas, e devolve as recomendações do dia para melhorar a performance.

Regras:
- Toda recomendação se apoia num número que veio no pedido; cite o número no "porque". Não invente métrica, média de mercado nem benchmark.
- Amostra pequena (n < 5) ou um único viral: diga que é indício, não regra. Um vídeo muito acima dos outros não define a média.
- "taxa3s" é a porcentagem de views que passaram dos 3 segundos (o gancho). "tempoMedio" é o tempo médio assistido em segundos. "retencao" é estimada pela duração do mesmo vídeo no TikTok, então trate como aproximada.
- Salvos e compartilhamentos por mil views pesam mais que curtidas: mostram valor e alcance novo.
- manchete: uma frase só, de até 12 palavras, com o achado principal (vira título grande na tela). diagnostico: até 5 frases.
- "acao" é algo que dá para fazer hoje, concreto, curto, no imperativo.
- Use o estudo de referências abaixo para dizer COMO corrigir (gancho triplo, zona de trava, loop do vício, palavra-chave nos comentários etc.), citando o nome do padrão.
- gravarHoje: escolha o tema e o formato que os números mais apoiam; o ganchoTela segue um modelo do calendário (diaCalendario = número dele) preenchido para o tema.
- temas: classifique TODAS as publicações recebidas (pelo id) em um dos temas permitidos. Nos Reels, classifique também pela legenda e pelo gancho: formato de história, layout visual (o mais provável pelo texto; na dúvida "camera") e tipo de gancho. Em carrossel e post, formato, layout e tipoGancho vêm null.
- "formulas" são as combinações tema × formato × layout dos Reels (Fórmula de conteúdo, Kallaway); "tiposGancho" mostra que tipo de gancho segura mais. Com n >= 2, use-as para dizer qual combinação repetir e qual largar.
- Português do Brasil, frases curtas, sem jargão de marketing e sem emoji.

FORMATOS DE HISTÓRIA:
${lista(FORMATOS_HISTORIA)}

LAYOUTS VISUAIS:
${lista(LAYOUTS)}

TIPOS DE GANCHO:
${lista(TIPOS_GANCHO)}

${REGRAS}`;

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Data de hoje em Brasília. */
function hojeBrasilia() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
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
  if (!autorizado) return responder(403, { erro: "Só o cron do banco ou um sócio podem gerar as recomendações." });

  const sincronia = await sincronizarMetricool(servico);

  const [pubsR, contaR, publicoR, horariosR, diasR] = await Promise.all([
    servico.from("metricas_publicacoes").select("*").order("publicado_em", { ascending: false }).limit(300),
    servico.from("metricas_conta").select("*"),
    servico.from("metricas_publico").select("*"),
    servico.from("metricas_horarios").select("*"),
    servico.from("dias").select("numero, gancho").order("numero"),
  ]);
  if (pubsR.error) return responder(500, { erro: "Não deu para ler as métricas do banco." });
  const pubs = (pubsR.data ?? []) as Pub[];
  if (!pubs.length) {
    return responder(409, { erro: "Ainda não há métricas da conta no banco. Ligue o Metricool (token da API) ou peça uma carga das métricas." });
  }
  const conta = (contaR.data ?? []) as DiaConta[];
  const publico = (publicoR.data ?? []) as LinhaPublico[];
  const horarios = (horariosR.data ?? []) as Horario[];
  const dias = (diasR.data ?? []) as { numero: number; gancho: string }[];

  let numeros = calcular(pubs, conta, publico, horarios);
  let saida: Saida | null = null;
  let modelo = "regras";
  let motivo = "";

  const chave = Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (chave) {
    try {
      const publicacoes = pubs.slice(0, 120).map((p) => ({
        id: p.id,
        rede: p.rede,
        tipo: p.tipo,
        data: p.publicado_em.slice(0, 16),
        legenda: p.legenda.replace(/\s+/g, " ").slice(0, 280),
        views: p.views,
        alcance: p.alcance,
        taxa3s: p.taxa_3s,
        tempoMedio: p.tempo_medio_seg,
        duracao: p.duracao_seg,
        retencao: p.retencao,
        salvos: p.salvos,
        compartilhamentos: p.compartilhamentos,
        comentarios: p.comentarios,
        curtidas: p.curtidas,
      }));
      // Calendário compacto: os 46 modelos distintos com o primeiro dia de cada.
      const vistos = new Set<string>();
      const calendario = dias
        .filter((d) => {
          const k = d.gancho.trim().toLowerCase();
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        })
        .map((d) => `${d.numero}. ${d.gancho}`)
        .join("\n");
      const cliente = new Anthropic({ apiKey: chave });
      const resposta = await cliente.beta.messages.parse({
        model: "claude-opus-5-5",
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // O pensamento do modelo conta neste limite; com a classificação de
        // cada Reel, 8000 cortava a resposta no meio.
        max_tokens: 16000,
        output_config: { effort: "medium", format: betaZodOutputFormat(Resposta) },
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content: `Hoje: ${hojeBrasilia()}.

NÚMEROS CALCULADOS (Instagram, salvo onde diz TikTok):
${JSON.stringify(numeros)}

PUBLICAÇÕES:
${JSON.stringify(publicacoes)}

MODELOS DE GANCHO DO CALENDÁRIO (número. modelo, ___ é lacuna):
${calendario}`,
          },
        ],
      });
      const r = resposta.parsed_output;
      if (r) {
        const porId = new Map(r.temas.map((t) => [t.id, t]));
        const mudancas: { p: Pub; campos: Pick<Pub, "tema" | "formato" | "layout" | "tipo_gancho"> }[] = [];
        for (const p of pubs) {
          const c = porId.get(p.id);
          if (!c) continue;
          const reel = p.tipo === "reel" || p.tipo === "video";
          const campos = {
            tema: c.tema,
            formato: reel ? c.formato : null,
            layout: reel ? c.layout : null,
            tipo_gancho: reel ? c.tipoGancho : null,
          };
          if (campos.tema !== p.tema || campos.formato !== p.formato || campos.layout !== p.layout || campos.tipo_gancho !== p.tipo_gancho) {
            mudancas.push({ p, campos });
          }
          Object.assign(p, campos);
        }
        await Promise.all(mudancas.map(({ p, campos }) => servico.from("metricas_publicacoes").update(campos).eq("id", p.id)));
        numeros = calcular(pubs, conta, publico, horarios);
        const { temas: _t, ...resto } = r;
        saida = resto;
        modelo = resposta.model;
      } else {
        motivo = resposta.stop_reason === "refusal" ? "o modelo recusou" : "resposta incompleta";
      }
    } catch (e) {
      motivo = e instanceof Anthropic.APIError && /credit balance/i.test(e.message)
        ? "a conta da Anthropic está sem crédito"
        : e instanceof Error ? e.message.slice(0, 160) : "erro na IA";
    }
  } else {
    motivo = "sem chave da Anthropic";
  }

  if (!saida) {
    // Sem IA: temas por palavra-chave, para a tabela de temas não ficar vazia.
    await Promise.all(
      pubs.filter((p) => !p.tema).map((p) => servico.from("metricas_publicacoes").update({ tema: temaPorPalavras(p.legenda) }).eq("id", p.id)),
    );
    for (const p of pubs) if (!p.tema) p.tema = temaPorPalavras(p.legenda);
    numeros = calcular(pubs, conta, publico, horarios);
    saida = porRegras(numeros, dias);
  }

  const linha = {
    data: hojeBrasilia(),
    manchete: saida.manchete,
    diagnostico: saida.diagnostico,
    conteudo: { ...saida, motivo: motivo || undefined },
    numeros: { ...numeros, sincronia, publicacoesLidas: pubs.length },
    dados_ate: pubs.map((p) => p.publicado_em).sort().pop() ?? null,
    fonte: sincronia.ok ? "metricool-api" : "metricool",
    modelo,
    criado_em: new Date().toISOString(),
  };
  const { error } = await servico.from("recomendacoes").upsert(linha, { onConflict: "data" });
  if (error) return responder(500, { erro: "As recomendações saíram, mas não deu para gravar. Tente de novo." });
  return responder(200, linha);
});
