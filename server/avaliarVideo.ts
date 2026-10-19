import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";

// Mesmo núcleo de supabase/functions/_shared/avaliar.ts, para o modo local
// (chaves no .env: ANTHROPIC_API_KEY e, para a fala, OPENAI_API_KEY).

const Estado = z.enum(["ok", "falha", "conferir"]);
const Saida = z.object({
  resumo: z.string(),
  ganchoFalado: z.string(),
  textoNaTela: z.string(),
  criterios: z.array(z.object({ id: z.string(), nome: z.string(), estado: Estado, detalhe: z.string() })),
  melhorias: z.array(z.string()).min(1).max(5),
});

const PESOS: Record<string, number> = {
  duracao: 8, vertical: 4, primeira: 10, silencio: 6, pausas: 4, energia: 5,
  gancho_tamanho: 8, gancho_especifico: 5, gancho_abertura: 4, tela_presente: 6, tela_linhas: 6, tela_pontuacao: 4,
  prova: 10, alinhado: 8, posicao: 6, assinatura: 6, interrupcao: 5, luz: 4, enquadramento: 4, cta: 6, loop_reforco: 5, loop_meio: 6,
};

const CRITERIOS = `Julgue cada um destes critérios (id entre parênteses), com estado ok, falha ou conferir e um detalhe de uma frase citando o que você viu ou ouviu:
- (duracao) entre 36 e 150 s
- (vertical) 9:16
- (primeira) primeira palavra falada antes de 0,5 s
- (silencio) menos de 20% do áudio em silêncio
- (pausas) no máximo 6 pausas longas (>0,25 s) por minuto
- (energia) volume dos últimos 10% acima de 75% da média
- (gancho_tamanho) gancho falado (primeira frase) em até 12 palavras
- (gancho_especifico) gancho com número ou nome próprio
- (gancho_abertura) não começa com saudação ("oi gente", "fala pessoal")
- (tela_presente) há texto na tela já nos primeiros 3 s
- (tela_linhas) o título na tela tem no máximo 2 linhas
- (tela_pontuacao) o título não tem ponto final, vírgula nem "e/ou/mas/que"
- (prova) prova concreta visível ou dita nos primeiros 10 s (print, número, nome, objeto, caso)
- (alinhado) texto na tela, fala e imagem contam a mesma coisa
- (posicao) o vídeo defende uma posição firme, sem meio-termo
- (assinatura) roupa, cenário e fonte parecem fixos e reconhecíveis (uma assinatura visual, não aleatório)
- (interrupcao) o visual muda ao longo do vídeo (gráfico, print, PiP, movimento, troca de plano)
- (luz) rosto mais claro que o fundo, sem contraluz estourada
- (enquadramento) busto ou plano americano, câmera na altura dos olhos ou pouco abaixo, mãos aparecendo quando fala
- (cta) termina com uma chamada que cabe em uma palavra (pergunta, palavra-chave para comentar, seguir com placar, salvar)
- (loop_reforco) entre 5 e 15 s a fala aumenta a aposta do gancho em vez de começar a responder (loop de reforço do Triple Loop)
- (loop_meio) perto da metade do vídeo (40% a 60% da fala) uma frase reabre a curiosidade ou promete algo que só vem no fim (loop de religar)
Os seis primeiros vêm das medidas numéricas: aplique o número à regra. Os de texto na tela e de visual vêm dos quadros. Os de fala vêm da transcrição; sem transcrição, marque-os como conferir e diga isso no detalhe. Para os dois de loop, estime o segundo pela posição da frase na transcrição em relação à duração.`;

const SISTEMA = `Você avalia um Reel antes de ele ser postado, usando o que o estudo dos cinco criadores que mais crescem no nicho de negócios, tecnologia e motivação mediu: fala começa antes de 0,3 s; sempre há texto na tela (título de até 2 linhas, sem pontuação); prova na tela nos primeiros segundos; assinatura visual fixa; vídeos de 36 a 150 s; posição firme; chamada de uma palavra no fim; legenda que repete o gancho.
Você recebe: medidas numéricas do vídeo, até 8 quadros com o tempo de cada um, e a transcrição da fala (quando houver). Leia o texto que aparece nos quadros; descreva roupa, cenário, luz e enquadramento com base neles.
Responda em português do Brasil, direto, sem elogio vazio. Em "melhorias", dê 3 a 5 mudanças concretas, ordenadas da que mais vale a nota para a que menos vale.
${CRITERIOS}`;

interface Entrada {
  medidas: { duracaoSeg: number; largura: number; altura: number; vertical: boolean; temAudio: boolean; primeiraFalaMs: number | null; silencio: number | null; pausasLongasPorMin: number | null; energiaFinal: number | null };
  quadros: { tempo: number; imagem: string }[];
  audioWav: string | null;
  transcricao?: string | null;
}

