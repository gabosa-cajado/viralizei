// Viralizei — gera um roteiro de Reel a partir do que o estudo de referências
// ensinou. As regras vêm de regras.ts, gerado de conteudo/referencias.json
// (npm run regras): o que a IA segue é o mesmo texto da seção Referências.
// Só sócios. Chave da Anthropic no segredo ANTHROPIC_API_KEY_VIRALIZEI.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { REGRAS } from "./regras.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Roteiro = z.object({
  textoNaTela: z.string(),
  ganchoFalado: z.string(),
  acaoVisual: z.string(),
  zonaDeTrava: z.string(),
  blocos: z.array(z.object({ titulo: z.string(), fala: z.string(), textoNaTela: z.string(), visual: z.string() })).min(2).max(5),
  fechamento: z.string(),
  legenda: z.string(),
  duracaoEstimadaSeg: z.number(),
  padroesUsados: z.array(z.string()).min(4).max(10),
  avisos: z.array(z.string()),
});

export const SISTEMA = `Você escreve roteiros de Reels em português do Brasil para um time que fala de negócios, tecnologia e motivação. O roteiro é para ser lido linha por linha na câmera.

Siga o estudo abaixo como regra, não como inspiração: cada parte do roteiro aplica um padrão ou framework dele, e você diz qual.

${REGRAS}

COMO MONTAR:
1. Gancho triplo alinhado: texto na tela (até 2 linhas, sem pontuação, sem "e/ou/mas", com nome próprio ou número quando houver), gancho falado (até 12 palavras: assunto + o que a pessoa ganha, os 4 S) e uma ação visual nos 2 primeiros segundos. A fala começa na primeira palavra, sem "oi gente".
2. Zona de trava (2 a 3 frases): confirma a promessa e traz a prova concreta na tela (número, print, nome, caso).
3. Corpo em 2 a 4 blocos com o loop do vício: stakes nas 3 primeiras frases, uma pergunta específica cedo, uma virada com pista, cada bloco fecha abrindo o próximo. Double Aha: duas ideias não óbvias nos dois primeiros blocos. Cada bloco traz "visual": o que trocar na tela naquele trecho (print, gráfico, PiP, objeto), um a cada 10–15 s.
4. Frases curtas (até 12 palavras, melhor 6), uma ideia por frase, tom de conversa, posição firme sem meio-termo, uma metáfora ou um nome batizado para a ideia central.
5. Fechamento: a posição em uma frase + a chamada pedida (pergunta de uma palavra, palavra-chave para comentar, ou seguir com placar).
6. Legenda: primeira linha = gancho falado; depois a tese em 1 a 2 frases e a chamada. Sem hashtag, sem emoji.
7. Duração alvo respeitada (~2,5 palavras por segundo).
8. padroesUsados: de 4 a 10 itens, cada um "Nome do padrão ou framework (criador): onde entrou no roteiro". Use os nomes do estudo.
9. Avisos: o que faltou nos dados (sem prova, sem história) e o que você assumiu.
Use a história, a prova e a posição que o usuário deu; não invente números. Se faltar prova, deixe "[sua prova aqui]" e avise.`;

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function montarPedido(e: Record<string, string>) {
  return `Nicho: ${e.nicho}
Tema do vídeo: ${e.tema}
Para quem: ${e.publico || "(não informado)"}
O que a pessoa ganha: ${e.resultado || "(não informado)"}
Prova ou número: ${e.prova || "(nenhuma)"}
História ou erro pessoal: ${e.historia || "(nenhuma)"}
Posição firme: ${e.posicao || "(não informada)"}
Formato: ${e.formato || "Fala para câmera"}
Duração alvo: ${e.duracao || "60"} segundos
Chamada no fim: ${e.cta || "pergunta de uma palavra"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const autorizacao = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: socio } = await supabase.rpc("sou_socio");
  if (socio !== true) return responder(403, { erro: "Sua conta não está na lista de sócios do Viralizei." });

  let bruto: Record<string, unknown>;
  try {
    bruto = await req.json();
  } catch {
    return responder(400, { erro: "Pedido inválido." });
  }
  const e: Record<string, string> = {};
  for (const k of ["nicho", "tema", "publico", "resultado", "prova", "historia", "posicao", "formato", "duracao", "cta"]) {
    e[k] = String(bruto[k] ?? "").trim().slice(0, 600);
  }
  if (!e.nicho || !e.tema) return responder(400, { erro: "Preencha o nicho e o tema do vídeo." });

  const chave = (Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY"));
  if (!chave) {
    return responder(503, { erro: "A IA ainda não foi ligada. O dono precisa cadastrar a chave da Anthropic no Supabase." });
  }

  const cliente = new Anthropic({ apiKey: chave });
  try {
    const resposta = await cliente.beta.messages.parse({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 5000,
      output_config: { effort: "medium", format: betaZodOutputFormat(Roteiro) },
      system: SISTEMA,
      messages: [{ role: "user", content: montarPedido(e) }],
    });
    if (resposta.stop_reason === "refusal") return responder(422, { erro: "O modelo recusou este pedido. Descreva o tema de outro jeito." });
    if (!resposta.parsed_output) return responder(502, { erro: "A resposta veio incompleta. Tente gerar de novo." });
    return responder(200, resposta.parsed_output);
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) {
      return responder(502, { erro: "A chave da Anthropic foi recusada. O dono precisa conferir o segredo no Supabase." });
    }
    if (erro instanceof Anthropic.RateLimitError) return responder(429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
    if (erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)) return responder(402, { erro: "A conta da Anthropic está sem crédito. O dono precisa comprar créditos em console.anthropic.com (Plans & Billing); a chave está certa." });
    if (erro instanceof Anthropic.APIError) return responder(502, { erro: `O serviço de IA respondeu com erro ${erro.status}: ${erro.message.slice(0, 200)}` });
    return responder(502, { erro: "Não foi possível falar com o serviço de IA. Tente de novo." });
  }
});
