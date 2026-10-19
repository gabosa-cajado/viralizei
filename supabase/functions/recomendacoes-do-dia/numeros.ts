// Contas das recomendações do dia: tudo determinístico, sem rede nem IA.
// A IA recebe estes números prontos e só interpreta; a página mostra os
// mesmos números, então o que ela diz sempre bate com o que está na tela.

export interface Pub {
  id: string;
  rede: "instagram" | "tiktok";
  tipo: "reel" | "carrossel" | "post" | "video";
  publicado_em: string;
  legenda: string;
  url: string | null;
  views: number | null;
  alcance: number | null;
  curtidas: number | null;
  comentarios: number | null;
  salvos: number | null;
  compartilhamentos: number | null;
  seguidores: number | null;
  tempo_medio_seg: number | null;
  duracao_seg: number | null;
  duracao_origem: string | null;
  taxa_3s: number | null;
  retencao: number | null;
  engajamento: number | null;
  tema: string | null;
}

export interface DiaConta {
  rede: string;
  data: string;
  seguidores: number | null;
  ganhos: number | null;
  perdidos: number | null;
  alcance: number | null;
  views: number | null;
  contas_engajadas: number | null;
}

export interface LinhaPublico {
  rede: string;
  tipo: "idade_genero" | "pais" | "cidade";
  chave: string;
  valor: number;
}

export interface Horario {
  rede: string;
  dia_semana: number;
  hora: number;
  valor: number;
}

export const TEMAS = [
  "IA e ferramentas",
  "Negócios e empreendedorismo",
  "Psicologia e comportamento",
  "Motivação e disciplina",
  "Bastidores e jornada",
  "Design e criação",
  "Investimentos e dinheiro",
] as const;

export interface Resumo {
  n: number;
  medianaViews: number | null;
  mediaTaxa3s: number | null;
  mediaTempoMedio: number | null;
  mediaRetencao: number | null;
  salvosPorMil: number | null;
  compartPorMil: number | null;
  comentariosPorMil: number | null;
}

export interface Item {
  id: string;
  url: string | null;
  titulo: string;
  rede: string;
  tipo: string;
  data: string;
  views: number | null;
  taxa3s: number | null;
  tempoMedio: number | null;
  retencao: number | null;
  salvos: number | null;
  compartilhamentos: number | null;
  tema: string | null;
}

export interface Numeros {
  dadosAte: string | null;
  seguidores: { atual: number; inicio: number; desde: string; ganhosNoPeriodo: number } | null;
  reels: Resumo;
  carrosseis: Resumo;
  tiktok: Resumo;
  reelsUltimos14: Resumo;
  reels14Anteriores: Resumo;
  topReels: Item[];
  ganchosFracos: Item[];
  chamada: { comComenta: Resumo; semComenta: Resumo };
  repetidos: { titulo: string; versoes: { url: string | null; views: number | null; taxa3s: number | null; data: string }[] }[];
  melhoresHorarios: { dia: string; hora: number; valor: number }[];
  horasPostadas: { faixa: string; n: number; medianaViews: number | null }[];
  duracao: { faixa: string; n: number; medianaViews: number | null; mediaTaxa3s: number | null }[];
  publico: {
    total: number;
    faixas: { faixa: string; pct: number }[];
    genero: { masculino: number; feminino: number; naoInformado: number };
    paises: { chave: string; pct: number }[];
    cidades: { chave: string; pct: number }[];
  } | null;
  temas: { tema: string; n: number; medianaViews: number | null; mediaTaxa3s: number | null; salvosPorMil: number | null }[];
}

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