async function transcrever(audioWav: string | null, chave: string | undefined, pronta?: string | null): Promise<{ texto: string; aviso?: string }> {
  if (pronta && pronta.trim()) return { texto: pronta.trim().slice(0, 6000) };
  if (!audioWav) return { texto: "", aviso: "O vídeo não tem áudio legível: os critérios de fala ficaram sem conferir." };
  if (!chave) return { texto: "", aviso: "Sem OPENAI_API_KEY no .env: a fala não foi transcrita, só o visual e as medidas entraram na nota." };
  try {
    const bytes = Buffer.from(audioWav, "base64");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "audio.wav");
    form.append("model", "gpt-4o-transcribe");
    form.append("language", "pt");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(110000) });
    if (!r.ok) return { texto: "", aviso: `A transcrição falhou (${r.status}): os critérios de fala ficaram sem conferir.` };
    const j = (await r.json()) as { text?: string };
    return { texto: String(j.text ?? "").trim() };
  } catch {
    return { texto: "", aviso: "A transcrição não respondeu a tempo: os critérios de fala ficaram sem conferir." };
  }
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let corpo = "";
    req.on("data", (parte) => {
      corpo += parte;
      if (corpo.length > 40_000_000) reject(new Error("corpo grande demais"));
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

export function criarRotaAvaliar(chave: string | undefined, chaveOpenAI: string | undefined) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") return responder(res, 405, { erro: "Use POST." });
    let bruto: Entrada & { sonda?: boolean };
    try {
      bruto = JSON.parse(await lerCorpo(req));
    } catch {
      return responder(res, 400, { erro: "Pedido inválido." });
    }
    if (bruto.sonda) return responder(res, 200, { ia: !!chave, transcricao: !!chaveOpenAI });
    const e = bruto;
    if (!e.medidas || !Array.isArray(e.quadros) || e.quadros.length === 0) {
      return responder(res, 400, { erro: "Pedido inválido: faltam as medidas ou os quadros do vídeo." });
    }
    if (!chave) return responder(res, 503, { erro: "A avaliação com IA precisa de ANTHROPIC_API_KEY no .env." });

    const { texto: transcricao, aviso } = await transcrever(e.audioWav, chaveOpenAI, e.transcricao);
    const m = e.medidas;
    const medidasTexto = `Duração: ${m.duracaoSeg.toFixed(1)} s. Resolução: ${m.largura}×${m.altura} (${m.vertical ? "vertical" : "horizontal"}). Tem áudio: ${m.temAudio ? "sim" : "não"}. Primeira fala: ${m.primeiraFalaMs == null ? "não detectada" : (m.primeiraFalaMs / 1000).toFixed(2) + " s"}. Silêncio: ${m.silencio == null ? "?" : Math.round(m.silencio * 100) + "%"}. Pausas longas por minuto: ${m.pausasLongasPorMin ?? "?"}. Energia final: ${m.energiaFinal == null ? "?" : Math.round(m.energiaFinal * 100) + "% da média"}.`;
    const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: `MEDIDAS\n${medidasTexto}\n\nTRANSCRIÇÃO\n${transcricao || "(sem transcrição)"}\n\nQUADROS, na ordem:` }];
    for (const q of e.quadros.slice(0, 8)) {
      conteudo.push({ type: "text", text: `Quadro em ${q.tempo} s:` });
      conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: q.imagem } });
    }

    const cliente = new Anthropic({ apiKey: chave });
    try {
      const resposta = await cliente.beta.messages.parse({
        model: "claude-opus-5-5",
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 4000,
        output_config: { effort: "medium", format: betaZodOutputFormat(Saida) },
        system: SISTEMA,
        messages: [{ role: "user", content: conteudo }],
      });
      if (resposta.stop_reason === "refusal") return responder(res, 422, { erro: "O modelo recusou avaliar este vídeo." });
      const saida = resposta.parsed_output;
      if (!saida) return responder(res, 502, { erro: "A resposta veio incompleta. Tente de novo." });
      const criterios = saida.criterios.filter((c) => PESOS[c.id]).map((c) => ({ ...c, peso: PESOS[c.id] }));
      const total = criterios.reduce((a, c) => a + c.peso, 0);
      const pontos = criterios.reduce((a, c) => a + (c.estado === "ok" ? c.peso : c.estado === "conferir" ? c.peso * 0.4 : 0), 0);
      return responder(res, 200, {
        nota: total ? Math.round((pontos / total) * 100) : 0,
        resumo: saida.resumo,
        transcricao,
        ganchoFalado: saida.ganchoFalado,
        textoNaTela: saida.textoNaTela,
        criterios,
        melhorias: saida.melhorias,
        avisos: aviso ? [aviso] : [],
      });
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) return responder(res, 401, { erro: "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env." });
      if (erro instanceof Anthropic.RateLimitError) return responder(res, 429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
      if (erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)) return responder(res, 402, { erro: "A conta da Anthropic está sem crédito. O dono precisa comprar créditos em console.anthropic.com (Plans & Billing); a chave está certa." });
      if (erro instanceof Anthropic.APIError) return responder(res, 502, { erro: `O serviço de IA respondeu com erro ${erro.status}: ${erro.message.slice(0, 200)}` });
      return responder(res, 502, { erro: "Não foi possível falar com o serviço de IA. Confira a internet e tente de novo." });
    }
  };
}
