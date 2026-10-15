// Avaliação de um vídeo antes de postar, contra o que o estudo de referências
// mediu. Tudo roda no navegador: o arquivo não sai do computador.

export interface MedidasVideo {
  duracaoSeg: number;
  largura: number;
  altura: number;
  vertical: boolean;
  temAudio: boolean;
  /** Quando a primeira fala começa, em milissegundos. */
  primeiraFalaMs: number | null;
  /** Fração do áudio em silêncio (0 a 1). */
  silencio: number | null;
  /** Pausas de mais de 0,25 s por minuto. */
  pausasLongasPorMin: number | null;
  /** Energia dos últimos 10% em relação à média (1 = igual). */
  energiaFinal: number | null;
  /** Quadros em 0,4 s, 3 s, metade e fim, como data URL. */
  quadros: { tempo: string; imagem: string }[];
}

export interface TextosVideo {
  ganchoFalado: string;
  textoNaTela: string;
  legenda: string;
}

export type Estado = "ok" | "falha" | "conferir";

export interface Criterio {
  id: string;
  grupo: "Automático" | "Texto" | "Você confere";
  nome: string;
  estado: Estado;
  detalhe: string;
  peso: number;
}

/** Itens que o app não consegue medir sozinho; a pessoa marca. */
export const CONFERIR_MANUAL: { id: string; nome: string; detalhe: string; peso: number }[] = [
  { id: "prova", nome: "Prova na tela nos primeiros 10 s", detalhe: "Print, número, nome ou objeto que confirma a promessa do gancho.", peso: 10 },
  { id: "alinhado", nome: "Texto, fala e imagem contam a mesma coisa", detalhe: "Vendo só um dos três, dá para adivinhar os outros dois.", peso: 8 },
  { id: "posicao", nome: "Uma posição firme, sem meio-termo", detalhe: "A favor ou contra; é o que gera comentário.", peso: 6 },
  { id: "assinatura", nome: "Roupa, cenário e fonte iguais aos dos outros vídeos", detalhe: "Assinatura visual fixa: reconhecível num quadro congelado.", peso: 6 },
  { id: "interrupcao", nome: "Troca de visual a cada 10–15 s", detalhe: "Gráfico, print, PiP ou movimento do corpo.", peso: 5 },
  { id: "luz", nome: "Rosto mais claro que o fundo", detalhe: "Luz de frente ou janela; fundo escuro ou neutro.", peso: 4 },
  { id: "cta", nome: "Fecha com uma chamada que cabe em uma palavra", detalhe: "Pergunta de uma palavra, palavra-chave para comentar ou seguir com placar.", peso: 6 },
];

async function medirAudio(arquivo: File): Promise<Pick<MedidasVideo, "temAudio" | "primeiraFalaMs" | "silencio" | "pausasLongasPorMin" | "energiaFinal">> {
  const vazio = { temAudio: false, primeiraFalaMs: null, silencio: null, pausasLongasPorMin: null, energiaFinal: null };
  try {
    const buf = await arquivo.arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const ab = await ctx.decodeAudioData(buf);
    void ctx.close();
    const x = ab.getChannelData(0);
    const hop = Math.round(ab.sampleRate / 100); // 10 ms
    const env: number[] = [];
    for (let i = 0; i + hop <= x.length; i += hop) {
      let s = 0;
      for (let k = i; k < i + hop; k++) s += x[k] * x[k];
      env.push(Math.sqrt(s / hop));
    }
    if (env.length < 50) return vazio;
    const ordenado = [...env].sort((a, b) => a - b);
    const mediana = ordenado[ordenado.length >> 1];
    if (mediana < 0.002) return { ...vazio, temAudio: false };
    const limiar = mediana * 0.25;
    const silencio = env.filter((v) => v < limiar).length / env.length;
    let pausas = 0;
    let corrida = 0;
    for (const v of env) {
      if (v < limiar) corrida++;
      else {
        if (corrida >= 25) pausas++;
        corrida = 0;
      }
    }
    const primeira = env.findIndex((v) => v > mediana * 0.5);
    const media = env.reduce((a, b) => a + b, 0) / env.length;
    const cauda = env.slice(Math.floor(env.length * 0.9));
    const energiaFinal = cauda.reduce((a, b) => a + b, 0) / cauda.length / media;
    return {
      temAudio: true,
      primeiraFalaMs: primeira < 0 ? null : primeira * 10,
      silencio: +silencio.toFixed(2),
      pausasLongasPorMin: +(pausas / (env.length / 6000)).toFixed(1),
      energiaFinal: +energiaFinal.toFixed(2),
    };
  } catch {
    return vazio;
  }
}

