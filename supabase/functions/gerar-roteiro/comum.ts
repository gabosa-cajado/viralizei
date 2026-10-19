// Partes do roteiro que valem igual na Edge Function gerar-roteiro, na rota
// local (server/gerarRoteiro.ts) e na versão por regras (src/dados/roteiro.ts):
// o tamanho pela duração e o guia de escrita. Sem import, para os três
// ambientes (Deno, Node e navegador) lerem o mesmo arquivo.

// Os cinco criadores do estudo falam quase sem pausa (Kallaway 8% de
// silêncio, Robert e Benchimol abaixo de 15%, Tarik e Luka até 24% com
// respiros): em português isso dá perto de 3 palavras por segundo. A conta
// antiga (2,5) era ritmo de locução e deixava o texto curto para a duração.
export const PALAVRAS_POR_SEGUNDO = 3;

export interface Orcamento {
  duracao: number;
  total: number;
  minimo: number;
  maximo: number;
  gancho: [number, number];
  trava: [number, number];
  fechamento: [number, number];
  blocos: number;
  porBloco: [number, number];
}

const meio = (f: [number, number]) => (f[0] + f[1]) / 2;

/** Quantas palavras cabem em cada parte para a duração pedida. */
export function orcamento(duracaoSeg: number): Orcamento {
  const duracao = Math.max(15, Math.min(180, Math.round(duracaoSeg) || 60));
  const total = Math.round(duracao * PALAVRAS_POR_SEGUNDO);
  const gancho: [number, number] = [8, 14];
  const trava: [number, number] = duracao <= 30 ? [15, 25] : [25, 40];
  const fechamento: [number, number] = duracao <= 30 ? [12, 20] : [20, 32];
  const corpo = total - meio(gancho) - meio(trava) - meio(fechamento);
  const blocos = Math.max(2, Math.min(8, Math.round(corpo / 40)));
  const media = corpo / blocos;
  return {
    duracao,
    total,
    minimo: Math.round(total * 0.9),
    maximo: Math.round(total * 1.1),
    gancho,
    trava,
    fechamento,
    blocos,
    porBloco: [Math.round(media * 0.85), Math.round(media * 1.15)],
  };
}

export function contarPalavras(texto: string) {
  return texto.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

export interface FalaDoRoteiro {
  ganchoFalado: string;
  zonaDeTrava: string;
  blocos: { fala: string }[];
  fechamento: string;
}

/** Palavras que vão ser ditas: gancho, zona de trava, blocos e fechamento. */
export function palavrasFaladas(r: FalaDoRoteiro) {
  return contarPalavras([r.ganchoFalado, r.zonaDeTrava, ...r.blocos.map((b) => b.fala), r.fechamento].join(" "));
}

export function segundosPorPalavras(palavras: number) {
  return Math.round(palavras / PALAVRAS_POR_SEGUNDO);
}

/** Bloco do pedido que fixa o tamanho; a função confere a contagem depois. */
export function instrucaoTamanho(duracaoSeg: number) {
  const o = orcamento(duracaoSeg);
  const f = (x: [number, number]) => `${x[0]} a ${x[1]}`;
  return `TAMANHO (obrigatório): ${o.duracao} segundos de fala a ~${PALAVRAS_POR_SEGUNDO} palavras por segundo, o ritmo dos criadores do estudo = ${o.minimo} a ${o.maximo} palavras somando gancho falado, zona de trava, blocos e fechamento.
Distribuição: gancho falado ${f(o.gancho)} palavras; zona de trava ${f(o.trava)}; ${o.blocos} blocos de ${f(o.porBloco)} palavras cada; fechamento ${f(o.fechamento)}.
Frase curta não é roteiro curto: o tamanho vem de substância (o exemplo com nome, o número, o passo a passo, o erro comum, a objeção respondida), nunca de repetir a mesma ideia.`;
}

/** Como escrever: vale para criar e para melhorar. */
export const COMO_ESCREVER = `COMO MONTAR:
1. Gancho triplo alinhado: texto na tela (até 2 linhas, sem pontuação, sem "e/ou/mas", com nome próprio ou número quando houver), gancho falado (assunto + o que a pessoa ganha, os 4 S) e uma ação visual nos 2 primeiros segundos. A fala começa na primeira palavra, sem "oi gente".
2. Zona de trava: confirma a promessa do gancho e traz a prova concreta na tela (número, print, nome, caso).
3. Corpo no número de blocos pedido em TAMANHO, com o loop do vício: stakes nas 3 primeiras frases (quem, o que está em risco, até quando), uma pergunta específica cedo, uma virada com pista, e cada bloco termina abrindo o próximo. Double Aha: duas ideias não óbvias nos dois primeiros blocos. Cada bloco traz "visual": o que trocar na tela naquele trecho (print, gráfico, PiP, objeto).
4. Fechamento: a posição em uma frase + a chamada pedida (pergunta de uma palavra, palavra-chave para comentar, ou seguir com placar).
5. Legenda: primeira linha = gancho falado; depois a tese em 1 a 2 frases e a chamada. Sem hashtag, sem emoji.
6. padroesUsados: de 4 a 10 itens, cada um "Nome do padrão ou framework (criador): onde entrou no roteiro". O primeiro item é "Ritmo de <criador>: por que ele" (veja abaixo).
7. Avisos: o que faltou nos dados (sem prova, sem história) e o que você assumiu.
Use a história, a prova e a posição que o usuário deu; não invente números, casos nem nomes. Se faltar prova, deixe "[sua prova aqui]" e avise.

COMO ESCREVER BEM:
- Escolha um dos cinco criadores como modelo de estrutura e ritmo, pelo formato pedido: Lista, Tutorial na tela ou Comparativo = Kallaway (passos numerados, sem pausa, tom caindo no fim da frase); Conversa com convidado ou Walk-and-talk = Tarik Lopes (pergunta curta, o outro fala); Bastidores ou jornada = Luka Choi (resultado primeiro, "como eu fiz" em passos, conversa de amigo); opinião ou provocação = Robert McKeaveney (tese na primeira frase, um exemplo próprio, sem pausa); conselho ou máxima = Guilherme Benchimol (uma metáfora, uma regra, um exemplo, frases que terminam com certeza). Escreva no ritmo dele, sem copiar frase de ninguém.
- Escreva como se fala em português do Brasil: "você", "pra", "tá" quando soar natural; nada de palavra de redação ("ademais", "nesse sentido", "é importante ressaltar", "no mundo de hoje").
- Frases de 4 a 12 palavras, uma ideia por frase. Cada frase tem algo concreto: nome, número, objeto, lugar, ação. Frase que serviria para qualquer tema sai.
- Cada bloco faz um trabalho: traz um dado ou exemplo, diz o que isso muda para quem assiste e termina religando ("só que…", "e foi aí que…", "o problema é…", "que é exatamente por que…").
- A pergunta do loop dá contexto suficiente para a pessoa prever a resposta ("em 30 minutos ela me disse uma coisa que mudou meus próximos 6 meses"), nunca "você não vai acreditar".
- A virada contradiz o que a pessoa previu, com uma pista plantada antes, e fica lógica na hora.
- Uma metáfora ou um nome batizado para a ideia central, repetido no fechamento.
- Posição firme, sem "talvez", "depende" nem "na minha humilde opinião".`;
