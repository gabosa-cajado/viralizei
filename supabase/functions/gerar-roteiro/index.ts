// Viralizei — gera um roteiro de Reel a partir do que o estudo de referências
// ensinou. Três modos no mesmo endpoint (campo "modo" do corpo):
// - "criar" (padrão): monta o roteiro a partir dos campos do formulário;
// - "melhorar": recebe um roteiro inteiro colado e devolve a versão melhorada
//   com a lista do que mudou;
// - "ideia": Laboratório de ideias; lapida uma ideia crua em ângulo, ganchos
//   (ligados aos dias do calendário), formato e clima de trilha;
// - "plano": Plano 3-3-1; 3 temas × 3 formatos viram 9 vídeos com gancho do
//   calendário, layout e tipo de gancho;
// - "dobrar": o 10º vídeo do plano, na combinação que mais rendeu;
// - "pesquisa", "ganchos", "esboco": as três primeiras etapas do Roteiro em
//   etapas (a quarta é o "criar" com o material das etapas em "etapas");
// - "ajustar": reescreve um roteiro pronto em outra duração ou outro idioma.
// Todo pedido leva a Persona do canal (public.persona) no começo.
// As regras vêm de regras.ts, gerado de conteudo/referencias.json
// (npm run regras): o que a IA segue é o mesmo texto da seção Referências.
// Só sócios. Chave da Anthropic no segredo ANTHROPIC_API_KEY_VIRALIZEI.
import Anthropic from "npm:@anthropic-ai/sdk@0.134.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.134.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { ESCRITA, REGRAS } from "./regras.ts";
import {
  COMO_ESCREVER,
  conferirLoops,
  FORMATOS_HISTORIA,
  type Persona,
  personaEmTexto,
  instrucaoTamanho,
  LAYOUTS,
  localizarLoops,
  nomeFormato,
  orcamento,
  palavrasFaladas,
  segundosPorPalavras,
  TIPOS_GANCHO,
  tipoDoModelo,
} from "./comum.ts";

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
  loops: z.object({ gancho: z.string(), reforco: z.string(), meio: z.string() }),
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

const ids = (l: { id: string }[]) => l.map((o) => o.id) as [string, ...string[]];
const Celula = z.object({
  tema: z.string(),
  formato: z.enum(ids(FORMATOS_HISTORIA)),
  layout: z.enum(ids(LAYOUTS)),
  titulo: z.string(),
  ganchoTela: z.string(),
  ganchoFalado: z.string(),
  tipoGancho: z.enum(ids(TIPOS_GANCHO)),
  diaCalendario: z.number().nullable(),
  porque: z.string(),
});
const Plano = z.object({ celulas: z.array(Celula).min(9).max(9) });

const Pesquisa = z.object({
  resumo: z.string(),
  crencaComum: z.string(),
  realidadeContraria: z.string(),
  erroComum: z.string(),
  fatos: z.array(z.object({ texto: z.string(), conferir: z.string() })).min(2).max(6),
  perguntas: z.array(z.string()).min(2).max(5),
  angulos: z.array(z.object({ titulo: z.string(), porque: z.string() })).min(2).max(4),
  referencias: z.array(z.object({ url: z.string(), porque: z.string() })).max(4),
});

const Ganchos = z.object({
  ganchos: z
    .array(
      z.object({
        textoNaTela: z.string(),
        ganchoFalado: z.string(),
        tipo: z.enum(ids(TIPOS_GANCHO)),
        diaCalendario: z.number().nullable(),
        inspiracao: z.string(),
        porque: z.string(),
      }),
    )
    .min(4)
    .max(6),
});

