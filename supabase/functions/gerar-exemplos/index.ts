// Viralizei — gera 3 ganchos para o nicho de quem pede.
// Só sócios (privado.eh_socio via public.sou_socio). A chave da Anthropic
// fica no segredo ANTHROPIC_API_KEY das Edge Functions, nunca no navegador.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Resposta = z.object({ exemplos: z.array(z.string()).length(3) });

const SISTEMA = `Você escreve ganchos para Reels em português do Brasil.
Recebe um modelo de gancho com lacunas (___), a explicação de por que ele funciona e o nicho de quem vai gravar.
Devolva 3 ganchos prontos para falar na câmera: cada um preenche as lacunas com algo concreto e específico do nicho, soa natural na boca de quem trabalha nele e tem no máximo 18 palavras.
Os três precisam ser diferentes entre si no assunto, não só na palavra trocada.
Nada de emoji, hashtag ou aspas em volta.`;

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const autorizacao = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: autorizacao } } },
  );
  const { data: socio } = await supabase.rpc("sou_socio");
  if (socio !== true) return responder(403, { erro: "Sua conta não está na lista de sócios do Viralizei." });

  let entrada: { gancho?: unknown; descricao?: unknown; nicho?: unknown };
  try {
    entrada = await req.json();
  } catch {
    return responder(400, { erro: "Pedido inválido." });
  }
  const gancho = String(entrada.gancho ?? "").trim().slice(0, 300);
  const descricao = String(entrada.descricao ?? "").trim().slice(0, 1000);
  const nicho = String(entrada.nicho ?? "").trim().slice(0, 80);
  if (!gancho || !nicho) return responder(400, { erro: "Escreva o seu nicho antes de gerar." });

  const chave = (Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY"));
  if (!chave) {
    return responder(503, {
      erro: "A geração ainda não foi ligada. O dono precisa cadastrar a chave da Anthropic no Supabase.",
    });
  }

  const cliente = new Anthropic({ apiKey: chave });
  try {
    // fallbacks "default": se o modelo recusar, a própria API tenta o modelo reserva.
    const resposta = await cliente.beta.messages.parse({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 2000,
      output_config: { effort: "low", format: betaZodOutputFormat(Resposta) },
      system: SISTEMA,
      messages: [
        {
          role: "user",
          content: `Modelo: ${gancho}\nPor que funciona: ${descricao || "(sem explicação)"}\nNicho: ${nicho}`,
        },
      ],
    });
    if (resposta.stop_reason === "refusal") {
      return responder(422, { erro: "O modelo recusou este pedido. Descreva o nicho de outro jeito." });
    }
    if (!resposta.parsed_output) return responder(502, { erro: "A resposta veio incompleta. Tente gerar de novo." });
    return responder(200, { exemplos: resposta.parsed_output.exemplos });
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) {
      return responder(502, { erro: "A chave da Anthropic foi recusada. O dono precisa conferir o segredo no Supabase." });
    }
    if (erro instanceof Anthropic.RateLimitError) {
      return responder(429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
    }
    if (erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)) {
      return responder(402, { erro: "A conta da Anthropic está sem crédito. O dono precisa comprar créditos em console.anthropic.com (Plans & Billing); a chave está certa." });
    }
    if (erro instanceof Anthropic.APIError) {
      return responder(502, { erro: `O serviço de IA respondeu com erro ${erro.status}: ${erro.message.slice(0, 200)}` });
    }
    return responder(502, { erro: "Não foi possível falar com o serviço de IA. Tente de novo." });
  }
});
