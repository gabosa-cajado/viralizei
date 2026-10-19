// Viralizei — gera um roteiro de Reel a partir do que o estudo de referências
// ensinou. Três modos no mesmo endpoint (campo "modo" do corpo):
// - "criar" (padrão): monta o roteiro a partir dos campos do formulário;
// - "melhorar": recebe um roteiro inteiro colado e devolve a versão melhorada
//   com a lista do que mudou;
// - "ideia": Laboratório de ideias; lapida uma ideia crua em ângulo, ganchos
//   (ligados aos dias do calendário), formato e clima de trilha.
// As regras vêm de regras.ts, gerado de conteudo/referencias.json
// (npm run regras): o que a IA segue é o mesmo texto da seção Referências.
// Só sócios. Chave da Anthropic no segredo ANTHROPIC_API_KEY_VIRALIZEI.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { ESCRITA, REGRAS } from "./regras.ts";
import { COMO_ESCREVER, instrucaoTamanho, orcamento, palavrasFaladas, segundosPorPalavras } from "./comum.ts";

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
  blocos: z.array(z.object({ titulo: z.string(), fala: z.string(), textoNaTela: z.string(), visual: z.string() })).min(2).max(9),
  fechamento: z.string(),
  legenda: z.string(),
  duracaoEstimadaSeg: z.number(),
  padroesUsados: z.array(z.string()).min(4).max(10),
  avisos: z.array(z.string()),
});

const RoteiroMelhorado = Roteiro.extend({
  mudancas: z.array(z.string()).min(2).max(10),
});

const Lapidacao = z.object({
  resumo: z.string(),
  angulo: z.string(),
  publico: z.string(),
  ganchos: z
    .array(z.object({ textoNaTela: z.string(), ganchoFalado: z.string(), padrao: z.string(), diaCalendario: z.number().nullable() }))
    .min(3)
    .max(5),
  formato: z.string(),
  climaTrilha: z.enum(["epica", "tensa", "reflexiva", "leve"]),
  provaSugerida: z.string(),
  proximoPasso: z.string(),
  riscos: z.array(z.string()),
});

export const SISTEMA = `Você escreve roteiros de Reels em português do Brasil para um time que fala de negócios, tecnologia e motivação. O roteiro é para ser lido linha por linha na câmera.

Siga o estudo abaixo como regra, não como inspiração: cada parte do roteiro aplica um padrão ou framework dele, e você diz qual. A escrita segue o jeito de um dos cinco criadores.

${REGRAS}

${ESCRITA}

${COMO_ESCREVER}`;

const SISTEMA_MELHORAR = `${SISTEMA}

MODO MELHORAR: o usuário colou um roteiro que já escreveu. Devolva a versão melhorada no mesmo formato acima.
- Mantenha a ideia central, a voz, as histórias, os nomes e os números do autor. Não invente fato, número nem caso; se um trecho pede prova que não existe, deixe "[sua prova aqui]" e avise.
- Corte o que não serve à promessa do gancho; reordene se a ordem prende menos.
- Respeite o TAMANHO do pedido. Se o roteiro do autor for curto para a duração, aprofunde o que ele já disse (o exemplo, o passo, a consequência); se for longo, corte.
- mudancas: de 2 a 10 itens, na ordem do vídeo, cada um "O que mudou: por quê (padrão do estudo)". Diga também o que estava bom e ficou.`;

