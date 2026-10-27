// Partes do roteiro que valem igual na Edge Function gerar-roteiro, na rota
// local (server/gerarRoteiro.ts) e na versão por regras (src/dados/roteiro.ts):
// o tamanho pela duração e o guia de escrita. Sem import, para os três
// ambientes (Deno, Node e navegador) lerem o mesmo arquivo.

// Os cinco criadores do estudo falam quase sem pausa (Kallaway 8% de
// silêncio, Robert e Benchimol abaixo de 15%, Tarik e Luka até 24% com
// respiros): em português isso dá 3 a 4 palavras por segundo. A conta
// antiga (2,5) era ritmo de locução; com 3 o autor ainda achou o texto curto
// em todas as durações (27/10/2026), por isso 3,5.
export const PALAVRAS_POR_SEGUNDO = 3.5;

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
    minimo: Math.round(total * 0.95),
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

export interface Loop {
  frase: string;
  /** Segundo em que a frase começa, no ritmo de PALAVRAS_POR_SEGUNDO; null se a frase não foi achada na fala. */
  segundo: number | null;
}

export interface Loops {
  gancho: Loop;
  reforco: Loop;
  meio: Loop;
}

function normalizar(t: string) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/** Acha cada frase de loop na fala e diz em que segundo ela começa. */
export function localizarLoops(r: FalaDoRoteiro, frases: { gancho: string; reforco: string; meio: string }): Loops {
  const fala = normalizar([r.ganchoFalado, r.zonaDeTrava, ...r.blocos.map((b) => b.fala), r.fechamento].join(" "));
  const achar = (frase: string): Loop => {
    const p = normalizar(frase);
    // As 4 primeiras palavras da frase bastam para achar o lugar; com menos, usa o que tiver.
    const alvo = p.slice(0, Math.min(4, p.length));
    if (!alvo.length) return { frase, segundo: null };
    for (let i = 0; i + alvo.length <= fala.length; i++) {
      if (alvo.every((w, k) => fala[i + k] === w)) return { frase, segundo: Math.round(i / PALAVRAS_POR_SEGUNDO) };
    }
    return { frase, segundo: null };
  };
  return { gancho: { frase: frases.gancho, segundo: 0 }, reforco: achar(frases.reforco), meio: achar(frases.meio) };
}

