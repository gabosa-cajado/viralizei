// Viralizei — avaliação automática de um Reel. Só sócios. Segredos:
// ANTHROPIC_API_KEY (obrigatório) e OPENAI_API_KEY (transcrição; sem ela,
// a fala fica sem conferir e a nota avisa).
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { avaliarVideo, type Entrada } from "./avaliar.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(status: number, dados: unknown) {
  return new Response(JSON.stringify(dados), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder(405, { erro: "Use POST." });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: socio } = await supabase.rpc("sou_socio");
  if (socio !== true) return responder(403, { erro: "Sua conta não está na lista de sócios do Viralizei." });

  let e: Entrada;
  try {
    e = await req.json();
    if (!e.medidas || !Array.isArray(e.quadros) || e.quadros.length === 0) throw new Error("x");
  } catch {
    return responder(400, { erro: "Pedido inválido: faltam as medidas ou os quadros do vídeo." });
  }

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return responder(503, { erro: "A avaliação com IA ainda não foi ligada. O dono precisa cadastrar a chave da Anthropic no Supabase." });

  try {
    return responder(200, await avaliarVideo(e, chave, Deno.env.get("OPENAI_API_KEY")));
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) return responder(502, { erro: "A chave da Anthropic foi recusada. O dono precisa conferir o segredo no Supabase." });
    if (erro instanceof Anthropic.RateLimitError) return responder(429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
    if (erro instanceof Anthropic.APIError) return responder(502, { erro: `O serviço de IA respondeu com erro ${erro.status}. Tente de novo em instantes.` });
    if (erro instanceof Error && erro.message === "recusa") return responder(422, { erro: "O modelo recusou avaliar este vídeo." });
    return responder(502, { erro: "A avaliação não terminou. Tente de novo em instantes." });
  }
});
