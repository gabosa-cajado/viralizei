// Ponte com o artefato do claude.ai. Fora dele (npm run dev) `window.claude`
// não existe e o app roda no modo local, com o navegador como armazenamento.

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface QuerySnap {
  docs: DocSnap[];
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface ColRef {
  doc(id: string): DocRef;
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: { code: string }) => void): () => void;
}
export interface Db {
  collection(path: string): ColRef;
  doc(path: string): DocRef;
}
export interface Perfil {
  id: string;
  name: string;
  avatarUrl: string;
  color: string;
  isMe: boolean;
}
export interface Usuario {
  id(): Promise<string | null>;
  can(nome: string): Promise<boolean | null>;
  profiles(ids: readonly string[]): Promise<Record<string, Perfil>>;
}
export interface Sample {
  json<T = unknown>(input: string, options?: Record<string, unknown>): Promise<T>;
}

interface Claude {
  use(nome: "db"): Promise<Db | null>;
  use(nome: "user"): Promise<Usuario | null>;
  use(nome: "sample"): Promise<Sample | null>;
}

function claude(): Claude | null {
  const c = (window as unknown as { claude?: Claude }).claude;
  return c && typeof c.use === "function" ? c : null;
}

/** Está rodando dentro de um artefato do claude.ai? */
export const noArtefato = claude() !== null;

export async function usar<N extends "db" | "user" | "sample">(nome: N) {
  const c = claude();
  if (!c) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c.use as (n: string) => Promise<any>)(nome).catch(() => null) as Promise<
    N extends "db" ? Db | null : N extends "user" ? Usuario | null : Sample | null
  >;
}