function esperar<T>(p: Promise<T>, ms: number, erro: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(erro)), ms))]);
}

async function medirVideo(arquivo: File): Promise<Pick<MedidasVideo, "duracaoSeg" | "largura" | "altura" | "vertical" | "quadros">> {
  const url = URL.createObjectURL(arquivo);
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  v.src = url;
  try {
    await esperar(new Promise<void>((r, j) => { v.onloadeddata = () => r(); v.onerror = () => j(new Error("x")); }), 20000, "O navegador não conseguiu abrir este vídeo. Use mp4 ou mov.");
    const duracaoSeg = v.duration;
    const largura = v.videoWidth;
    const altura = v.videoHeight;
    const tempos = [
      { tempo: "0,4 s", t: 0.4 },
      { tempo: "3 s", t: 3 },
      { tempo: "metade", t: duracaoSeg / 2 },
      { tempo: "fim", t: Math.max(0, duracaoSeg - 0.5) },
    ].filter((x) => x.t < duracaoSeg);
    const quadros: { tempo: string; imagem: string }[] = [];
    const canvas = document.createElement("canvas");
    const escala = 320 / Math.max(largura, 1);
    canvas.width = Math.round(largura * escala);
    canvas.height = Math.round(altura * escala);
    const ctx = canvas.getContext("2d")!;
    for (const { tempo, t } of tempos) {
      v.currentTime = t;
      await esperar(new Promise<void>((r) => { v.onseeked = () => r(); }), 8000, "O vídeo demorou demais para responder.");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      quadros.push({ tempo, imagem: canvas.toDataURL("image/jpeg", 0.8) });
    }
    return { duracaoSeg, largura, altura, vertical: altura > largura, quadros };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

export async function medir(arquivo: File): Promise<MedidasVideo> {
  const [video, audio] = await Promise.all([medirVideo(arquivo), medirAudio(arquivo)]);
  return { ...video, ...audio };
}

function contar(texto: string) {
  return texto.trim() ? texto.trim().split(/\s+/).length : 0;
}

export function avaliar(m: MedidasVideo | null, t: TextosVideo, manual: Record<string, boolean>): { criterios: Criterio[]; nota: number } {
  const c: Criterio[] = [];
  const add = (id: string, grupo: Criterio["grupo"], nome: string, estado: Estado, detalhe: string, peso: number) =>
    c.push({ id, grupo, nome, estado, detalhe, peso });

  if (m) {
    const d = m.duracaoSeg;
    add("duracao", "Automático", "Duração entre 36 e 150 s", d >= 36 && d <= 150 ? "ok" : "falha",
      `${d.toFixed(0)} s. Os virais dos cinco perfis ficam entre 36 e 150 s; frase solta de 15 s é o formato de menor alcance.`, 8);
    add("vertical", "Automático", "Vertical (9:16)", m.vertical ? "ok" : "falha",
      `${m.largura}×${m.altura}. ${m.vertical ? "Certo para Reels." : "Horizontal: ou regrave em pé, ou use faixas pretas como o Benchimol, de propósito e sempre."}`, 4);
    if (!m.temAudio) {
      add("audio", "Automático", "Tem fala", "falha", "Não achei áudio. Vídeo só com texto e trilha é o que tiramos das referências.", 10);
    } else {
      const p = m.primeiraFalaMs ?? 9999;
      add("primeira", "Automático", "Primeira palavra antes de 0,5 s", p <= 500 ? "ok" : p <= 1500 ? "conferir" : "falha",
        `Começa em ${(p / 1000).toFixed(2)} s. Nos cinco perfis a fala começa antes de 0,3 s; nada de "oi, gente".`, 10);
      const s = m.silencio ?? 1;
      add("silencio", "Automático", "Menos de 20% de silêncio", s <= 0.2 ? "ok" : s <= 0.3 ? "conferir" : "falha",
        `${Math.round(s * 100)}% do áudio em silêncio. Kallaway e Benchimol ficam abaixo de 10% (a edição tira as respirações); conversa natural fica em 15–20%.`, 6);
      const pl = m.pausasLongasPorMin ?? 0;
      add("pausas", "Automático", "Pausas longas sob controle", pl <= 6 ? "ok" : pl <= 10 ? "conferir" : "falha",
        `${pl} pausas de mais de 0,25 s por minuto. Pausa boa é a de meio segundo depois da palavra que importa; as outras, corte.`, 4);
      const ef = m.energiaFinal ?? 1;
      add("energia", "Automático", "Energia até o fim", ef >= 0.75 ? "ok" : ef >= 0.55 ? "conferir" : "falha",
        `Os últimos 10% têm ${Math.round(ef * 100)}% do volume médio. Frase que cai no fim soa insegura; volume se conserta na edição, energia não.`, 5);
    }
  }

  const gancho = t.ganchoFalado.trim();
  if (gancho) {
    const n = contar(gancho);
    add("gancho-tamanho", "Texto", "Gancho falado em até 12 palavras", n <= 12 ? "ok" : n <= 16 ? "conferir" : "falha",
      `${n} palavras. Assunto + o que a pessoa ganha, comprimido; 8 palavras valem mais que 28.`, 8);
    const temNumeroOuNome = /\d|[A-ZÁÉÍÓÚ][a-záéíóú]+\s[A-ZÁÉÍÓÚ]/.test(gancho.slice(1));
    add("gancho-especifico", "Texto", "Gancho com número ou nome próprio", temNumeroOuNome ? "ok" : "conferir",
      temNumeroOuNome ? "Tem um dado concreto." : '"22 dias" vale mais que "algumas semanas"; um nome puxa o olho.', 5);
    add("gancho-abertura", "Texto", "Não começa com saudação", /^(oi|olá|ola|e aí|fala|bom dia|boa tarde|boa noite|gente)/i.test(gancho) ? "falha" : "ok",
      "A primeira palavra já é o assunto.", 4);
  } else {
    add("gancho-vazio", "Texto", "Gancho falado", "conferir", "Escreva a primeira frase do vídeo para eu conferir tamanho e abertura.", 8);
  }

  const tela = t.textoNaTela.trim();
  if (tela) {
    const linhas = tela.split(/\n/).filter((l) => l.trim()).length;
    add("tela-linhas", "Texto", "Texto na tela em até 2 linhas", linhas <= 2 ? "ok" : "falha", `${linhas} linha(s). Com fonte do sistema, 2 é o limite.`, 6);
    add("tela-pontuacao", "Texto", "Sem pontuação nem conjunção no título", /[.!?;:,]|\b(e|ou|mas|que|porque|portanto)\b/i.test(tela) ? "conferir" : "ok",
      "Título é gatilho, não frase: sem ponto, sem \"e/ou/mas/que\".", 4);
    const palavras = contar(tela);
    add("tela-tamanho", "Texto", "Título curto (até 9 palavras)", palavras <= 9 ? "ok" : "conferir", `${palavras} palavras.`, 3);
  } else {
    add("tela-vazio", "Texto", "Texto na tela", "conferir", "Todos os cinco perfis têm texto na tela o tempo todo. Escreva o seu título para eu conferir.", 6);
  }

  const legenda = t.legenda.trim();
  if (legenda) {
    const primeira = legenda.split(/\n/)[0].trim().toLowerCase();
    const igual = gancho && (primeira.startsWith(gancho.toLowerCase().slice(0, 25)) || gancho.toLowerCase().startsWith(primeira.slice(0, 25)));
    add("legenda-primeira", "Texto", "Primeira linha da legenda = gancho", igual ? "ok" : "conferir", igual ? "A legenda repete o gancho." : "Kallaway, Tarik e Benchimol abrem a legenda com a frase do gancho.", 4);
    const hashtags = (legenda.match(/#\w+/g) ?? []).length;
    add("legenda-hashtags", "Texto", "Hashtags: nenhuma ou 4–5 fixas", hashtags === 0 || (hashtags >= 4 && hashtags <= 5) ? "ok" : hashtags <= 8 ? "conferir" : "falha",
      `${hashtags} hashtag(s). Quatro dos cinco usam zero; o Robert usa 4–5, sempre as mesmas.`, 3);
    add("legenda-cta", "Texto", "Chamada na legenda", /\?|coment|segue|salva|me conta|me diz/i.test(legenda) ? "ok" : "conferir", "Pergunta de uma palavra, palavra-chave ou placar.", 3);
  }

  for (const item of CONFERIR_MANUAL) {
    add(item.id, "Você confere", item.nome, manual[item.id] ? "ok" : "conferir", item.detalhe, item.peso);
  }

  const total = c.reduce((a, x) => a + x.peso, 0);
  const pontos = c.reduce((a, x) => a + (x.estado === "ok" ? x.peso : x.estado === "conferir" ? x.peso * 0.4 : 0), 0);
  return { criterios: c, nota: total ? Math.round((pontos / total) * 100) : 0 };
}

// ---------- Avaliação automática com IA ----------
// O navegador tira 8 quadros e converte o áudio em WAV 16 kHz mono; a função
// transcreve (OpenAI, se houver chave) e o Claude lê os quadros e julga os
// critérios. O vídeo inteiro não sai do computador: vão os quadros e o áudio.

export interface CriterioIA {
  id: string;
  nome: string;
  estado: Estado;
  detalhe: string;
  peso: number;
}

export interface AvaliacaoIA {
  nota: number;
  resumo: string;
  transcricao: string;
  ganchoFalado: string;
  textoNaTela: string;
  criterios: CriterioIA[];
  melhorias: string[];
  avisos: string[];
}

export async function extrairQuadros(arquivo: File, largura = 540): Promise<{ tempo: number; imagem: string }[]> {
  const url = URL.createObjectURL(arquivo);
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  v.src = url;
  try {
    await esperar(new Promise<void>((r, j) => { v.onloadeddata = () => r(); v.onerror = () => j(new Error("x")); }), 20000, "O navegador não conseguiu abrir este vídeo. Use mp4 ou mov.");
    const d = v.duration;
    const tempos = [0.3, 1.5, 3, 6, d * 0.25, d * 0.5, d * 0.75, Math.max(0, d - 0.6)]
      .filter((t, i, a) => t < d && a.indexOf(t) === i)
      .sort((a, b) => a - b);
    const canvas = document.createElement("canvas");
    const escala = largura / Math.max(v.videoWidth, 1);
    canvas.width = Math.round(v.videoWidth * escala);
    canvas.height = Math.round(v.videoHeight * escala);
    const ctx = canvas.getContext("2d")!;
    const quadros: { tempo: number; imagem: string }[] = [];
    for (const t of tempos) {
      v.currentTime = t;
      await esperar(new Promise<void>((r) => { v.onseeked = () => r(); }), 8000, "O vídeo demorou demais para responder.");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      quadros.push({ tempo: +t.toFixed(1), imagem: canvas.toDataURL("image/jpeg", 0.72).split(",")[1] });
    }
    return quadros;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Áudio do vídeo como WAV 16 kHz mono em base64 (uns 2 MB por minuto). */
export async function audioWav16k(arquivo: File, maxSeg = 180): Promise<string | null> {
  try {
    const buf = await arquivo.arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const ab = await ctx.decodeAudioData(buf);
    void ctx.close();
    const taxa = 16000;
    const n = Math.min(ab.length, Math.floor(maxSeg * ab.sampleRate));
    const off = new OfflineAudioContext(1, Math.ceil((n / ab.sampleRate) * taxa), taxa);
    const fonte = off.createBufferSource();
    fonte.buffer = ab;
    fonte.connect(off.destination);
    fonte.start();
    const mono = (await off.startRendering()).getChannelData(0);
    const dados = new DataView(new ArrayBuffer(44 + mono.length * 2));
    const texto = (p: number, s: string) => { for (let i = 0; i < s.length; i++) dados.setUint8(p + i, s.charCodeAt(i)); };
    texto(0, "RIFF"); dados.setUint32(4, 36 + mono.length * 2, true); texto(8, "WAVE"); texto(12, "fmt ");
    dados.setUint32(16, 16, true); dados.setUint16(20, 1, true); dados.setUint16(22, 1, true);
    dados.setUint32(24, taxa, true); dados.setUint32(28, taxa * 2, true); dados.setUint16(32, 2, true); dados.setUint16(34, 16, true);
    texto(36, "data"); dados.setUint32(40, mono.length * 2, true);
    for (let i = 0; i < mono.length; i++) {
      const x = Math.max(-1, Math.min(1, mono[i]));
      dados.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    const bytes = new Uint8Array(dados.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return null;
  }
}

export async function avaliarComIA(entrada: {
  medidas: MedidasVideo;
  quadros: { tempo: number; imagem: string }[];
  audioWav: string | null;
}): Promise<AvaliacaoIA> {
  const corpo = {
    medidas: { ...entrada.medidas, quadros: undefined },
    quadros: entrada.quadros,
    audioWav: entrada.audioWav,
  };
  const { noArtefato } = await import("./plataforma");
  const { noSite, supabase } = await import("./site");
  if (!noArtefato && noSite && supabase) {
    const { data, error } = await supabase.functions.invoke("avaliar-video", { body: corpo });
    if (error) {
      const { FunctionsHttpError } = await import("@supabase/supabase-js");
      const c = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
      throw new Error(c.erro ?? "A avaliação com IA não respondeu. Tente de novo.");
    }
    return data as AvaliacaoIA;
  }
  if (!noArtefato) {
    const r = await fetch("/api/avaliar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => {
      throw new Error("Sem conexão com o app. Confira se ele ainda está rodando.");
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro ?? "A avaliação com IA não respondeu.");
    return d as AvaliacaoIA;
  }
  throw new Error("A avaliação com IA existe só no site.");
}
