import { FunctionsHttpError } from "@supabase/supabase-js";
import { noArtefato } from "./plataforma";
import { noSite, supabase } from "./site";

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
  avisos: string[];
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

function palavrasPorSegundo(seg: number) {
  return Math.round(seg * 2.5);
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

  const zonaDeTrava = prova
    ? `É o seguinte: ${prova.replace(/\.$/, "")}. Eu vou te mostrar isso em ${Math.round(duracao)} segundos, sem enrolação.`
    : `Eu já passei por isso ${nicho ? `trabalhando com ${nicho}` : ""} e vou te mostrar em ${Math.round(duracao)} segundos. [sua prova aqui: um número, um print, um nome]`;
  if (!prova) avisos.push("Sem prova. Coloque um número, print ou nome na zona de trava: é o que faz a pessoa ficar depois do gancho.");

  const blocos: BlocoRoteiro[] = [];
  blocos.push({
    titulo: "O que está em jogo",
    fala: publico
      ? `Se você é ${publico}, isso te custa todo mês. E o prazo é curto: quem não resolve agora, repete o erro no mês que vem.`
      : `Isso te custa todo mês. E o prazo é curto: quem não resolve agora, repete o erro no mês que vem.`,
    textoNaTela: "TODO MÊS",
  });
  blocos.push({
    titulo: "A pergunta",
    fala: historia
      ? `${maiusculaInicial(historia.replace(/\.$/, ""))}. Eu achava que o problema era um. Não era.`
      : `A maioria acha que o problema em ${tema} é o óbvio. Não é. [sua história aqui: o erro que você cometeu, com data]`,
    textoNaTela: "O PROBLEMA NÃO ERA ESSE",
  });
  if (!historia) avisos.push("Sem história. Um erro seu, com data, dá peso à virada e à lição.");
  blocos.push({
    titulo: "A virada",
    fala: `O que mudou foi uma coisa só: ${posicao ? posicao.replace(/\.$/, "") : `[a regra que você aplica em ${tema}]`}. Simples, e é por isso que ninguém faz.`,
    textoNaTela: posicao ? maiusculaInicial(posicao).slice(0, 40).toUpperCase() : "A ÚNICA MUDANÇA",
  });
  if (!posicao) avisos.push("Sem posição firme. Diga em uma frase o que você defende, sem meio-termo: é o que gera comentário.");

  const ctaFala = e.cta.startsWith("Palavra-chave")
    ? `Comenta ${(primeiraPalavra(tema) || "QUERO").toUpperCase()} que eu te mando o passo a passo.`
    : e.cta.startsWith("Seguir")
      ? `Segue aqui: estou documentando ${nicho || "isso"} do zero e o placar vai na legenda.`
      : e.cta.startsWith("Salvar")
        ? `Salva este vídeo para a próxima vez que ${tema} aparecer.`
        : `Me conta em uma palavra: você está do lado de quem faz ou de quem espera?`;
  const fechamento = `${posicao ? maiusculaInicial(posicao.replace(/\.$/, "")) + "." : `Em ${tema}, o difícil não é saber, é fazer.`} ${ctaFala}`;

  const legenda = `${ganchoFalado}\n${posicao ? maiusculaInicial(posicao.replace(/\.$/, "")) + "." : `Quem entende ${tema} para de perder ${primeiraPalavra(resultado) || "tempo"}.`}\n${ctaFala}`;

  const palavras = [ganchoFalado, zonaDeTrava, ...blocos.map((b) => b.fala), fechamento].join(" ").split(/\s+/).length;
  const duracaoEstimadaSeg = Math.round(palavras / 2.5);
  if (duracaoEstimadaSeg > duracao + 15) avisos.push(`O texto dá uns ${duracaoEstimadaSeg} s para uma meta de ${duracao} s: corte um bloco ou encurte as falas.`);
  if (duracaoEstimadaSeg < duracao - 20) avisos.push(`O texto dá uns ${duracaoEstimadaSeg} s para uma meta de ${duracao} s (${palavrasPorSegundo(duracao)} palavras): há espaço para um exemplo a mais.`);

  return { textoNaTela, ganchoFalado, acaoVisual, zonaDeTrava, blocos, fechamento, legenda, duracaoEstimadaSeg, avisos };
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

export function roteiroEmTexto(r: Roteiro): string {
  return [
    `TEXTO NA TELA: ${r.textoNaTela.replace(/\n/g, " / ")}`,
    `GANCHO: ${r.ganchoFalado}`,
    `AÇÃO VISUAL: ${r.acaoVisual}`,
    `ZONA DE TRAVA: ${r.zonaDeTrava}`,
    ...r.blocos.map((b) => `${b.titulo.toUpperCase()} [tela: ${b.textoNaTela}]: ${b.fala}`),
    `FECHAMENTO: ${r.fechamento}`,
    "",
    "LEGENDA:",
    r.legenda,
  ].join("\n");
}
