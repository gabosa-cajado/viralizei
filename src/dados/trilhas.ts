import dados from "../../conteudo/trilhas.json";
import { supabase } from "./site";

// Trilhas: músicas que o nicho usa e o que nós já usamos.
// - site: tabelas public.trilhas e public.trilha_usos (só sócios leem; cada
//   um registra o próprio uso; a contagem de reels é calculada no banco a
//   partir do texto "430K").
// - artefato e local: a lista de conteudo/trilhas.json mais o que cada um
//   acrescentar, tudo no navegador.

export type Clima = "epica" | "tensa" | "reflexiva" | "leve";

export const CLIMAS: Record<Clima, { nome: string; quando: string }> = {
  epica: {
    nome: "Épica",
    quando: "Virada e conquista: antes e depois, meta batida, história de superação.",
  },
  tensa: {
    nome: "Tensa",
    quando: "Alerta e verdade dura: o erro que trava, o que ninguém conta, comparação.",
  },
  reflexiva: {
    nome: "Reflexiva",
    quando: "Lição e bastidor: fala calma por cima, frase de impacto na tela.",
  },
  leve: {
    nome: "Leve",
    quando: "Lista rápida e rotina: dica prática, bastidor do dia, humor.",
  },
};

export interface Trilha {
  id: string;
  titulo: string;
  artista: string;
  /** Página do áudio no Instagram (ou outro link https para ouvir). */
  link: string | null;
  clima: Clima;
  instrumental: boolean;
  nacional: boolean;
  /** Como o Instagram mostra: "430K". */
  reelsTexto: string | null;
  reelsNumero: number | null;
  conferidoEm: string | null;
  /** Um reel do nicho que usa a trilha. */
  exemploUrl: string | null;
  /** Quantos dos reels lidos na pesquisa do nicho usam a trilha. */
  nichoVistos: number;
  observacao: string;
  /** Veio da pesquisa (não se apaga no modo local). */
  daPesquisa?: boolean;
}

export interface UsoTrilha {
  id: string;
  trilhaId: string;
  /** null no modo local: foi você. */
  userId: string | null;
  diaId: string | null;
  usadoEm: string;
}

export type NovaTrilha = Pick<Trilha, "titulo" | "artista" | "link" | "clima" | "instrumental" | "nacional" | "reelsTexto" | "observacao">;

export const PESQUISA = {
  conferidoEm: dados.conferidoEm,
  metodo: dados.metodo,
  audioOriginalPct: dados.audioOriginalPct,
  reelsLidos: dados.reelsLidos,
};

const SEMENTE: Trilha[] = dados.trilhas.map((t) => ({
  id: t.id,
  titulo: t.titulo,
  artista: t.artista,
  link: t.link,
  clima: t.clima as Clima,
  instrumental: t.instrumental,
  nacional: t.nacional,
  reelsTexto: t.reelsTexto,
  reelsNumero: t.reelsNumero,
  conferidoEm: dados.conferidoEm,
  exemploUrl: t.exemploUrl,
  nichoVistos: t.nichoVistos,
  observacao: "",
  daPesquisa: true,
}));

/** "1,5k" vira 1500; o mesmo cálculo que o gatilho do banco faz. */
export function contagemDoTexto(texto: string | null): number | null {
  const m = (texto ?? "").trim().toUpperCase().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*([KM]?)$/);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === "K" ? 1_000 : m[2] === "M" ? 1_000_000 : 1));
}

// ---------- Modo local ----------

const CHAVE_PROPRIAS = "pauta:trilhas";
const CHAVE_USOS = "pauta:trilha-usos";

function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento: vale só nesta aba.
  }
}

interface Proprias {
  novas: Trilha[];
  editadas: Record<string, Partial<Trilha>>;
  apagadas: string[];
}

function lerProprias(): Proprias {
  return ler<Proprias>(CHAVE_PROPRIAS, { novas: [], editadas: {}, apagadas: [] });
}

function trilhasLocais(): Trilha[] {
  const p = lerProprias();
  return [...SEMENTE, ...p.novas]
    .filter((t) => !p.apagadas.includes(t.id))
    .map((t) => ({ ...t, ...(p.editadas[t.id] ?? {}) }));
}

// ---------- Leitura ----------

interface LinhaTrilha {
  id: string;
  titulo: string;
  artista: string;
  link: string | null;
  clima: Clima;
  instrumental: boolean;
  nacional: boolean;
  reels_texto: string | null;
  reels_numero: number | null;
  conferido_em: string | null;
  exemplo_url: string | null;
  nicho_vistos: number;
  observacao: string;
}

function daLinha(l: LinhaTrilha): Trilha {
  return {
    id: l.id,
    titulo: l.titulo,
    artista: l.artista,
    link: l.link,
    clima: l.clima,
    instrumental: l.instrumental,
    nacional: l.nacional,
    reelsTexto: l.reels_texto,
    reelsNumero: l.reels_numero,
    conferidoEm: l.conferido_em,
    exemploUrl: l.exemplo_url,
    nichoVistos: l.nicho_vistos,
    observacao: l.observacao,
  };
}

function paraLinha(t: NovaTrilha) {
  return {
    titulo: t.titulo.trim(),
    artista: t.artista.trim(),
    link: t.link?.trim() || null,
    clima: t.clima,
    instrumental: t.instrumental,
    nacional: t.nacional,
    reels_texto: t.reelsTexto?.trim() || null,
    observacao: t.observacao.trim(),
  };
}

