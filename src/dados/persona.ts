import { PERSONA_VAZIA, type Persona } from "../../supabase/functions/gerar-roteiro/comum";
import { supabase } from "./site";

// Persona do canal: uma linha só em public.persona (sócios leem e editam os
// seis textos; data e autor da última mudança vêm do banco). Toda IA do site
// (gerar-roteiro em todos os modos e o radar) lê esta linha no servidor.

export interface PersonaSalva extends Persona {
  atualizadoEm: string | null;
}

const SO_NO_SITE = "A Persona do canal fica no banco do site. Abra o Viralizei pelo site e entre com a sua conta.";

export async function lerPersona(): Promise<PersonaSalva> {
  if (!supabase) return { ...PERSONA_VAZIA, atualizadoEm: null };
  const { data, error } = await supabase
    .from("persona")
    .select("nicho, publico, tom, objetivo, diferencial, evitar, atualizado_em")
    .maybeSingle();
  if (error) throw new Error("Não deu para carregar a persona. Confira a internet e recarregue.");
  if (!data) return { ...PERSONA_VAZIA, atualizadoEm: null };
  const { atualizado_em, ...resto } = data as Persona & { atualizado_em: string };
  return { ...PERSONA_VAZIA, ...resto, atualizadoEm: atualizado_em };
}

export async function salvarPersona(p: Persona): Promise<string> {
  if (!supabase) throw new Error(SO_NO_SITE);
  const campos: Persona = {
    nicho: p.nicho.trim().slice(0, 300),
    publico: p.publico.trim().slice(0, 600),
    tom: p.tom.trim().slice(0, 600),
    objetivo: p.objetivo.trim().slice(0, 600),
    diferencial: p.diferencial.trim().slice(0, 600),
    evitar: p.evitar.trim().slice(0, 600),
  };
  const { data, error } = await supabase.from("persona").update(campos).eq("id", true).select("atualizado_em").single();
  if (error) throw new Error("Não deu para guardar a persona. Confira a internet e tente de novo.");
  return (data as { atualizado_em: string }).atualizado_em;
}