const Esboco = z.object({
  formato: z.enum(ids(FORMATOS_HISTORIA)),
  batidas: z.array(z.object({ titulo: z.string(), papel: z.string(), oQueDizer: z.string() })).min(3).max(8),
  religar: z.string(),
  fechamento: z.string(),
  avisos: z.array(z.string()),
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

const LISTAS = `FORMATOS (id: nome, o que é): ${FORMATOS_HISTORIA.map((f) => `${f.id}: ${f.nome}${f.facil ? " (fácil)" : " (ambicioso)"}, ${f.explicacao}`).join(" | ")}
LAYOUTS (id: nome): ${LAYOUTS.map((l) => `${l.id}: ${l.nome}, ${l.explicacao}`).join(" | ")}
TIPOS DE GANCHO (id: nome): ${TIPOS_GANCHO.map((t) => `${t.id}: ${t.nome}, ${t.explicacao}`).join(" | ")}`;

const SISTEMA_PLANO = `Você monta o plano 3-3-1 de um time que grava Reels em português do Brasil sobre negócios, tecnologia e motivação: 3 temas × 3 formatos = 9 vídeos, e depois um 10º na combinação que mais render. Siga o estudo abaixo como regra.

${REGRAS}

${LISTAS}

COMO MONTAR OS 9:
1. Uma célula para cada par tema × formato, na ordem: tema 1 com os formatos 1, 2 e 3; depois tema 2; depois tema 3. "tema" repete o tema como veio; "formato" é o id pedido.
2. titulo: o vídeo em uma frase concreta (o que a pessoa vai ver e ganhar), específica do tema, nunca genérica.
3. ganchoTela: preencha um modelo do calendário (lista no pedido) para este vídeo, até 2 linhas, sem pontuação; diaCalendario = número do modelo usado. tipoGancho = o tipo daquele modelo (vem entre colchetes na lista). Varie: no máximo 2 células com o mesmo tipo de gancho, e prefira os tipos que rendem no perfil quando o pedido trouxer esse dado.
4. ganchoFalado: até 12 palavras, começa na primeira palavra, assunto + o que a pessoa ganha.
5. layout: o id que melhor serve ao formato (tutorial pede tela; conversa pede duas pessoas), dando preferência aos layouts que rendem no perfil quando houver dado.
6. porque: uma frase dizendo por que este vídeo deve funcionar, citando o número do perfil quando o pedido trouxer (mediana, salvos por mil), sem inventar número.
Português do Brasil, sem emoji.`;

const SISTEMA_DOBRAR = `${SISTEMA_PLANO}

MODO DOBRAR (o 10º vídeo): recebe as 9 células do plano com o resultado de cada uma quando houver (views, quem passou dos 3 s, salvos) ou, sem resultados, as fórmulas que mais rendem no perfil. Devolva UMA célula: o mesmo tema e o mesmo formato da combinação que mais rendeu (diga qual e por que em "porque", com os números), com um ângulo novo que não repita o título de nenhuma das 9, e o layout e o tipo de gancho que mais rendem.`;

const SISTEMA_PESQUISA = `Você é o pesquisador de pauta de um time que grava Reels em português do Brasil. Recebe um tema (e às vezes um vídeo de referência) e devolve o material para o roteiro, antes de qualquer texto.

Você não tem acesso à internet: use o que sabe e diga, em cada fato, onde conferir (órgão oficial, relatório, site da empresa, notícia). Nunca invente número, data, nome nem estudo. Se não tem certeza do número exato, escreva o fato sem o número e diga onde achar.

Devolva:
- resumo: o tema em duas frases, com o que a pessoa ganha ao entender.
- crencaComum: o que quase todo mundo acredita sobre o tema (a frase que o público diria).
- realidadeContraria: o que na verdade acontece, que contradiz a crença e cria o contraste do vídeo.
- erroComum: o erro mais comum de quem lida com o tema, concreto.
- fatos: de 2 a 6, cada um com texto (o fato, curto) e conferir (onde checar).
- perguntas: de 2 a 5 dúvidas reais do público sobre o tema, do jeito que ele perguntaria.
- angulos: de 2 a 4 recortes não óbvios, cada um com titulo e porque (por que prende).
- referencias: até 4 vídeos da lista de vídeos fora da curva que tratam do mesmo assunto ou têm um ângulo aproveitável, com a url exatamente como veio e porque; vazio se nenhum serve.
Português do Brasil, sem emoji.`;

const SISTEMA_GANCHOS = `Você escreve ganchos de Reels em português do Brasil. Siga o estudo abaixo como regra.

${REGRAS}

${LISTAS}

Recebe: o tema, a pesquisa, os modelos de gancho do calendário (com o tipo) e os ganchos de vídeos fora da curva dos canais que o time acompanha (views, quantas vezes passou a mediana do canal e, nos analisados, o gancho original, o modelo com lacunas ___ e o tipo entre colchetes).
Prefira os modelos dos vídeos fora da curva com nota mais alta: eles já provaram que prendem. Os marcados [FAVORITO] foram escolhidos pelo time; quando houver, pelo menos 2 dos ganchos saem deles.
Devolva de 4 a 6 ganchos para ESTE tema, variando o tipo (no máximo 2 do mesmo tipo). Cada um:
- textoNaTela: até 2 linhas, sem pontuação, com número ou nome próprio quando houver.
- ganchoFalado: até 12 palavras, começa na primeira palavra, assunto + o que a pessoa ganha.
- tipo: o id do tipo de gancho.
- diaCalendario: o número do modelo do calendário que você aplicou, ou null.
- inspiracao: "calendário" quando veio de um modelo, ou a url do vídeo fora da curva cujo mecanismo você adaptou. Adapte o mecanismo; nunca copie a frase do outro criador.
- porque: uma frase dizendo por que prende, citando o padrão do estudo ou a nota do vídeo de inspiração.`;

const SISTEMA_ESBOCO = `Você monta o esboço de um Reel em português do Brasil antes do texto final. Siga o estudo abaixo como regra.

${REGRAS}

${LISTAS}

Recebe: tema, pesquisa, o gancho escolhido, o formato de história pedido, os elementos de contraste pedidos e a duração.
Devolva:
- formato: o id do formato de história (o pedido, salvo se ele não servir; aí escolha outro e diga por quê em avisos).
- batidas: de 3 a 8, na ordem do vídeo, depois do gancho. Cada uma com titulo, papel (o que ela faz pela retenção: reforçar a promessa, contraste, prova, virada, religar, aplicar, fechar) e oQueDizer (2 ou 3 frases curtas em tópicos do que falar, não o texto final). Use os elementos de contraste pedidos: crença comum contra realidade contrária, erro comum, aprendizado pessoal, antes e depois. A quantidade de batidas segue a duração.
- religar: a frase que reabre a curiosidade perto da metade.
- fechamento: a posição firme em uma frase e a chamada.
- avisos: o que falta (prova, história pessoal, número a conferir). Pode ser vazio.`;

const SISTEMA_TRADUZIR = `Você adapta roteiros de Reels já prontos para outro idioma. Não traduza palavra por palavra: cada fala tem que soar como um criador nativo daquele idioma falando na câmera, no mesmo ritmo e com a mesma força.
- Mantenha a estrutura: os mesmos blocos, na mesma ordem, com a mesma ideia, os mesmos números e a mesma posição.
- Gancho: adapte para o jeito que se abre um vídeo naquele idioma, sem perder o número ou o nome próprio.
- loops: devolva as três frases já no idioma novo, iguais às que aparecem na fala.
- Texto na tela, legenda e fechamento no idioma novo. padroesUsados e avisos ficam em português (são os nomes do estudo do time); avise em avisos o que não tem equivalente direto.`;

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
  const { data: personaBanco } = await supabase.from("persona").select("nicho, publico, tom, objetivo, diferencial, evitar").maybeSingle();
  const persona = (personaBanco ?? null) as Persona | null;
  const blocoPersona = personaEmTexto(persona);

  let bruto: Record<string, unknown>;
  try {
    bruto = await req.json();
  } catch {
    return responder(400, { erro: "Pedido inválido." });
  }
  const modo = ["melhorar", "ideia", "plano", "dobrar", "pesquisa", "ganchos", "esboco", "ajustar"].includes(String(bruto.modo)) ? String(bruto.modo) : "criar";
  const e: Record<string, string> = {};
  for (const k of ["nicho", "tema", "publico", "resultado", "prova", "historia", "posicao", "formato", "duracao", "cta"]) {
    e[k] = String(bruto[k] ?? "").trim().slice(0, 600);
  }
  if (!e.nicho && persona?.nicho) e.nicho = persona.nicho.slice(0, 600);
  const roteiroOriginal = String(bruto.roteiroOriginal ?? "").trim().slice(0, 8000);
  const texto = (v: unknown, n: number) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)).trim().slice(0, n);
  const base = texto(bruto.base, 1500);
  const pesquisaTexto = texto(bruto.pesquisa, 5000);
  const ganchoTexto = texto(bruto.gancho, 800);
  const etapas = texto(bruto.etapas, 7000);
  const formatoHistoria = FORMATOS_HISTORIA.some((f) => f.id === bruto.formatoHistoria) ? String(bruto.formatoHistoria) : "";
  const contraste = Array.isArray(bruto.contraste) ? bruto.contraste.map((x) => String(x).slice(0, 80)).slice(0, 6) : [];
  const IDIOMAS: Record<string, string> = { "português": "português do Brasil", "inglês": "inglês", "espanhol": "espanhol" };
  const idioma = IDIOMAS[String(bruto.idioma)] ?? "";
  const roteiroAtual = bruto.roteiro && typeof bruto.roteiro === "object" ? JSON.stringify(bruto.roteiro).slice(0, 12000) : "";
  if (["pesquisa", "ganchos", "esboco"].includes(modo) && e.tema.length < 3) return responder(400, { erro: "Escreva o tema do vídeo primeiro." });
  if (modo === "ganchos" && !pesquisaTexto) return responder(400, { erro: "Faça a pesquisa antes de pedir os ganchos." });
  if (modo === "esboco" && !ganchoTexto) return responder(400, { erro: "Escolha um gancho antes de montar o esboço." });
  if (modo === "ajustar" && (!roteiroAtual || (!idioma && !Number(e.duracao)))) return responder(400, { erro: "Faltou o roteiro e a nova duração ou o idioma." });
  const ideia = String(bruto.ideia ?? "").trim().slice(0, 2000);
  if (modo === "criar" && (!e.nicho || !e.tema)) return responder(400, { erro: "Preencha o nicho e o tema do vídeo." });
  if (modo === "melhorar" && roteiroOriginal.length < 40) return responder(400, { erro: "Cole o roteiro inteiro: o texto veio curto demais para melhorar." });
  if (modo === "ideia" && ideia.length < 5) return responder(400, { erro: "Escreva a ideia em pelo menos uma frase." });
  const lista = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim().slice(0, 120)).filter(Boolean).slice(0, n) : []);
  const temas = lista(bruto.temas, 3);
  const formatos = lista(bruto.formatos, 3).filter((f) => FORMATOS_HISTORIA.some((o) => o.id === f));
  if (modo === "plano" && (temas.length !== 3 || formatos.length !== 3)) return responder(400, { erro: "Escolha 3 temas e 3 formatos diferentes." });
  if (modo === "dobrar" && !Array.isArray(bruto.celulas)) return responder(400, { erro: "Faltou o plano para escolher o 10º vídeo." });

  const duracaoPedida = Number(e.duracao) || 0;
  let pedido = `${montarPedido(e)}\n\n${instrucaoTamanho(duracaoPedida || 60)}`;
  if (modo === "criar" && etapas) {
    pedido += `\n\nMATERIAL DAS ETAPAS (siga: o gancho escolhido abre o vídeo como está, os blocos seguem o esboço na ordem, fatos e números só os da pesquisa; o que faltar vira "[sua prova aqui]" e aviso):\n${etapas}`;
  }
  // Vídeos fora da curva dos canais acompanhados: material para pesquisa e
  // ganchos. Os analisados trazem o gancho como modelo (aba Ganchos); os
  // favoritos dos sócios vêm primeiro.
  let foraDaCurva = "";
  if (modo === "pesquisa" || modo === "ganchos") {
    type Vid = {
      id: string;
      url: string;
      legenda: string;
      views: number | null;
      outlier: number | null;
      gancho_texto: string | null;
      gancho_modelo: string | null;
      gancho_tipo: string | null;
      analise: { tema?: string; angulo?: string } | null;
      canais: { nome: string; rede: string } | { nome: string; rede: string }[] | null;
    };
    const [{ data: vids }, { data: favs }] = await Promise.all([
      supabase
        .from("canal_videos")
        .select("id, url, legenda, views, outlier, gancho_texto, gancho_modelo, gancho_tipo, analise, canais(nome, rede)")
        .gte("outlier", 1.5)
        .neq("legenda", "")
        .order("outlier", { ascending: false })
        .limit(40),
      supabase.from("ganchos_favoritos").select("video_id, canal_videos(id, url, legenda, views, outlier, gancho_texto, gancho_modelo, gancho_tipo, analise, canais(nome, rede))").limit(20),
    ]);
    const favoritos = ((favs ?? []) as { canal_videos: Vid | Vid[] | null }[])
      .map((f) => (Array.isArray(f.canal_videos) ? f.canal_videos[0] : f.canal_videos))
      .filter((v): v is Vid => !!v);
    const idsFav = new Set(favoritos.map((v) => v.id));
    const lista = [...favoritos, ...((vids ?? []) as Vid[]).filter((v) => !idsFav.has(v.id))].slice(0, 40);
    foraDaCurva = lista
      .map((v) => {
        const c = Array.isArray(v.canais) ? v.canais[0] : v.canais;
        const base = `- ${idsFav.has(v.id) ? "[FAVORITO] " : ""}${v.outlier}x · ${v.views ?? "?"} views · ${c?.nome ?? "?"} (${c?.rede ?? "?"}) · ${v.url}`;
        return v.gancho_modelo
          ? `${base} · gancho: "${v.gancho_texto ?? ""}" · modelo: "${v.gancho_modelo}" [${v.gancho_tipo ?? "?"}]${v.analise?.angulo ? ` · ângulo: ${v.analise.angulo}` : ""}`
          : `${base} · "${v.legenda.split("\n")[0].slice(0, 140)}"`;
      })
      .join("\n");
  }
  if (modo === "pesquisa") {
    pedido = `Tema: ${e.tema}
${base ? `Vídeo ou texto de referência: ${base}\n` : ""}
VÍDEOS FORA DA CURVA DOS CANAIS ACOMPANHADOS (nota = views ÷ mediana do canal):
${foraDaCurva || "(nenhum ainda)"}`;
  } else if (modo === "ganchos" || modo === "esboco") {
    const { data: diasBanco } = await supabase.from("dias").select("numero, gancho").order("numero");
    const vistos = new Set<string>();
    const calendario = (diasBanco ?? [])
      .filter((d: { gancho: string }) => {
        const k = d.gancho.trim().toLowerCase();
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .map((d: { numero: number; gancho: string }) => `${d.numero}. [${tipoDoModelo(d.gancho)}] ${d.gancho}`)
      .join("\n");
    pedido = modo === "ganchos"
      ? `Tema: ${e.tema}

PESQUISA:
${pesquisaTexto}

MODELOS DE GANCHO DO CALENDÁRIO (número. [tipo] modelo, ___ é lacuna):
${calendario || "(calendário vazio)"}

GANCHOS DE VÍDEOS FORA DA CURVA (nota = views ÷ mediana do canal):
${foraDaCurva || "(nenhum ainda)"}`
      : `Tema: ${e.tema}
Gancho escolhido: ${ganchoTexto}
Formato de história pedido: ${formatoHistoria ? `${formatoHistoria} (${nomeFormato(formatoHistoria)})` : "escolha o melhor"}
Elementos de contraste: ${contraste.length ? contraste.join("; ") : "crença comum contra realidade contrária"}
Duração alvo: ${duracaoPedida || 60} segundos
${instrucaoTamanho(duracaoPedida || 60)}

PESQUISA:
${pesquisaTexto || "(sem pesquisa)"}`;
  } else if (modo === "ajustar") {
    pedido = idioma
      ? `Adapte este roteiro para ${idioma}.\n\nROTEIRO (JSON):\n${roteiroAtual}`
      : `Reescreva este roteiro inteiro para ${duracaoPedida} segundos, no mesmo formato. Mantenha gancho, ideia, posição, prova e os três loops; ${"se ficar menor, corte o que não serve à promessa do gancho; se ficar maior, aprofunde com substância (exemplo com nome, número, passo, erro comum), sem encher"}.\n\n${instrucaoTamanho(duracaoPedida)}\n\nROTEIRO (JSON):\n${roteiroAtual}`;
  } else if (modo === "melhorar") {
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
  if (modo === "plano" || modo === "dobrar") {
    // Calendário com o tipo de cada modelo, e o que rende no perfil (última recomendação).
    const [{ data: diasBanco }, { data: rec }] = await Promise.all([
      supabase.from("dias").select("numero, gancho").order("numero"),
      supabase.from("recomendacoes").select("numeros").order("data", { ascending: false }).limit(1),
    ]);
    const vistos = new Set<string>();
    const calendario = (diasBanco ?? [])
      .filter((d: { gancho: string }) => {
        const k = d.gancho.trim().toLowerCase();
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .map((d: { numero: number; gancho: string }) => `${d.numero}. [${tipoDoModelo(d.gancho)}] ${d.gancho}`)
      .join("\n");
    const n = (rec?.[0]?.numeros ?? {}) as Record<string, unknown>;
    const perfil = JSON.stringify({ formulas: n.formulas, formatos: n.formatos, layouts: n.layouts, tiposGancho: n.tiposGancho, temas: n.temas, reels: n.reels });
    pedido = `Nicho: ${e.nicho || "negócios, tecnologia e motivação para jovens"}
${modo === "plano" ? `Temas: ${temas.map((t, i) => `${i + 1}. ${t}`).join("; ")}
Formatos: ${formatos.map((f, i) => `${i + 1}. ${f} (${nomeFormato(f)})`).join("; ")}` : `PLANO E RESULTADOS:
${JSON.stringify(bruto.celulas).slice(0, 6000)}`}

O QUE RENDE NO PERFIL (métricas do Metricool; n = quantos posts; vazio se ainda não há dado):
${perfil}

MODELOS DE GANCHO DO CALENDÁRIO (número. [tipo] modelo, ___ é lacuna):
${calendario || "(calendário vazio)"}`;
  }
  if (blocoPersona) pedido = `${blocoPersona}\n\n${pedido}`;
  const esquemas = { ideia: Lapidacao, melhorar: RoteiroMelhorado, plano: Plano, dobrar: Celula, pesquisa: Pesquisa, ganchos: Ganchos, esboco: Esboco } as const;
  const sistemas: Record<string, string> = {
    ideia: SISTEMA_IDEIA,
    melhorar: SISTEMA_MELHORAR,
    plano: SISTEMA_PLANO,
    dobrar: SISTEMA_DOBRAR,
    pesquisa: SISTEMA_PESQUISA,
    ganchos: SISTEMA_GANCHOS,
    esboco: SISTEMA_ESBOCO,
  };
  const esquema = esquemas[modo as keyof typeof esquemas] ?? Roteiro;
  const sistema = modo === "ajustar" && idioma ? SISTEMA_TRADUZIR : sistemas[modo] ?? SISTEMA;
  const soDevolve = ["ideia", "plano", "dobrar", "pesquisa", "ganchos", "esboco"].includes(modo);

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
      // O raciocínio conta dentro de max_tokens: com 8000, reescrever um
      // roteiro de 90 a 120 s parava no meio e a versão não saía (27/10).
      max_tokens: modo === "ideia" || modo === "dobrar" ? 6000 : modo === "ganchos" || modo === "esboco" ? 10000 : 20000,
      // Reescrever (duração, idioma) é ajuste, não criação: esforço baixo cabe nos 150 s.
      output_config: { effort: modo === "ajustar" ? "low" : "medium", format: betaZodOutputFormat(esquema) },
      system: sistema,
      messages: [{ role: "user", content: pedido }],
    });
    if (resposta.stop_reason === "refusal") return responder(422, { erro: modo === "ideia" ? "O modelo recusou esta ideia. Escreva de outro jeito." : "O modelo recusou este pedido. Descreva o tema de outro jeito." });
    if (!resposta.parsed_output) {
      console.error(`gerar-roteiro ${modo}: resposta sem saída (stop_reason ${resposta.stop_reason}, ${resposta.usage?.output_tokens} tokens)`);
      return responder(502, { erro: "A resposta veio incompleta. Tente gerar de novo." });
    }
    if (soDevolve) return responder(200, resposta.parsed_output);

    // Confere o tamanho: o modelo erra a conta de palavras. Fora da faixa,
    // uma segunda passada reescreve no tamanho certo (cabe nos 150 s da função).
    let roteiro = resposta.parsed_output as z.infer<typeof RoteiroMelhorado>;
    const duracaoAlvo = modo === "criar" ? duracaoPedida || 60 : modo === "ajustar" && idioma ? 0 : duracaoPedida;
    const alvo = duracaoAlvo ? orcamento(duracaoAlvo) : null;
    const palavras = palavrasFaladas(roteiro);
    if (alvo && (palavras < alvo.minimo || palavras > alvo.maximo * 1.15) && Date.now() - inicio < 80_000) {
      const ajuste = await cliente.beta.messages.parse({
        model: "claude-opus-5-5",
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 16000,
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
    // Três loops: acha cada frase na fala e diz em que segundo ela cai.
    const loops = localizarLoops(roteiro, roteiro.loops);
    roteiro.avisos = [...roteiro.avisos, ...conferirLoops(loops, roteiro.duracaoEstimadaSeg)];
    return responder(200, { ...roteiro, loops });
  } catch (erro) {
    console.error(`gerar-roteiro ${modo}:`, erro instanceof Error ? erro.message : erro);
    if (erro instanceof Anthropic.AuthenticationError) {
      return responder(502, { erro: "A chave da Anthropic foi recusada. O dono precisa conferir o segredo no Supabase." });
    }
    if (erro instanceof Anthropic.RateLimitError) return responder(429, { erro: "Muitos pedidos seguidos. Espere um minuto e tente de novo." });
    if (erro instanceof Anthropic.APIError && /credit balance/i.test(erro.message)) return responder(402, { erro: "A conta da Anthropic está sem crédito. O dono precisa comprar créditos em console.anthropic.com (Plans & Billing); a chave está certa." });
    if (erro instanceof Anthropic.APIError) return responder(502, { erro: `O serviço de IA respondeu com erro ${erro.status}: ${erro.message.slice(0, 200)}` });
    return responder(502, { erro: "Não foi possível falar com o serviço de IA. Tente de novo." });
  }
});