export async function carregarTrilhas(noSiteLogado: boolean): Promise<{ trilhas: Trilha[]; usos: UsoTrilha[] }> {
  if (!noSiteLogado || !supabase) {
    return { trilhas: trilhasLocais(), usos: ler<UsoTrilha[]>(CHAVE_USOS, []) };
  }
  const [t, u] = await Promise.all([
    supabase.from("trilhas").select("*"),
    supabase.from("trilha_usos").select("id, trilha_id, user_id, dia_id, usado_em").order("usado_em", { ascending: false }).limit(1000),
  ]);
  if (t.error || u.error) throw new Error("Não deu para carregar as trilhas. Confira a internet e recarregue.");
  return {
    trilhas: (t.data as LinhaTrilha[]).map(daLinha),
    usos: (u.data ?? []).map((x) => ({
      id: String(x.id),
      trilhaId: x.trilha_id as string,
      userId: x.user_id as string,
      diaId: (x.dia_id as string | null) ?? null,
      usadoEm: x.usado_em as string,
    })),
  };
}

// ---------- Escrita ----------

function erroDeEscrita(mensagem: string, e: { message?: string; code?: string } | null) {
  if (e?.code === "23514") return new Error("Algum campo está fora do formato. O link precisa começar com https://.");
  return new Error(mensagem);
}

export async function registrarUso(noSiteLogado: boolean, trilhaId: string, diaId: string | null): Promise<void> {
  if (!noSiteLogado || !supabase) {
    const usos = ler<UsoTrilha[]>(CHAVE_USOS, []);
    usos.unshift({ id: `u${Date.now().toString(36)}`, trilhaId, userId: null, diaId, usadoEm: new Date().toISOString() });
    gravar(CHAVE_USOS, usos);
    return;
  }
  const { error } = await supabase.from("trilha_usos").insert({ trilha_id: trilhaId, dia_id: diaId });
  if (error) throw erroDeEscrita("Não deu para registrar o uso. Tente de novo.", error);
}

export async function desfazerUso(noSiteLogado: boolean, usoId: string): Promise<void> {
  if (!noSiteLogado || !supabase) {
    gravar(CHAVE_USOS, ler<UsoTrilha[]>(CHAVE_USOS, []).filter((u) => u.id !== usoId));
    return;
  }
  const { error } = await supabase.from("trilha_usos").delete().eq("id", Number(usoId));
  if (error) throw erroDeEscrita("Não deu para desfazer. Tente de novo.", error);
}

export async function salvarTrilha(noSiteLogado: boolean, dados: NovaTrilha, id?: string): Promise<void> {
  if (!dados.titulo.trim()) throw new Error("Escreva o nome da música.");
  if (dados.link && !/^https:\/\//.test(dados.link.trim())) throw new Error("O link precisa começar com https://.");
  if (!noSiteLogado || !supabase) {
    const p = lerProprias();
    const campos: Partial<Trilha> = {
      ...dados,
      titulo: dados.titulo.trim(),
      artista: dados.artista.trim(),
      link: dados.link?.trim() || null,
      reelsTexto: dados.reelsTexto?.trim() || null,
      reelsNumero: contagemDoTexto(dados.reelsTexto),
      observacao: dados.observacao.trim(),
    };
    if (id) {
      const nova = p.novas.find((t) => t.id === id);
      if (nova) Object.assign(nova, campos);
      else p.editadas[id] = { ...(p.editadas[id] ?? {}), ...campos };
    } else {
      p.novas.push({
        ...(campos as Trilha),
        id: `t${Date.now().toString(36)}`,
        exemploUrl: null,
        nichoVistos: 0,
        conferidoEm: dados.reelsTexto ? new Date().toISOString().slice(0, 10) : null,
      });
    }
    gravar(CHAVE_PROPRIAS, p);
    return;
  }
  const linha = paraLinha(dados);
  const { error } = id
    ? await supabase.from("trilhas").update(linha).eq("id", id)
    : await supabase.from("trilhas").insert(linha);
  if (error) throw erroDeEscrita("Não deu para salvar a trilha. Tente de novo.", error);
}

export async function apagarTrilha(noSiteLogado: boolean, id: string): Promise<void> {
  if (!noSiteLogado || !supabase) {
    const p = lerProprias();
    p.novas = p.novas.filter((t) => t.id !== id);
    if (!p.apagadas.includes(id)) p.apagadas.push(id);
    gravar(CHAVE_PROPRIAS, p);
    gravar(CHAVE_USOS, ler<UsoTrilha[]>(CHAVE_USOS, []).filter((u) => u.trilhaId !== id));
    return;
  }
  const { error } = await supabase.from("trilhas").delete().eq("id", id);
  if (error) throw erroDeEscrita("Não deu para apagar a trilha. Tente de novo.", error);
}

// ---------- Contas da tela ----------

export interface ResumoUso {
  vezes: number;
  ultimo: UsoTrilha | null;
}

export function resumoDeUso(usos: UsoTrilha[]): Record<string, ResumoUso> {
  const r: Record<string, ResumoUso> = {};
  for (const u of usos) {
    const atual = r[u.trilhaId] ?? { vezes: 0, ultimo: null };
    atual.vezes += 1;
    if (!atual.ultimo || u.usadoEm > atual.ultimo.usadoEm) atual.ultimo = u;
    r[u.trilhaId] = atual;
  }
  return r;
}

export function diasDesde(iso: string, agora = Date.now()) {
  return Math.floor((agora - new Date(iso).getTime()) / 86_400_000);
}

export function quandoLegivel(iso: string) {
  const d = diasDesde(iso);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
