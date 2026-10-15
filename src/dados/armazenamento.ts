import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { noArtefato, usar, type Db, type DocSnap } from "./plataforma";
import { SEMENTE } from "./semente";
import { noSite, supabase } from "./site";
import type { Conteudo, Dia, Exemplo, Formato } from "./tipos";

// Única porta de entrada dos dados. Três modos:
// - site (build --mode site): Supabase, com login de sócio; vídeos tocam dentro.
// - artefato (claude.ai): conteúdo compartilhado no banco do artefato e
//   progresso de cada sócio em progresso/<id>, que só ele escreve.
// - local (npm run dev): tudo no navegador, com o conteúdo de exemplo.
// O nicho é conveniência de cada um e fica sempre no navegador.

const CHAVE_CONTEUDO = "pauta:conteudo";
const CHAVE_GRAVADOS = "pauta:gravados";
const CHAVE_NICHO = "pauta:nicho";

export type Modo = "local" | "carregando" | "login" | "sem-acesso" | "artefato" | "site";

/** Modos com equipe: mostram quem gravou cada dia. */
export function emEquipe(modo: Modo) {
  return modo === "artefato" || modo === "site";
}

interface Estado {
  modo: Modo;
  conteudo: Conteudo;
  /** Dias que eu marquei como gravados. */
  gravados: string[];
  /** Quem gravou o quê (só no artefato). */
  gravadosPorPessoa: Record<string, string[]>;
  meuId: string | null;
  nicho: string;
  /** Pode criar e editar o conteúdo compartilhado. */
  podeEditar: boolean;
  /** Nomes dos sócios (só no site). */
  perfisSite: Record<string, string>;
  erro: string | null;
}

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
    // Navegador sem armazenamento: o app segue funcionando nesta aba.
  }
}

const VAZIO: Conteudo = { versao: 1, formatos: [], dias: [] };

let estado: Estado =
  noArtefato || noSite
    ? {
        modo: "carregando",
        conteudo: VAZIO,
        gravados: [],
        gravadosPorPessoa: {},
        meuId: null,
        nicho: ler<string>(CHAVE_NICHO, ""),
        podeEditar: false,
        perfisSite: {},
        erro: null,
      }
    : {
        modo: "local",
        conteudo: ler<Conteudo>(CHAVE_CONTEUDO, SEMENTE),
        gravados: ler<string[]>(CHAVE_GRAVADOS, []),
        gravadosPorPessoa: {},
        meuId: null,
        nicho: ler<string>(CHAVE_NICHO, ""),
        podeEditar: true,
        perfisSite: {},
        erro: null,
      };

const ouvintes = new Set<() => void>();

function atualizar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  if (estado.modo === "local") {
    if (parcial.conteudo) gravar(CHAVE_CONTEUDO, estado.conteudo);
    if (parcial.gravados) gravar(CHAVE_GRAVADOS, estado.gravados);
  }
  if (parcial.nicho !== undefined) gravar(CHAVE_NICHO, estado.nicho);
  ouvintes.forEach((ouvir) => ouvir());
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

export function useEstado(): Estado {
  return useSyncExternalStore(assinar, () => estado);
}

export function limparErro() {
  atualizar({ erro: null });
}

// ---------- Artefato ----------

let db: Db | null = null;

function texto(v: unknown, max = 2000) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

// O banco é compartilhado: tudo que vem dele é conferido antes de virar estado.
function lerDia(d: DocSnap): Dia | null {
  const b = d.data();
  if (!b) return null;
  const numero = Number(b.numero);
  if (!Number.isFinite(numero) || numero < 1) return null;
  const exemplos: Exemplo[] = Array.isArray(b.exemplos)
    ? b.exemplos
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({ nicho: texto(e.nicho, 80), texto: texto(e.texto, 400) }))
    : [];
  return {
    id: d.id,
    numero: Math.floor(numero),
    gancho: texto(b.gancho, 300),
    descricao: texto(b.descricao),
    formatoId: texto(b.formatoId, 80),
    referenciaUrl: texto(b.referenciaUrl, 500),
    exemplos,
  };
}

function corpoDoDia(dia: Dia): Record<string, unknown> {
  const { id: _id, ...corpo } = dia;
  return corpo;
}