const SISTEMA_IDEIA = `Você é o laboratório de ideias de um time que grava Reels em português do Brasil sobre negócios, tecnologia e motivação. Recebe uma ideia crua e devolve o vídeo lapidado. Siga o estudo abaixo como regra.

${REGRAS}

COMO LAPIDAR:
1. resumo: a ideia em uma frase, com o que a pessoa ganha.
2. angulo: o recorte que torna a ideia não óbvia (a virada, a posição firme, o inimigo comum). Uma ou duas frases.
3. publico: para quem exatamente, em poucas palavras.
4. ganchos: de 3 a 5 opções, cada uma com textoNaTela (até 2 linhas, sem pontuação), ganchoFalado (até 12 palavras, começa na primeira palavra), padrao (nome do padrão ou framework do estudo e criador) e diaCalendario (o número do dia do calendário cujo modelo de gancho você aplicou, da lista que vem no pedido, ou null). Varie os padrões entre as opções.
5. formato: um destes: Fala para câmera, Conversa com convidado, Walk-and-talk, Tutorial na tela, Lista, Comparativo, React (vídeo de outra pessoa), Bastidores, Entrevistando o meu eu do passado.
6. climaTrilha: epica, tensa, reflexiva ou leve, pensando em música baixa embaixo da fala.
7. provaSugerida: que prova concreta mostrar na tela (print, número, caso, objeto). Não invente números; diga o que buscar.
8. proximoPasso: a primeira coisa a fazer para gravar isso hoje.
9. riscos: o que pode dar errado (ideia batida, promessa que o vídeo não cumpre, falta de prova). Pode ser vazio.`;

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
  const modo = bruto.modo === "melhorar" || bruto.modo === "ideia" ? bruto.modo : "criar";
  const e: Record<string, string> = {};
  for (const k of ["nicho", "tema", "publico", "resultado", "prova", "historia", "posicao", "formato", "duracao", "cta"]) {
    e[k] = String(bruto[k] ?? "").trim().slice(0, 600);
  }
  const roteiroOriginal = String(bruto.roteiroOriginal ?? "").trim().slice(0, 8000);
  const ideia = String(bruto.ideia ?? "").trim().slice(0, 2000);
  if (modo === "criar" && (!e.nicho || !e.tema)) return responder(400, { erro: "Preencha o nicho e o tema do vídeo." });
  if (modo === "melhorar" && roteiroOriginal.length < 40) return responder(400, { erro: "Cole o roteiro inteiro: o texto veio curto demais para melhorar." });
  if (modo === "ideia" && ideia.length < 5) return responder(400, { erro: "Escreva a ideia em pelo menos uma frase." });

  const duracaoPedida = Number(e.duracao) || 0;
  let pedido = `${montarPedido(e)}\n\n${instrucaoTamanho(duracaoPedida || 60)}`;
  if (modo === "melhorar") {
    pedido = `Nicho: ${e.nicho || "(não informado)"}
Formato: ${e.formato || "o mesmo do roteiro"}
Duração alvo: ${e.duracao || "a do roteiro"} segundos
Chamada no fim: ${e.cta || "a do roteiro, ou pergunta de uma palavra"}

${duracaoPedida ? `\n${instrucaoTamanho(duracaoPedida)}\n` : ""}
ROTEIRO DO AUTOR:
${roteiroOriginal}`;
  } else if (modo === "ideia") {
    const { data: diasBanco } = await supabase.from("dias").select("numero, gancho").order("numero");
    const calendario = (diasBanco ?? []).map((d: { numero: number; gancho: string }) => `${d.numero}. ${d.gancho}`).join("\n");
    pedido = `Nicho: ${e.nicho || "negócios, tecnologia e motivação"}

IDEIA CRUA:
${ideia}

MODELOS DE GANCHO DO CALENDÁRIO (número. modelo, ___ é lacuna):
${calendario || "(calendário vazio)"}`;
  }
  const esquema = modo === "ideia" ? Lapidacao : modo === "melhorar" ? RoteiroMelhorado : Roteiro;
  const sistema = modo === "ideia" ? SISTEMA_IDEIA : modo === "melhorar" ? SISTEMA_MELHORAR : SISTEMA;

  const chave = (Deno.env.get("ANTHROPIC_API_KEY_VIRALIZEI") ?? Deno.env.get("ANTHROPIC_API_KEY"));
  if (!chave) {
    return responder(503, { erro: "A IA ainda não foi ligada. O dono precisa cadastrar a chave da Anthropic no Supabase." });
  }

  const cliente = new Anthropic({ apiKey: chave });
  const inicio = Date.now();
  try {
    const resposta = await cliente.beta.messages.parse({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: modo === "ideia" ? 4000 : 8000,
      output_config: { effort: "medium", format: betaZodOutputFormat(esquema) },
      system: sistema,
      messages: [{ role: "user", content: pedido }],
    });
    if (resposta.stop_reason === "refusal") return responder(422, { erro: modo === "ideia" ? "O modelo recusou esta ideia. Escreva de outro jeito." : "O modelo recusou este pedido. Descreva o tema de outro jeito." });
    if (!resposta.parsed_output) return responder(502, { erro: "A resposta veio incompleta. Tente gerar de novo." });
    if (modo === "ideia") return responder(200, resposta.parsed_output);

    // Confere o tamanho: o modelo erra a conta de palavras. Fora da faixa,
    // uma segunda passada reescreve no tamanho certo (cabe nos 150 s da função).
    let roteiro = resposta.parsed_output as z.infer<typeof RoteiroMelhorado>;
    const duracaoAlvo = modo === "criar" ? duracaoPedida || 60 : duracaoPedida;
    const alvo = duracaoAlvo ? orcamento(duracaoAlvo) : null;
    const palavras = palavrasFaladas(roteiro);
    if (alvo && (palavras < alvo.minimo * 0.92 || palavras > alvo.maximo * 1.15) && Date.now() - inicio < 80_000) {
      const ajuste = await cliente.beta.messages.parse({
        model: "claude-opus-5-5",
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 6000,
        output_config: { effort: "low", format: betaZodOutputFormat(esquema) },
        system: sistema,
        messages: [
          { role: "user", content: pedido },
          { role: "assistant", content: JSON.stringify(roteiro) },
          {
            role: "user",
            content: palavras < alvo.minimo
              ? `A fala ficou com ${palavras} palavras; para ${alvo.duracao} s precisa de ${alvo.minimo} a ${alvo.maximo}. Reescreva o roteiro inteiro no mesmo formato, com ${alvo.blocos} blocos de ${alvo.porBloco[0]} a ${alvo.porBloco[1]} palavras: mantenha gancho, ideia e posição, e aprofunde com substância (exemplo com nome, número, passo a passo, erro comum, objeção respondida). Sem repetir ideia nem encher.`
              : `A fala ficou com ${palavras} palavras; para ${alvo.duracao} s cabem ${alvo.minimo} a ${alvo.maximo}. Reescreva o roteiro inteiro no mesmo formato cortando o que não serve à promessa do gancho, sem perder a virada nem a prova.`,
          },
        ],
      }).catch(() => null);
      if (ajuste?.parsed_output) roteiro = ajuste.parsed_output as typeof roteiro;
    }
    const final = palavrasFaladas(roteiro);
    roteiro.duracaoEstimadaSeg = segundosPorPalavras(final);
    if (alvo && final < alvo.minimo * 0.85) {
      roteiro.avisos = [...roteiro.avisos, `A fala tem ${final} palavras, uns ${roteiro.duracaoEstimadaSeg} s no ritmo do estudo, para uma meta de ${alvo.duracao} s. Gere de novo ou acrescente um exemplo.`];
    }
    return responder(200, roteiro);
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
