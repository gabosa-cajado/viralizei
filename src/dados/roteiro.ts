import { FunctionsHttpError } from "@supabase/supabase-js";
import { noArtefato } from "./plataforma";
import { noSite, supabase } from "./site";
import { contarPalavras, orcamento, palavrasFaladas, segundosPorPalavras } from "../../supabase/functions/gerar-roteiro/comum";

// Gerador de roteiro. Sempre monta uma versão por regras no navegador (o que
// o estudo de referências ensinou) e, quando há IA (site com chave no
// Supabase, ou modo local com .env), pede uma versão melhor.

export interface EntradaRoteiro {
  nicho: string;
  tema: string;
  publico: string;
  resultado: string;
  prova: string;
  historia: string;
  posicao: string;
  formato: string;
  duracao: string;
  cta: string;
}

export interface BlocoRoteiro {
  titulo: string;
  fala: string;
  textoNaTela: string;
  /** O que trocar na tela neste trecho (print, gráfico, PiP, objeto). */
  visual?: string;
}

export interface Roteiro {
  textoNaTela: string;
  ganchoFalado: string;
  acaoVisual: string;
  zonaDeTrava: string;
  blocos: BlocoRoteiro[];
  fechamento: string;
  legenda: string;
  duracaoEstimadaSeg: number;
  /** Padrões e frameworks do estudo de referências aplicados, com onde entraram. */
  padroesUsados?: string[];
  avisos: string[];
}

/** Roteiro colado pelo usuário e devolvido melhorado pela IA. */
export interface RoteiroMelhorado extends Roteiro {
  /** O que mudou e por quê, na ordem do vídeo. */
  mudancas: string[];
}

export interface PedidoMelhorar {
  roteiroOriginal: string;
  nicho: string;
  formato: string;
  duracao: string;
  cta: string;
}

/** Chama a Edge Function gerar-roteiro num dos modos extras (só no site). */
export async function chamarRoteiroNoSite<T>(corpo: Record<string, unknown>, foraDoSite: string): Promise<T> {
  if (noArtefato || !noSite || !supabase) throw new Error(foraDoSite);
  const { data, error } = await supabase.functions.invoke("gerar-roteiro", { body: corpo });
  if (error) {
    const resposta = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
    throw new Error(resposta.erro ?? "Não deu para falar com a IA agora. Confira a internet e tente de novo.");
  }
  return data as T;
}

export function melhorarRoteiroIA(p: PedidoMelhorar): Promise<RoteiroMelhorado> {
  return chamarRoteiroNoSite<RoteiroMelhorado>(
    { modo: "melhorar", ...p },
    "Melhorar um roteiro pronto usa a IA do site. Abra o Viralizei pelo site e entre com a sua conta.",
  );
}

export const FORMATOS_ROTEIRO = [
  "Fala para câmera",
  "Conversa com convidado",
  "Walk-and-talk",
  "Tutorial na tela",
  "Lista",
  "Comparativo",
  "React (vídeo de outra pessoa)",
  "Bastidores",
  "Entrevistando o meu eu do passado",
];

export const CTAS = [
  "Pergunta de uma palavra nos comentários",
  "Palavra-chave nos comentários (eu mando o material)",
  "Seguir, com placar público",
  "Salvar para usar depois",
];

export const ENTRADA_VAZIA: EntradaRoteiro = {
  nicho: "",
  tema: "",
  publico: "",
  resultado: "",
  prova: "",
  historia: "",
  posicao: "",
  formato: FORMATOS_ROTEIRO[0],
  duracao: "60",
  cta: CTAS[0],
};

function primeiraPalavra(texto: string) {
  return texto.trim().split(/\s+/)[0] ?? "";
}