/** Avisos quando os loops caem fora das janelas do Triple Loop. */
export function conferirLoops(l: Loops, duracaoSeg: number): string[] {
  const avisos: string[] = [];
  if (l.reforco.segundo == null) avisos.push("Não achei a frase do loop de reforço na fala: confira se ela está entre 5 e 15 s.");
  else if (l.reforco.segundo > 18) avisos.push(`O loop de reforço cai em ${l.reforco.segundo} s; o ideal é entre 5 e 15 s, antes de o gancho esfriar.`);
  if (l.meio.segundo == null) avisos.push("Não achei a frase do loop de religar na fala: confira se há uma curiosidade nova perto da metade.");
  else {
    const fracao = l.meio.segundo / Math.max(1, duracaoSeg);
    if (fracao < 0.3 || fracao > 0.7) avisos.push(`O loop de religar cai em ${l.meio.segundo} s de ${duracaoSeg}; o ideal é perto da metade (entre ${Math.round(duracaoSeg * 0.4)} e ${Math.round(duracaoSeg * 0.6)} s).`);
  }
  return avisos;
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
4. Três loops (Kallaway): três curiosidades abertas, escritas de propósito. O loop do gancho abre a pergunta do vídeo nos 5 primeiros segundos. O loop de reforço, entre 5 e 15 s (na zona de trava ou no começo do primeiro bloco), aumenta a aposta em vez de começar a responder ("e o pior nem é isso", "só que tem um detalhe"). O loop de religar cai entre 40% e 60% do vídeo, quando o interesse do começo acaba: abre uma pergunta nova ou promete algo que só vem no fim. Em "loops", copie a frase exata de cada um, como está na fala.
5. Fechamento: a posição em uma frase + a chamada pedida (pergunta de uma palavra, palavra-chave para comentar, ou seguir com placar).
6. Legenda: primeira linha = gancho falado; depois a tese em 1 a 2 frases e a chamada. Sem hashtag, sem emoji.
7. padroesUsados: de 4 a 10 itens, cada um "Nome do padrão ou framework (criador): onde entrou no roteiro". O primeiro item é "Ritmo de <criador>: por que ele" (veja abaixo).
8. Avisos: o que faltou nos dados (sem prova, sem história) e o que você assumiu.
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

// ---------- Fórmula de conteúdo: tipo de gancho × formato × layout ----------
// Mesmas listas no site (Ganchos virais, Plano, Recomendações) e nas funções
// (gerar-roteiro classifica o plano; recomendacoes-do-dia classifica os seus
// posts). scripts/regras-referencias.mjs copia este arquivo para as funções.

export interface Opcao {
  id: string;
  nome: string;
  explicacao: string;
}

export const TIPOS_GANCHO: Opcao[] = [
  { id: "erro", nome: "Erro e alerta", explicacao: "Aponta o erro que a pessoa comete ou um perigo: \"pare de ___\", \"você está fazendo ___ errado\"." },
  { id: "lista", nome: "Lista", explicacao: "Promete um número de itens: \"três sinais de que ___\"." },
  { id: "experiencia", nome: "Experiência própria", explicacao: "Autoridade de quem já viveu: \"se eu começasse hoje ___\", \"o que eu queria ter sabido\"." },
  { id: "segredo", nome: "Verdade escondida", explicacao: "Revela o que não contam ou dá nome a um fenômeno: \"a verdade sobre ___ que ninguém fala\"." },
  { id: "comofazer", nome: "Como fazer", explicacao: "Promete o passo a passo ou a explicação rápida: \"te explico ___ em um minuto\"." },
  { id: "contraste", nome: "Contraste", explicacao: "Põe duas coisas lado a lado: A ou B, antes e depois, mito ou verdade, quem faz e quem não faz." },
  { id: "resultado", nome: "Teste e resultado", explicacao: "Mostra o que aconteceu num teste: \"testei ___ por 30 dias\", \"olha o resultado\"." },
  { id: "numero", nome: "Número e custo", explicacao: "Abre com dinheiro, custo ou quantidade: \"quanto custa de verdade ___\"." },
  { id: "pergunta", nome: "Pergunta", explicacao: "Abre com uma pergunta que o público faz ou que desafia quem assiste." },
  { id: "identificacao", nome: "Identificação", explicacao: "Chama um público específico: \"se você ___, este vídeo é pra você\"." },
  { id: "historia", nome: "História e bastidor", explicacao: "Começa no meio de uma história, um dia, uma conversa ou um POV." },
  { id: "oferta", nome: "Palavra-chave", explicacao: "Abre oferecendo um material em troca de comentário." },
];

export const FORMATOS_HISTORIA: (Opcao & { facil: boolean })[] = [
  { id: "lista", nome: "Lista", facil: true, explicacao: "N itens numerados." },
  { id: "ranking", nome: "Ranking", facil: true, explicacao: "Ordena opções do pior ao melhor (tier list)." },
  { id: "tutorial", nome: "Tutorial", facil: true, explicacao: "Passo a passo para fazer uma coisa." },
  { id: "comparativo", nome: "Comparativo", facil: true, explicacao: "A contra B, com veredito." },
  { id: "erro", nome: "Erro comum ou mito", facil: true, explicacao: "O erro que quase todo mundo comete e o certo." },
  { id: "opiniao", nome: "Opinião forte", facil: true, explicacao: "Uma tese defendida sem meio-termo." },
  { id: "caso", nome: "Estudo de caso", facil: false, explicacao: "Como alguém (ou uma empresa) chegou a um resultado, em 3 pontos." },
  { id: "cenario", nome: "Cenário", facil: false, explicacao: "\"E se…\" ou \"se eu começasse hoje\": uma situação hipotética resolvida." },
  { id: "historia", nome: "História pessoal", facil: false, explicacao: "Um episódio seu com virada e lição." },
  { id: "bastidores", nome: "Bastidores e jornada", facil: false, explicacao: "Um dia, um projeto, o placar da meta." },
  { id: "conversa", nome: "Conversa ou entrevista", facil: false, explicacao: "Pergunta curta para alguém maior responder." },
  { id: "noticia", nome: "Notícia com ângulo", facil: false, explicacao: "Um fato do dia e por que mexe com quem assiste." },
  { id: "reacao", nome: "Reação ou remix", facil: false, explicacao: "Comentar ou refazer o vídeo de outra pessoa." },
];

export const LAYOUTS: Opcao[] = [
  { id: "camera", nome: "Fala para a câmera", explicacao: "Rosto em busto o vídeo todo, texto na tela." },
  { id: "dividida", nome: "Rosto e tela", explicacao: "Rosto embaixo ou em PiP e print, gráfico ou gravação de tela em cima." },
  { id: "tela", nome: "Gravação de tela", explicacao: "A tela é o vídeo; a voz narra." },
  { id: "texto", nome: "Só texto ou cartelas", explicacao: "Sem rosto: texto, cartelas ou carrossel." },
  { id: "conversa", nome: "Duas pessoas", explicacao: "Entrevista, conversa ou walk-and-talk." },
  { id: "acao", nome: "Ação ou demonstração", explicacao: "Mostra fazendo: treino, produto, rotina." },
  { id: "narrado", nome: "Narração sobre imagens", explicacao: "Voz por cima de cenas e cortes." },
];

const nomeDe = (lista: Opcao[], id: string | null | undefined) => lista.find((o) => o.id === id)?.nome ?? (id || "?");
export const nomeTipoGancho = (id: string | null | undefined) => nomeDe(TIPOS_GANCHO, id);
export const nomeFormato = (id: string | null | undefined) => nomeDe(FORMATOS_HISTORIA, id);
export const nomeLayout = (id: string | null | undefined) => nomeDe(LAYOUTS, id);

// Os 46 modelos do calendário, classificados um a um (19/10/2026). Modelo
// novo ou editado cai nas palavras-chave de tipoDoModelo.
const TIPO_DOS_MODELOS: Record<string, string> = {
  "o erro que eu repeti por ___ anos": "erro",
  "ninguém te avisa que ___ quando você começa em ___": "segredo",
  "três sinais de que você ___": "lista",
  "antes de ___, faça isto": "comofazer",
  "o que muda quando você para de ___": "resultado",
  "pare de ___. faça isto no lugar": "erro",
  "você está fazendo ___ errado, e não é culpa sua": "erro",
  "se eu começasse em ___ hoje, faria só isto": "experiencia",
  "um dia comigo sendo ___": "historia",
  "isso aqui custa ___ e quase ninguém sabe": "numero",
  "eu testei ___ por 30 dias. olha o que aconteceu": "resultado",
  "a pergunta que eu mais ouço sobre ___": "pergunta",
  "___ ou ___: qual vale mais a pena?": "contraste",
  "o jeito certo e o jeito que todo mundo faz: ___": "contraste",
  "três coisas que eu nunca faria sendo ___": "lista",
  "quanto custa de verdade ___": "numero",
  "pov: você é ___ e o cliente pede ___": "historia",
  "mito ou verdade: ___": "contraste",
  "o detalhe que entrega quem é iniciante em ___": "erro",
  "te explico ___ em um minuto": "comofazer",
  "o conselho que eu daria para mim no primeiro dia de ___": "experiencia",
  "não compre ___ antes de ver isto": "erro",
  "o que eu queria ter sabido antes de ___": "experiencia",
  "esse hábito está atrasando o seu ___": "erro",
  "por que ___ não funciona para você": "erro",
  "o passo a passo que eu uso para ___": "comofazer",
  "reagindo a ___ dos meus seguidores": "historia",
  "o que dá para fazer com ___ reais": "numero",
  "ninguém acredita quando eu digo que ___": "segredo",
  "a frase que todo ___ já ouviu": "identificacao",
  "três ferramentas que eu uso todo dia para ___": "lista",
  "o antes e depois de ___": "contraste",
  "se você ___, este vídeo é para você": "identificacao",
  "a verdade sobre ___ que ninguém fala": "segredo",
  "o que acontece com ___ quando você ___": "resultado",
  "responda rápido: ___": "pergunta",
  "entrevistando o meu eu de ___ atrás": "historia",
  "dia ___ construindo ___ do zero": "historia",
  "tem gente que ___. e tem gente que ___": "contraste",
  "perguntei para ___: se você tivesse ___ hoje, o que faria?": "pergunta",
  "esse vídeo foi ___ por ___. olha o resultado": "resultado",
  "um vídeo meu fez ___ e o outro fez ___. a diferença foi ___": "contraste",
  "isso se chama ___, e é por isso que ___": "segredo",
  "comenta ___ que eu te mando ___": "oferta",
  "peguei o roteiro que fez ___ views e gravei do meu jeito": "resultado",
  "___ me disse uma coisa que mudou ___": "historia",
};

const PALAVRAS_DO_TIPO: [string, RegExp][] = [
  ["oferta", /\bcomenta\b/i],
  ["lista", /^(dois|duas|tr[êe]s|quatro|cinco|seis|sete|\d+)\s/i],
  ["numero", /\b(custa|reais|R\$|pre[çc]o|dinheiro)\b/i],
  ["contraste", /\b(ou|antes e depois|mito|versus|vs\.?)\b/i],
  ["erro", /\b(erro|errado|pare de|n[ãa]o (compre|fa[çc]a)|atrasando)\b/i],
  ["experiencia", /\b(se eu|queria ter sabido|conselho)\b/i],
  ["segredo", /\b(ningu[ée]m|verdade|segredo|escondem)\b/i],
  ["resultado", /\b(testei|resultado|aconteceu)\b/i],
  ["comofazer", /\b(passo a passo|como|explico|fa[çc]a isto)\b/i],
  ["identificacao", /\b(se voc[êe]|todo \w+ j[áa])\b/i],
  ["historia", /\b(dia|pov|perguntei|me disse|comigo)\b/i],
  ["pergunta", /\?\s*$/],
];

/** Tipo de um modelo de gancho: o classificado, ou pelas palavras-chave. */
export function tipoDoModelo(modelo: string): string {
  const chave = modelo.trim().toLowerCase().replace(/\s+/g, " ");
  if (TIPO_DOS_MODELOS[chave]) return TIPO_DOS_MODELOS[chave];
  for (const [tipo, re] of PALAVRAS_DO_TIPO) if (re.test(modelo)) return tipo;
  return "historia";
}

// ---------- Persona do canal ----------
// Uma linha só no banco (public.persona). Toda IA do Viralizei recebe este
// bloco no pedido; ele vale acima da descrição genérica do nicho no sistema.

export interface Persona {
  nicho: string;
  publico: string;
  tom: string;
  objetivo: string;
  diferencial: string;
  evitar: string;
}

export const CAMPOS_PERSONA: { chave: keyof Persona; rotulo: string; ajuda: string }[] = [
  { chave: "nicho", rotulo: "Nicho", ajuda: "Do que o canal fala. Ex.: dinheiro, negócios e IA para quem tem de 18 a 30 anos" },
  { chave: "publico", rotulo: "Para quem", ajuda: "Quem assiste e o que essa pessoa quer. Ex.: jovem CLT que quer a primeira renda extra" },
  { chave: "tom", rotulo: "Tom de voz", ajuda: "Como falamos. Ex.: direto, com número na tela, sem guru e sem palavrão" },
  { chave: "objetivo", rotulo: "Objetivo do canal", ajuda: "O que cada vídeo precisa trazer. Ex.: seguidores no Instagram e lista de espera do curso" },
  { chave: "diferencial", rotulo: "Por que nós", ajuda: "O que só a gente tem. Ex.: bastidores reais de quem está construindo do zero" },
  { chave: "evitar", rotulo: "O que evitar", ajuda: "Temas e jeitos de falar que ficam de fora" },
];

export const PERSONA_VAZIA: Persona = { nicho: "", publico: "", tom: "", objetivo: "", diferencial: "", evitar: "" };

/** Bloco que vai no pedido de toda IA; vazio quando nada foi preenchido. */
export function personaEmTexto(p: Partial<Persona> | null | undefined): string {
  if (!p) return "";
  const linhas = CAMPOS_PERSONA.filter((c) => (p[c.chave] ?? "").trim()).map((c) => `${c.rotulo}: ${(p[c.chave] ?? "").trim()}`);
  if (!linhas.length) return "";
  return `PERSONA DO CANAL (manda sobre nicho, público e tom; respeite o que evitar):\n${linhas.join("\n")}`;
}

// ---------- Nota de outlier ----------
// Como no Sandcastles: views ÷ mediana de views do próprio canal. A partir de
// 1x o vídeo rendeu acima do normal do canal; 1,2x já é sinal; 2x é fora da curva.

export function faixaOutlier(n: number | null | undefined): "fora" | "bom" | "normal" | "abaixo" | null {
  if (n == null) return null;
  if (n >= 2) return "fora";
  if (n >= 1.2) return "bom";
  if (n >= 0.8) return "normal";
  return "abaixo";
}

export function outlierLegivel(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 10 ? 0 : 1 })}x`;
}
