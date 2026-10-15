import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";

const Resposta = z.object({
  exemplos: z.array(z.string()).length(3),
});

const SISTEMA = `Você escreve ganchos para Reels em português do Brasil.
Recebe um modelo de gancho com lacunas (___), a explicação de por que ele funciona e o nicho de quem vai gravar.
Devolva 3 ganchos prontos para falar na câmera: cada um preenche as lacunas com algo concreto e específico do nicho, soa natural na boca de quem trabalha nele e tem no máximo 18 palavras.
Os três precisam ser diferentes entre si no assunto, não só na palavra trocada.
Nada de emoji, hashtag ou aspas em volta.`;

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

export function criarRotaExemplos(chave: string | undefined) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") return responder(res, 405, { erro: "Use POST." });

    let entrada: { gancho?: string; descricao?: string; nicho?: string };
    try {
      entrada = JSON.parse(await lerCorpo(req));
    } catch {
      return responder(res, 400, { erro: "Pedido inválido." });
    }
    const gancho = String(entrada.gancho ?? "").trim().slice(0, 300);
    const descricao = String(entrada.descricao ?? "").trim().slice(0, 1000);
    const nicho = String(entrada.nicho ?? "").trim().slice(0, 80);
    if (!gancho || !nicho) {
      return responder(res, 400, { erro: "Escreva o seu nicho antes de gerar." });
    }

    if (!chave) {
      return responder(res, 503, {
        erro: "A geração precisa de uma chave da Anthropic. Coloque ANTHROPIC_API_KEY no arquivo .env e reinicie o app.",
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
        return responder(res, 422, { erro: "O modelo recusou este pedido. Tente descrever o nicho de outro jeito." });
      }
      if (!resposta.parsed_output) {
        return responder(res, 502, { erro: "A resposta veio incompleta. Tente gerar de novo." });
      }
      return responder(res, 200, { exemplos: resposta.parsed_output.exemplos });
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) {
        return responder(res, 401, { erro: "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env." });
      }
      if (erro instanceof Anthropic.RateLimitError) {
        return responder(res, 429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
      }
      if (erro instanceof Anthropic.APIError) {
        return responder(res, 502, { erro: `O serviço de IA respondeu com erro ${erro.status}. Tente de novo em instantes.` });
      }
      return responder(res, 502, { erro: "Não foi possível falar com o serviço de IA. Confira a internet e tente de novo." });
    }
  };
}