function media(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

function porMil(parte: (number | null)[], views: (number | null)[]): number | null {
  let p = 0;
  let v = 0;
  parte.forEach((x, i) => {
    if (typeof x === "number" && typeof views[i] === "number") {
      p += x;
      v += views[i]!;
    }
  });
  return v > 0 ? Math.round((p / v) * 10000) / 10 : null;
}

export function resumir(pubs: Pub[]): Resumo {
  const views = pubs.map((p) => p.views);
  return {
    n: pubs.length,
    medianaViews: mediana(views.filter((x): x is number => typeof x === "number")),
    mediaTaxa3s: media(pubs.map((p) => p.taxa_3s)),
    mediaTempoMedio: media(pubs.map((p) => p.tempo_medio_seg)),
    mediaRetencao: media(pubs.map((p) => p.retencao)),
    salvosPorMil: porMil(pubs.map((p) => p.salvos), views),
    compartPorMil: porMil(pubs.map((p) => p.compartilhamentos), views),
    comentariosPorMil: porMil(pubs.map((p) => p.comentarios), views),
  };
}

export function primeiraLinha(legenda: string) {
  const linha = (legenda.split("\n").find((l) => l.trim()) ?? "").replace(/#\S+/g, "").trim();
  return linha.length > 90 ? linha.slice(0, 87).replace(/\s+\S*$/, "") + "…" : linha;
}

function item(p: Pub): Item {
  return {
    id: p.id,
    url: p.url,
    titulo: primeiraLinha(p.legenda) || "(sem legenda)",
    rede: p.rede,
    tipo: p.tipo,
    data: p.publicado_em.slice(0, 10),
    views: p.views,
    taxa3s: p.taxa_3s,
    tempoMedio: p.tempo_medio_seg,
    retencao: p.retencao,
    salvos: p.salvos,
    compartilhamentos: p.compartilhamentos,
    tema: p.tema,
  };
}

/** Hora de Brasília da publicação (os horários vêm em UTC do banco). */
function horaBrasilia(iso: string) {
  return (new Date(iso).getUTCHours() + 24 - 3) % 24;
}

const PALAVRAS_TEMA: [string, RegExp][] = [
  ["IA e ferramentas", /\b(ia|ai|claude|chatgpt|gpt|skill|skills|chatbot|eliza|intelig[eê]ncia artificial|definecompact|prompt)\b/i],
  ["Design e criação", /\b(design|estilos?|brutalismo|pinterest|marca|interface)\b/i],
  ["Investimentos e dinheiro", /\b(invest\w*|bolsa|dinheiro|a[cç][oõ]es|investopedia)\b/i],
  ["Psicologia e comportamento", /\b(psicolog\w*|efeito|estudo|cornell|ariely|geleias?|comportamento|holofote|chamariz)\b/i],
  ["Bastidores e jornada", /\b(primeiro v[ií]deo|pre college|pr[eé] college|link school|minha experi[eê]ncia|comunidade|gera[cç][aã]o fora)\b/i],
  ["Motivação e disciplina", /\b(motiva\w*|garra|gym|academia|cr[ií]ticas?|timidez|imprevis[ií]vel|disciplina|mentalidade)\b/i],
  ["Negócios e empreendedorismo", /\b(empreend\w*|neg[oó]cios?|pitch|ceo|ceos|startup|valid\w*|empresa|nintendo|samsung|ideia)\b/i],
];

/** Sem IA: tema pela primeira palavra-chave que bater na legenda. */
export function temaPorPalavras(legenda: string): string {
  const texto = legenda.replace(/#(\S+)/g, " $1 ");
  for (const [tema, re] of PALAVRAS_TEMA) if (re.test(texto)) return tema;
  return "Negócios e empreendedorismo";
}

export function calcular(pubs: Pub[], conta: DiaConta[], publico: LinhaPublico[], horarios: Horario[], hoje = new Date()): Numeros {
  const ig = pubs.filter((p) => p.rede === "instagram");
  const reels = ig.filter((p) => p.tipo === "reel");
  const carrosseis = ig.filter((p) => p.tipo === "carrossel" || p.tipo === "post");
  const tiktok = pubs.filter((p) => p.rede === "tiktok");
  const dia = 86_400_000;
  const t = hoje.getTime();
  const idade = (p: Pub) => t - new Date(p.publicado_em).getTime();

  // Seguidores: primeiro e último dia com número.
  const comSeguidores = conta
    .filter((c) => c.rede === "instagram" && typeof c.seguidores === "number")
    .sort((a, b) => a.data.localeCompare(b.data));
  const seguidores = comSeguidores.length
    ? {
        atual: comSeguidores[comSeguidores.length - 1].seguidores!,
        inicio: comSeguidores[0].seguidores!,
        desde: comSeguidores[0].data,
        ganhosNoPeriodo: comSeguidores[comSeguidores.length - 1].seguidores! - comSeguidores[0].seguidores!,
      }
    : null;

  // Mesmo vídeo postado mais de uma vez (mesma primeira linha da legenda).
  const grupos = new Map<string, Pub[]>();
  for (const p of reels) {
    const k = primeiraLinha(p.legenda).toLowerCase();
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const repetidos = [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      titulo: primeiraLinha(g[0].legenda),
      versoes: g
        .sort((a, b) => a.publicado_em.localeCompare(b.publicado_em))
        .map((p) => ({ url: p.url, views: p.views, taxa3s: p.taxa_3s, data: p.publicado_em.slice(0, 16).replace("T", " ") })),
    }));

  const melhoresHorarios = horarios
    .filter((h) => h.rede === "instagram")
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 4)
    .map((h) => ({ dia: DIAS[h.dia_semana] ?? String(h.dia_semana), hora: h.hora, valor: h.valor }));

  const faixasHora: [string, (h: number) => boolean][] = [
    ["manhã (6h–12h)", (h) => h >= 6 && h < 12],
    ["tarde (12h–18h)", (h) => h >= 12 && h < 18],
    ["noite (18h–24h)", (h) => h >= 18],
    ["madrugada (0h–6h)", (h) => h < 6],
  ];
  const horasPostadas = faixasHora
    .map(([faixa, f]) => {
      const g = reels.filter((p) => f(horaBrasilia(p.publicado_em)));
      return { faixa, n: g.length, medianaViews: mediana(g.map((p) => p.views ?? 0)) };
    })
    .filter((x) => x.n > 0);

  const faixasDuracao: [string, (d: number) => boolean][] = [
    ["até 50 s", (d) => d <= 50],
    ["51 a 80 s", (d) => d > 50 && d <= 80],
    ["mais de 80 s", (d) => d > 80],
  ];
  const comDuracao = reels.filter((p) => typeof p.duracao_seg === "number");
  const duracao = faixasDuracao
    .map(([faixa, f]) => {
      const g = comDuracao.filter((p) => f(p.duracao_seg!));
      return { faixa, n: g.length, medianaViews: mediana(g.map((p) => p.views ?? 0)), mediaTaxa3s: media(g.map((p) => p.taxa_3s)) };
    })
    .filter((x) => x.n > 0);

  // Público
  const ig_publico = publico.filter((l) => l.rede === "instagram");
  const idades = ig_publico.filter((l) => l.tipo === "idade_genero");
  const total = idades.reduce((a, l) => a + l.valor, 0);
  const porFaixa = new Map<string, number>();
  const porGenero = { M: 0, F: 0, U: 0 } as Record<string, number>;
  for (const l of idades) {
    const [faixa, g] = l.chave.split(" ");
    porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + l.valor);
    porGenero[g] = (porGenero[g] ?? 0) + l.valor;
  }
  const pct = (x: number) => (total ? Math.round((x / total) * 1000) / 10 : 0);
  const publicoResumo = total
    ? {
        total,
        faixas: [...porFaixa.entries()].sort((a, b) => b[1] - a[1]).map(([faixa, v]) => ({ faixa, pct: pct(v) })),
        genero: { masculino: pct(porGenero.M), feminino: pct(porGenero.F), naoInformado: pct(porGenero.U) },
        paises: ig_publico.filter((l) => l.tipo === "pais").sort((a, b) => b.valor - a.valor).slice(0, 4).map((l) => ({ chave: l.chave, pct: l.valor })),
        cidades: ig_publico.filter((l) => l.tipo === "cidade").sort((a, b) => b.valor - a.valor).slice(0, 5).map((l) => ({ chave: l.chave, pct: l.valor })),
      }
    : null;

  // Temas: reels e carrosséis do Instagram (onde há métrica completa).
  const porTema = new Map<string, Pub[]>();
  for (const p of ig) {
    const tema = p.tema || temaPorPalavras(p.legenda);
    porTema.set(tema, [...(porTema.get(tema) ?? []), p]);
  }
  const temas = [...porTema.entries()]
    .map(([tema, g]) => {
      // Com Reels no tema, a conta usa só os Reels (carrossel tem outra escala de views).
      const r = resumir(g.filter((p) => p.tipo === "reel").length ? g.filter((p) => p.tipo === "reel") : g);
      return { tema, n: r.n, medianaViews: r.medianaViews, mediaTaxa3s: r.mediaTaxa3s, salvosPorMil: r.salvosPorMil };
    })
    .sort((a, b) => (b.medianaViews ?? 0) - (a.medianaViews ?? 0));

  const comenta = (p: Pub) => /\bcomenta\b/i.test(p.legenda);
  const datas = pubs.map((p) => p.publicado_em).sort();

  return {
    dadosAte: datas.length ? datas[datas.length - 1] : null,
    seguidores,
    reels: resumir(reels),
    carrosseis: resumir(carrosseis),
    tiktok: resumir(tiktok),
    reelsUltimos14: resumir(reels.filter((p) => idade(p) <= 14 * dia)),
    reels14Anteriores: resumir(reels.filter((p) => idade(p) > 14 * dia && idade(p) <= 28 * dia)),
    topReels: [...reels].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5).map(item),
    ganchosFracos: reels
      .filter((p) => typeof p.taxa_3s === "number" && (p.views ?? 0) >= 500)
      .sort((a, b) => a.taxa_3s! - b.taxa_3s!)
      .slice(0, 4)
      .map(item),
    chamada: { comComenta: resumir(reels.filter(comenta)), semComenta: resumir(reels.filter((p) => !comenta(p))) },
    repetidos,
    melhoresHorarios,
    horasPostadas,
    duracao,
    publico: publicoResumo,
    temas,
  };
}