function maiusculaInicial(t: string) {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function numeroDe(texto: string): string | null {
  // Prefere dinheiro e porcentagem; depois número com unidade; número solto só por último.
  const m =
    texto.match(/R\$\s?\d[\d.,]*(\s?(mil|milh[õo]es))?(\s?por\s(m[êe]s|ano|dia))?/i) ??
    texto.match(/\d[\d.,]*\s?%/) ??
    texto.match(/\d[\d.,]*\s?(mil|milh[õo]es|dias?|anos?|horas?|meses|semanas?|views|seguidores|clientes|cl[íi]nicas|vendas|pacientes|alunos)\b/i) ??
    texto.match(/\b\d[\d.,]*\b/);
  return m ? m[0].trim() : null;
}

/** Versão por regras: segue a estrutura que apareceu nos cinco criadores. */
export function montarRoteiroLocal(e: EntradaRoteiro): Roteiro {
  const tema = e.tema.trim().replace(/\.$/, "");
  const nicho = e.nicho.trim();
  const resultado = e.resultado.trim() || `entender ${tema} de uma vez`;
  const prova = e.prova.trim();
  const numero = numeroDe(prova) ?? numeroDe(tema);
  const posicao = e.posicao.trim();
  const historia = e.historia.trim();
  const publico = e.publico.trim();
  const duracao = Math.max(30, Math.min(150, Number(e.duracao) || 60));
  const avisos: string[] = [];

  const textoNaTela = numero
    ? `${maiusculaInicial(tema).toUpperCase()}\n${numero.toUpperCase()} E NINGUÉM TE CONTOU`
    : `${maiusculaInicial(tema).toUpperCase()}\nO QUE NINGUÉM TE CONTOU`;

  const ganchoFalado = numero
    ? `${maiusculaInicial(tema)}: ${numero} e quase ninguém sabe.`
    : `${maiusculaInicial(tema)}. Como ${resultado.replace(/\.$/, "")}.`;

  const acaoVisual =
    e.formato.startsWith("Tutorial") || e.formato.startsWith("Comparativo")
      ? "Abra com a tela ou o número já visível, você entra em 1 segundo."
      : e.formato.startsWith("React")
        ? "O vídeo citado aparece em quadro menor no alto desde o primeiro quadro."
        : "Incline o corpo para a câmera e mostre o print, o objeto ou o número na mão.";

  const alvo = orcamento(duracao);
  const curto = duracao <= 45;
  const promessa = curto ? "Em segundos eu te mostro por onde começar." : `Fica até o fim que eu te mostro, em ${Math.round(duracao)} segundos, o que muda e por onde começar.`;
  const zonaDeTrava = prova
    ? `É o seguinte: ${prova.replace(/\.$/, "")}.${curto ? "" : " Isso não é teoria, é o que aconteceu."} ${promessa}`
    : `Eu já passei por isso ${nicho ? `trabalhando com ${nicho}` : "na prática"}. [sua prova aqui] ${promessa}`;
  if (!prova) avisos.push("Sem prova. Coloque um número, print ou nome na zona de trava: é o que faz a pessoa ficar depois do gancho.");
  if (!historia) avisos.push("Sem história. Um erro seu, com data, dá peso à virada e à lição.");
  if (!posicao) avisos.push("Sem posição firme. Diga em uma frase o que você defende, sem meio-termo: é o que gera comentário.");

  // Biblioteca de blocos na ordem da história; a duração decide quantos entram
  // (orcamento: ~40 palavras por bloco a 3 palavras por segundo). A ordem de
  // prioridade garante o loop do vício (jogo, pergunta, virada) antes do resto.
  const ganho = resultado.replace(/\.$/, "");
  const biblioteca: (BlocoRoteiro & { prioridade: number })[] = [
    {
      prioridade: 2,
      titulo: "O que está em jogo",
      fala: `Se você é ${publico || "quem está começando"}, isso pesa mais do que parece. Cada semana sem resolver ${tema} é uma semana longe de ${ganho}. E quem resolve primeiro sai na frente: o resto passa o ano copiando.`,
      textoNaTela: "CADA SEMANA CONTA",
      visual: "Número do custo (tempo ou dinheiro) entra na tela em fonte grande.",
    },
    {
      prioridade: 3,
      titulo: "A pergunta",
      fala: historia
        ? `${maiusculaInicial(historia.replace(/\.$/, ""))}. Eu achava que o problema era falta de esforço. Não era. A pergunta certa era outra: por que quem sabia menos que eu chegava antes? A resposta me irritou, e é ela que muda tudo.`
        : `A maioria acha que o problema em ${tema} é falta de esforço. Não é. A pergunta certa é outra: por que quem sabe menos chega antes? [sua história aqui: o erro que você cometeu, com data] A resposta incomoda, e muda tudo.`,
      textoNaTela: "O PROBLEMA NÃO ERA ESSE",
      visual: "Print ou foto do momento do erro (com data) em PiP no canto.",
    },
    {
      prioridade: 4,
      titulo: "Um exemplo",
      fala: `Um exemplo concreto: ${prova ? prova.replace(/\.$/, "") : "[um caso com nome e número: quem, o que fez, quanto mudou]"}. Repara no detalhe: não foi talento, foi uma escolha pequena, repetida todo dia. É essa escolha que quase ninguém vê de fora.`,
      textoNaTela: "NÃO FOI TALENTO",
      visual: "O caso na tela: print, foto ou o número antes e depois lado a lado.",
    },
    {
      prioridade: 1,
      titulo: "A virada",
      fala: `O que mudou foi uma coisa só: ${posicao ? posicao.replace(/\.$/, "") : `[a regra que você aplica em ${tema}]`}. Parece simples demais. E é exatamente por isso que ninguém faz: a gente procura a resposta difícil e pula a óbvia.`,
      textoNaTela: posicao ? maiusculaInicial(posicao).slice(0, 40).toUpperCase() : "A ÚNICA MUDANÇA",
      visual: "Troca de enquadramento (mais perto) e a regra escrita na tela, palavra por palavra.",
    },
    {
      prioridade: 5,
      titulo: "Como aplicar",
      fala: `Na prática, começa assim. Primeiro: escolhe uma parte de ${tema} e ignora o resto por uma semana. Segundo: mede um número só, todo dia, no mesmo horário. [seu passo concreto aqui] Sem isso, você não sabe se melhorou ou só se ocupou.`,
      textoNaTela: "1 PARTE · 1 NÚMERO",
      visual: "Os passos numerados entram um por um na tela.",
    },
    {
      prioridade: 6,
      titulo: "O erro comum",
      fala: `O erro mais comum é querer fazer tudo de uma vez. Eu vi isso ${nicho ? `em ${nicho}` : "de perto"} [um caso real]. A pessoa se empolga na segunda, trava na quarta e desiste no domingo. Menos coisa, todo dia, ganha de muita coisa uma vez.`,
      textoNaTela: "SEGUNDA · QUARTA · DOMINGO",
      visual: "Calendário da semana na tela, riscando os dias.",
    },
    {
      prioridade: 7,
      titulo: "A objeção",
      fala: `"Mas eu não tenho tempo." Tem sim: são dez minutos. O problema não é o tempo, é começar sem saber onde quer chegar. Quando o objetivo é ${ganho}, os dez minutos param de parecer sacrifício.`,
      textoNaTela: "10 MINUTOS",
      visual: "Cronômetro de 10 minutos rodando no canto.",
    },
    {
      prioridade: 8,
      titulo: "O que muda depois",
      fala: `Depois de um mês, a diferença aparece onde importa: ${ganho}. E aí vem a parte boa: quem está do seu lado começa a perguntar o que você mudou. A resposta vai ser essa aqui.`,
      textoNaTela: "30 DIAS DEPOIS",
      visual: "Antes e depois em tela dividida.",
    },
  ];
  const ctaFala = e.cta.startsWith("Palavra-chave")
    ? `Comenta ${(primeiraPalavra(tema) || "QUERO").toUpperCase()} que eu te mando o passo a passo.`
    : e.cta.startsWith("Seguir")
      ? `Segue aqui: estou documentando ${nicho || "isso"} do zero e o placar vai na legenda.`
      : e.cta.startsWith("Salvar")
        ? `Salva este vídeo para a próxima vez que ${tema} aparecer.`
        : `Me conta em uma palavra: você está do lado de quem faz ou de quem espera?`;
  const fechamento = `${posicao ? maiusculaInicial(posicao.replace(/\.$/, "")) + "." : `Em ${tema}, o difícil não é saber, é fazer.`} ${ctaFala}`;

  // Entra bloco por prioridade enquanto a fala couber na faixa da duração.
  const escolhidos = new Set<(typeof biblioteca)[number]>();
  let total = contarPalavras([ganchoFalado, zonaDeTrava, fechamento].join(" "));
  for (const b of [...biblioteca].sort((a, c) => a.prioridade - c.prioridade)) {
    const n = contarPalavras(b.fala);
    if (escolhidos.size >= 2 && total + n > alvo.maximo) break;
    escolhidos.add(b);
    total += n;
  }
  const blocos: BlocoRoteiro[] = biblioteca.filter((b) => escolhidos.has(b)).map(({ prioridade: _p, ...b }) => b);

  const legenda = `${ganchoFalado}\n${posicao ? maiusculaInicial(posicao.replace(/\.$/, "")) + "." : `Quem entende ${tema} para de perder ${primeiraPalavra(resultado) || "tempo"}.`}\n${ctaFala}`;

  const palavras = palavrasFaladas({ ganchoFalado, zonaDeTrava, blocos, fechamento });
  const duracaoEstimadaSeg = segundosPorPalavras(palavras);
  if (palavras > alvo.maximo * 1.15) avisos.push(`O texto dá uns ${duracaoEstimadaSeg} s para uma meta de ${duracao} s: corte um bloco ou encurte as falas.`);
  if (palavras < alvo.minimo * 0.85) avisos.push(`O texto dá uns ${duracaoEstimadaSeg} s para uma meta de ${duracao} s (${alvo.total} palavras): preencha os trechos entre colchetes com um exemplo seu.`);
  avisos.push("Esta é a versão por regras, um esqueleto com lacunas. Para o texto escrito no ritmo dos criadores do estudo, clique em Escrever com IA.");

  const padroesUsados = [
    "Gancho triplo (Kallaway): texto na tela, fala e ação visual contam a mesma coisa",
    numero ? "Número específico no gancho (checklist Gancho): " + numero : "Assunto nomeado no gancho (checklist Gancho)",
    "Zona de trava (Kallaway): promessa confirmada e prova logo depois do gancho",
    "Loop do vício (Kallaway): o que está em jogo, pergunta, virada e religação entre os blocos",
    "Uma posição, dita sem hedge (Benchimol): a virada e o fechamento",
    e.cta.startsWith("Palavra-chave") ? "Palavra-chave nos comentários (Luka Choi, Kallaway): fechamento" : e.cta.startsWith("Seguir") ? "Documentar a jornada com placar (Luka Choi): fechamento" : "Fechamento com pergunta de uma palavra (Tarik Lopes)",
    "Primeira linha da legenda = gancho falado (490 legendas lidas)",
    "Trocar o visual a cada 10–15 s (checklist Visual): um visual por bloco",
  ];

  return { textoNaTela, ganchoFalado, acaoVisual, zonaDeTrava, blocos, fechamento, legenda, duracaoEstimadaSeg, padroesUsados, avisos };
}

/** Versão com IA: Edge Function no site, rota local com .env no dev. */
export async function gerarRoteiroIA(e: EntradaRoteiro): Promise<Roteiro> {
  if (!noArtefato && noSite && supabase) {
    const { data, error } = await supabase.functions.invoke("gerar-roteiro", { body: e });
    if (error) {
      const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
      throw new Error(corpo.erro ?? "Não deu para gerar agora. Confira a internet e tente de novo.");
    }
    return data as Roteiro;
  }
  if (!noArtefato) {
    const resposta = await fetch("/api/roteiro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
    }).catch(() => {
      throw new Error("Sem conexão com o app. Confira se ele ainda está rodando.");
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro ?? "Não deu para gerar agora. Tente de novo.");
    return dados as Roteiro;
  }
  throw new Error("A versão com IA do roteiro existe só no site.");
}

/** Só o que se fala, na ordem, sem rótulo nem nota: para colar no teleprompter. */
export function roteiroSoFala(r: Roteiro): string {
  return [r.ganchoFalado, r.zonaDeTrava, ...r.blocos.map((b) => b.fala), r.fechamento]
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function roteiroEmTexto(r: Roteiro): string {
  return [
    `TEXTO NA TELA: ${r.textoNaTela.replace(/\n/g, " / ")}`,
    `GANCHO: ${r.ganchoFalado}`,
    `AÇÃO VISUAL: ${r.acaoVisual}`,
    `ZONA DE TRAVA: ${r.zonaDeTrava}`,
    ...r.blocos.map((b) => `${b.titulo.toUpperCase()} [tela: ${b.textoNaTela}${b.visual ? ` · visual: ${b.visual}` : ""}]: ${b.fala}`),
    `FECHAMENTO: ${r.fechamento}`,
    "",
    "LEGENDA:",
    r.legenda,
    ...(r.padroesUsados?.length ? ["", "PADRÕES DO ESTUDO APLICADOS:", ...r.padroesUsados.map((p) => `- ${p}`)] : []),
  ].join("\n");
}