async function iniciarArtefato() {
  const [banco, usuario] = await Promise.all([usar("db"), usar("user")]);
  if (!banco) {
    atualizar({ modo: "sem-acesso" });
    return;
  }
  db = banco;
  const meuId = usuario ? await usuario.id() : null;
  const pode = usuario ? await usuario.can("data.write") : null;
  atualizar({ meuId, podeEditar: pode !== false });

  let dias: Dia[] | null = null;
  let formatos: (Formato & { ordem: number })[] | null = null;
  const montar = () => {
    if (!dias || !formatos) return;
    atualizar({
      modo: "artefato",
      conteudo: {
        versao: 1,
        dias,
        formatos: [...formatos].sort((a, b) => a.ordem - b.ordem).map(({ id, nome }) => ({ id, nome })),
      },
    });
  };
  const falhou = () => atualizar({ erro: "O app perdeu a conexão com os dados. Recarregue a página." });

  db.collection("dias").onSnapshot((s) => {
    dias = s.docs.filter((d) => d.exists).map(lerDia).filter((d): d is Dia => d !== null);
    montar();
  }, falhou);

  db.collection("formatos").onSnapshot((s) => {
    formatos = s.docs
      .filter((d) => d.exists)
      .map((d, i) => {
        const b = d.data() ?? {};
        return { id: d.id, nome: texto(b.nome, 60) || "Sem nome", ordem: Number(b.ordem ?? i) };
      });
    montar();
  }, falhou);

  db.collection("progresso").onSnapshot((s) => {
    const porPessoa: Record<string, string[]> = {};
    for (const d of s.docs) {
      const lista = d.data()?.gravados;
      if (d.exists && Array.isArray(lista)) porPessoa[d.id] = lista.filter((x): x is string => typeof x === "string");
    }
    atualizar({ gravadosPorPessoa: porPessoa, gravados: meuId ? porPessoa[meuId] ?? [] : [] });
  }, falhou);
}

if (noArtefato) void iniciarArtefato();

// ---------- Site (Supabase) ----------

let canal: RealtimeChannel | null = null;
let diasSite: Dia[] = [];
let formatosSite: Formato[] = [];

function montarSite() {
  atualizar({ conteudo: { versao: 1, dias: diasSite, formatos: formatosSite } });
}

async function carregarDias() {
  const { data, error } = await supabase!.from("dias").select("*");
  if (error) return falhou();
  diasSite = (data ?? []).map((d) => ({
    id: d.id,
    numero: d.numero,
    gancho: d.gancho,
    descricao: d.descricao,
    formatoId: d.formato_id ?? "",
    referenciaUrl: d.referencia_url,
    exemplos: Array.isArray(d.exemplos)
      ? d.exemplos.map((e: Record<string, unknown>) => ({ nicho: texto(e?.nicho, 80), texto: texto(e?.texto, 400) }))
      : [],
  }));
  montarSite();
}

async function carregarFormatos() {
  const { data, error } = await supabase!.from("formatos").select("id, nome").order("ordem");
  if (error) return falhou();
  formatosSite = data ?? [];
  montarSite();
}

async function carregarProgresso() {
  const { data, error } = await supabase!.from("progresso").select("user_id, dia_id");
  if (error) return falhou();
  const porPessoa: Record<string, string[]> = {};
  for (const linha of data ?? []) (porPessoa[linha.user_id] ??= []).push(linha.dia_id);
  atualizar({ gravadosPorPessoa: porPessoa, gravados: estado.meuId ? porPessoa[estado.meuId] ?? [] : [] });
}

async function carregarPerfis() {
  const { data, error } = await supabase!.from("perfis").select("id, nome");
  if (error) return falhou();
  atualizar({ perfisSite: Object.fromEntries((data ?? []).map((p) => [p.id, p.nome])) });
}

function falhou() {
  atualizar({ erro: "Não deu para carregar os dados. Confira a internet e recarregue a página." });
}

function fecharSite() {
  if (canal) void supabase!.removeChannel(canal);
  canal = null;
  diasSite = [];
  formatosSite = [];
}

async function abrirSite(userId: string) {
  const sb = supabase!;
  fecharSite();
  atualizar({ modo: "carregando", meuId: userId, erro: null });
  const { data: socio, error } = await sb.rpc("sou_socio");
  if (error || socio !== true) {
    atualizar({ modo: "sem-acesso" });
    return;
  }
  atualizar({ podeEditar: true });
  await Promise.all([carregarDias(), carregarFormatos(), carregarProgresso(), carregarPerfis()]);
  atualizar({ modo: "site" });
  canal = sb
    .channel("viralizei")
    .on("postgres_changes", { event: "*", schema: "public", table: "dias" }, () => void carregarDias())
    .on("postgres_changes", { event: "*", schema: "public", table: "formatos" }, () => void carregarFormatos())
    .on("postgres_changes", { event: "*", schema: "public", table: "progresso" }, () => void carregarProgresso())
    .on("postgres_changes", { event: "*", schema: "public", table: "perfis" }, () => void carregarPerfis())
    .subscribe();
}