// ---------- Sem IA: recomendações por regras ----------

export interface Recomendacao {
  titulo: string;
  area: "gancho" | "retencao" | "tema" | "formato" | "chamada" | "horario" | "frequencia" | "publico";
  prioridade: "alta" | "media" | "baixa";
  porque: string;
  acao: string;
  diaCalendario: number | null;
}

export interface Saida {
  manchete: string;
  diagnostico: string;
  destaques: { titulo: string; evidencia: string; leitura: string }[];
  recomendacoes: Recomendacao[];
  gravarHoje: { tema: string; ganchoTela: string; ganchoFalado: string; formato: string; chamada: string; porque: string; diaCalendario: number | null };
  postar: { quando: string; porque: string };
  parar: string[];
  publico: string;
}

const fmt = (n: number | null | undefined) => (n == null ? "?" : n.toLocaleString("pt-BR"));

export function porRegras(n: Numeros, dias: { numero: number; gancho: string }[], hoje = new Date()): Saida {
  const recs: Recomendacao[] = [];
  const topTema = n.temas[0];
  const hora = n.melhoresHorarios[0];

  if ((n.reels.mediaTaxa3s ?? 100) < 50 && n.ganchosFracos.length) {
    const pior = n.ganchosFracos[0];
    recs.push({
      titulo: "Os primeiros 3 segundos estão perdendo gente",
      area: "gancho",
      prioridade: "alta",
      porque: `Em média, ${fmt(n.reels.mediaTaxa3s)}% de quem vê um Reel passa dos 3 s. "${pior.titulo}" ficou em ${fmt(pior.taxa3s)}%.`,
      acao: "Comece falando na primeira palavra, com texto na tela que diga o assunto e o ganho (gancho triplo). Nada de apresentação.",
      diaCalendario: null,
    });
  }
  if (n.chamada.comComenta.n >= 2 && (n.chamada.comComenta.salvosPorMil ?? 0) > (n.chamada.semComenta.salvosPorMil ?? 0)) {
    recs.push({
      titulo: "\"Comenta PALAVRA\" funciona: use em todo vídeo útil",
      area: "chamada",
      prioridade: "alta",
      porque: `Reels com "comenta" têm ${fmt(n.chamada.comComenta.salvosPorMil)} salvos por mil views; os outros, ${fmt(n.chamada.semComenta.salvosPorMil)}.`,
      acao: "Feche com uma palavra-chave para comentar e entregue o material na DM.",
      diaCalendario: null,
    });
  }
  if (n.carrosseis.n >= 3 && (n.carrosseis.medianaViews ?? 0) < (n.reels.medianaViews ?? 0) / 2) {
    recs.push({
      titulo: "Carrossel rende menos da metade do Reel",
      area: "formato",
      prioridade: "media",
      porque: `Mediana de ${fmt(n.carrosseis.medianaViews)} views no carrossel contra ${fmt(n.reels.medianaViews)} no Reel.`,
      acao: "Transforme o melhor carrossel da semana num Reel de fala com o mesmo dado na tela.",
      diaCalendario: null,
    });
  }
  if (n.repetidos.length) {
    recs.push({
      titulo: "Não poste o mesmo vídeo duas vezes",
      area: "frequencia",
      prioridade: "media",
      porque: `${n.repetidos.length} vídeos saíram duas vezes; a segunda versão disputa o mesmo público com a primeira.`,
      acao: "Se quiser testar, mude o gancho e use Reel de teste (Trial Reels) em vez de repostar.",
      diaCalendario: null,
    });
  }
  if (hora) {
    recs.push({
      titulo: `Poste ${hora.dia} às ${hora.hora}h`,
      area: "horario",
      prioridade: "baixa",
      porque: `É o horário com mais seguidores online segundo o Metricool (${fmt(hora.valor)}).`,
      acao: "Agende o próximo Reel para esse horário e compare com a mediana.",
      diaCalendario: null,
    });
  }
  const diaDoAno = Math.floor(hoje.getTime() / 86_400_000);
  const dia = dias.length ? dias[diaDoAno % dias.length] : undefined;
  return {
    manchete: topTema ? `${topTema.tema} é o que mais rende agora` : "Recomendações a partir das suas métricas",
    diagnostico: `Mediana de ${fmt(n.reels.medianaViews)} views por Reel e ${fmt(n.reels.mediaTaxa3s)}% passando dos 3 s. Versão por regras: sem IA nesta rodada.`,
    destaques: n.topReels.slice(0, 3).map((r) => ({
      titulo: r.titulo,
      evidencia: `${fmt(r.views)} views, ${fmt(r.taxa3s)}% passaram dos 3 s`,
      leitura: "Um dos que mais rodaram: repita o tema e o formato.",
    })),
    recomendacoes: recs,
    gravarHoje: {
      tema: topTema?.tema ?? "Negócios e empreendedorismo",
      ganchoTela: dia?.gancho ?? "",
      ganchoFalado: "Preencha o gancho do calendário com o tema que mais rende.",
      formato: "Fala para câmera",
      chamada: "Comenta uma palavra-chave e entregue o material na DM",
      porque: topTema ? `${topTema.tema} tem a maior mediana de views (${fmt(topTema.medianaViews)}).` : "",
      diaCalendario: dia?.numero ?? null,
    },
    postar: hora ? { quando: `${hora.dia}, ${hora.hora}h`, porque: "Pico de seguidores online no Metricool." } : { quando: "17h–19h", porque: "Horário do estudo de referências." },
    parar: n.repetidos.length ? ["Repostar o mesmo vídeo"] : [],
    publico: n.publico
      ? `${n.publico.faixas[0]?.faixa ?? "?"} é a faixa maior (${fmt(n.publico.faixas[0]?.pct)}%); ${fmt(n.publico.paises[0]?.pct)}% no ${n.publico.paises[0]?.chave ?? "?"}.`
      : "Sem dados de público.",
  };
}
