import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import { REGRAS } from "./regras";

// Mesmo roteiro da Edge Function gerar-roteiro, para o modo local (chave no .env).
// Mudou lá, mude aqui. As regras vêm de regras.ts (npm run regras).

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

const SISTEMA = `Você escreve roteiros de Reels em português do Brasil para um time que fala de negócios, tecnologia e motivação. O roteiro é para ser lido linha por linha na câmera.

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

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let corpo = "";
    req.on("data", (parte) => {
      corpo += parte;
      if (corpo.length > 20_000) reject(new Error("corpo grande demais"));
    });
    req.on("end", () => resolve(corpo));
    req.on("error", reject);
  });
}

function responder(res: ServerResponse, status: number, dados: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(dados));
}

export function criarRotaRoteiro(chave: string | undefined) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") return responder(res, 405, { erro: "Use POST." });
    let bruto: Record<string, unknown>;
    try {
      bruto = JSON.parse(await lerCorpo(req));
    } catch {
      return responder(res, 400, { erro: "Pedido inválido." });
    }
    const e: Record<string, string> = {};
    for (const k of ["nicho", "tema", "publico", "resultado", "prova", "historia", "posicao", "formato", "duracao", "cta"]) {
      e[k] = String(bruto[k] ?? "").trim().slice(0, 600);
    }
    if (!e.nicho || !e.tema) return responder(res, 400, { erro: "Preencha o nicho e o tema do vídeo." });
    if (!chave) {
      return responder(res, 503, { erro: "A versão com IA precisa de ANTHROPIC_API_KEY no .env. A versão por regras já está na tela." });
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
        messages: [
          {
            role: "user",
            content: `Nicho: ${e.nicho}\nTema do vídeo: ${e.tema}\nPara quem: ${e.publico || "(não informado)"}\nO que a pessoa ganha: ${e.resultado || "(não informado)"}\nProva ou número: ${e.prova || "(nenhuma)"}\nHistória ou erro pessoal: ${e.historia || "(nenhuma)"}\nPosição firme: ${e.posicao || "(não informada)"}\nFormato: ${e.formato || "Fala para câmera"}\nDuração alvo: ${e.duracao || "60"} segundos\nChamada no fim: ${e.cta || "pergunta de uma palavra"}`,
          },
        ],
      });
      if (resposta.stop_reason === "refusal") return responder(res, 422, { erro: "O modelo recusou este pedido. Descreva o tema de outro jeito." });
      if (!resposta.parsed_output) return responder(res, 502, { erro: "A resposta veio incompleta. Tente gerar de novo." });
      return responder(res, 200, resposta.parsed_output);
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) return responder(res, 401, { erro: "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env." });
      if (erro instanceof Anthropic.RateLimitError) return responder(res, 429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
      if (erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)) return responder(res, 402, { erro: "A conta da Anthropic está sem crédito. O dono precisa comprar créditos em console.anthropic.com (Plans & Billing); a chave está certa." });
      if (erro instanceof Anthropic.APIError) return responder(res, 502, { erro: `O serviço de IA respondeu com erro ${erro.status}: ${erro.message.slice(0, 200)}` });
      return responder(res, 502, { erro: "Não foi possível falar com o serviço de IA. Confira a internet e tente de novo." });
    }
  };
}