async function iniciarSite() {
  const sb = supabase!;
  // Nada de consulta dentro do callback: trava o supabase-js. Sai com setTimeout.
  sb.auth.onAuthStateChange((evento, sessao) => {
    setTimeout(() => {
      if (evento === "SIGNED_OUT") {
        fecharSite();
        atualizar({
          modo: "login",
          meuId: null,
          conteudo: VAZIO,
          gravados: [],
          gravadosPorPessoa: {},
          perfisSite: {},
          podeEditar: false,
        });
      } else if (evento === "SIGNED_IN" && sessao && sessao.user.id !== estado.meuId) {
        void abrirSite(sessao.user.id);
      }
    }, 0);
  });
  const { data } = await sb.auth.getSession();
  if (data.session) await abrirSite(data.session.user.id);
  else atualizar({ modo: "login" });
}

if (!noArtefato && noSite) void iniciarSite();

/** Entra com e-mail e senha. Devolve a mensagem de erro, se houver. */
export async function entrar(email: string, senha: string): Promise<string | null> {
  if (!supabase) return "O login só existe no site.";
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (!error) return null;
  if (error.message.toLowerCase().includes("invalid")) return "E-mail ou senha errados. Confira e tente de novo.";
  return "Não deu para entrar agora. Confira a internet e tente de novo.";
}

export async function sair() {
  await supabase?.auth.signOut();
}

/** Grava os 72 dias iniciais num banco vazio (site). */
export async function carregarSemente() {
  if (!supabase) return;
  const { error: e1 } = await supabase
    .from("formatos")
    .upsert(SEMENTE.formatos.map((f, ordem) => ({ id: f.id, nome: f.nome, ordem })));
  if (e1) falhaDeEscrita(e1);
  const { error: e2 } = await supabase.from("dias").insert(
    SEMENTE.dias.map((d) => ({
      id: d.id,
      numero: d.numero,
      gancho: d.gancho,
      descricao: d.descricao,
      formato_id: d.formatoId || null,
      referencia_url: d.referenciaUrl,
      exemplos: d.exemplos,
    })),
  );
  if (e2) falhaDeEscrita(e2);
  await Promise.all([carregarDias(), carregarFormatos()]);
}

// Uma escrita por vez no documento de progresso.
let filaProgresso: Promise<void> = Promise.resolve();

function falhaDeEscrita(e: unknown): never {
  const code = (e as { code?: string })?.code;
  const mensagem =
    code === "invalid_argument" || code === "42501"
      ? "Você não tem permissão para mudar isto. Peça ao dono do Viralizei para liberar a sua conta."
      : code === "quota_exceeded"
        ? "O espaço de dados do Viralizei acabou. Apague dias antigos e tente de novo."
        : "Não deu para salvar agora. Tente de novo em instantes.";
  atualizar({ erro: mensagem });
  throw e;
}

// ---------- Leitura ----------

export function diasOrdenados(conteudo: Conteudo): Dia[] {
  return [...conteudo.dias].sort((a, b) => a.numero - b.numero);
}

export function nomeDoFormato(conteudo: Conteudo, formatoId: string): string {
  return conteudo.formatos.find((f) => f.id === formatoId)?.nome ?? "Sem formato";
}

/** Ids de quem gravou este dia. */
export function quemGravou(diaId: string): string[] {
  return Object.entries(estado.gravadosPorPessoa)
    .filter(([, lista]) => lista.includes(diaId))
    .map(([id]) => id);
}

export function novoId(prefixo: string) {
  return `${prefixo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- Escrita ----------

export function alternarGravado(diaId: string) {
  const novos = estado.gravados.includes(diaId)
    ? estado.gravados.filter((id) => id !== diaId)
    : [...estado.gravados, diaId];

  if (estado.modo === "local") {
    atualizar({ gravados: novos });
    return;
  }
  if (estado.modo === "site" && supabase && estado.meuId) {
    const meuId = estado.meuId;
    const marcando = novos.includes(diaId);
    atualizar({ gravados: novos, gravadosPorPessoa: { ...estado.gravadosPorPessoa, [meuId]: novos } });
    const sb = supabase;
    filaProgresso = filaProgresso
      .then(async () => {
        const { error } = marcando
          ? await sb.from("progresso").insert({ dia_id: diaId })
          : await sb.from("progresso").delete().eq("user_id", meuId).eq("dia_id", diaId);
        if (error && error.code !== "23505") throw error;
      })
      .catch(() => {
        atualizar({ erro: "Não deu para salvar o seu progresso. Tente de novo." });
        void carregarProgresso();
      });
    return;
  }
  if (!db || !estado.meuId) {
    atualizar({ erro: "Entre no claude.ai para marcar o que você gravou." });
    return;
  }
  const meuId = estado.meuId;
  atualizar({
    gravados: novos,
    gravadosPorPessoa: { ...estado.gravadosPorPessoa, [meuId]: novos },
  });
  const banco = db;
  filaProgresso = filaProgresso
    .then(() => banco.doc(`progresso/${meuId}`).set({ gravados: novos }))
    .catch(() => atualizar({ erro: "Não deu para salvar o seu progresso. Tente de novo." }));
}

export function salvarNicho(nicho: string) {
  atualizar({ nicho });
}

export async function salvarDia(dia: Dia) {
  if (estado.modo === "local") {
    const existe = estado.conteudo.dias.some((d) => d.id === dia.id);
    const dias = existe ? estado.conteudo.dias.map((d) => (d.id === dia.id ? dia : d)) : [...estado.conteudo.dias, dia];
    atualizar({ conteudo: { ...estado.conteudo, dias } });
    return;
  }
  if (estado.modo === "site" && supabase) {
    const corpo = {
      numero: dia.numero,
      gancho: dia.gancho,
      descricao: dia.descricao,
      formato_id: dia.formatoId || null,
      referencia_url: dia.referenciaUrl,
      exemplos: dia.exemplos,
    };
    const existe = estado.conteudo.dias.some((d) => d.id === dia.id);
    const { error } = existe
      ? await supabase.from("dias").update(corpo).eq("id", dia.id)
      : await supabase.from("dias").insert({ id: dia.id, ...corpo });
    if (error) falhaDeEscrita(error);
    await carregarDias();
    return;
  }
  if (!db) return;
  await db.collection("dias").doc(dia.id).set(corpoDoDia(dia)).catch(falhaDeEscrita);
}

export async function apagarDia(diaId: string) {
  if (estado.modo === "local") {
    atualizar({
      conteudo: { ...estado.conteudo, dias: estado.conteudo.dias.filter((d) => d.id !== diaId) },
      gravados: estado.gravados.filter((id) => id !== diaId),
    });
    return;
  }
  if (estado.modo === "site" && supabase) {
    const { error } = await supabase.from("dias").delete().eq("id", diaId);
    if (error) falhaDeEscrita(error);
    await carregarDias();
    void carregarProgresso();
    return;
  }
  if (!db) return;
  await db.collection("dias").doc(diaId).delete().catch(falhaDeEscrita);
  if (estado.gravados.includes(diaId)) alternarGravado(diaId);
}

export async function salvarFormatos(formatos: Formato[]) {
  if (estado.modo === "local") {
    atualizar({ conteudo: { ...estado.conteudo, formatos } });
    return;
  }
  if (estado.modo === "site" && supabase) {
    const atuais = new Set(formatos.map((f) => f.id));
    const { error } = await supabase.from("formatos").upsert(formatos.map((f, ordem) => ({ id: f.id, nome: f.nome, ordem })));
    if (error) falhaDeEscrita(error);
    const removidos = estado.conteudo.formatos.filter((f) => !atuais.has(f.id)).map((f) => f.id);
    if (removidos.length) {
      const { error: e2 } = await supabase.from("formatos").delete().in("id", removidos);
      if (e2) falhaDeEscrita(e2);
    }
    await carregarFormatos();
    return;
  }
  if (!db) return;
  const banco = db;
  const atuais = new Set(formatos.map((f) => f.id));
  try {
    for (const [ordem, f] of formatos.entries()) {
      await banco.collection("formatos").doc(f.id).set({ nome: f.nome, ordem });
    }
    for (const f of estado.conteudo.formatos) {
      if (!atuais.has(f.id)) await banco.collection("formatos").doc(f.id).delete();
    }
  } catch (e) {
    falhaDeEscrita(e);
  }
}

// Exportar e importar só existem no modo local: no artefato o conteúdo já é compartilhado.

export function exportarConteudo(): string {
  return JSON.stringify(estado.conteudo, null, 2);
}

/** Troca todo o conteúdo pelo do arquivo. Devolve a mensagem de erro, se houver. */
export function importarConteudo(texto: string): string | null {
  let dados: Conteudo;
  try {
    dados = JSON.parse(texto);
  } catch {
    return "O arquivo não é um JSON válido. Use um arquivo gerado por Exportar conteúdo.";
  }
  if (dados?.versao !== 1 || !Array.isArray(dados.dias) || !Array.isArray(dados.formatos)) {
    return "Este arquivo não é um conteúdo do Viralizei. Use um arquivo gerado por Exportar conteúdo.";
  }
  const ids = new Set(dados.dias.map((d) => d.id));
  atualizar({ conteudo: dados, gravados: estado.gravados.filter((id) => ids.has(id)) });
  return null;
}
