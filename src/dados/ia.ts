import { FunctionsHttpError } from "@supabase/supabase-js";
import { noArtefato, usar } from "./plataforma";
import { noSite, supabase } from "./site";

// No artefato, a geração usa o Claude da conta de quem clica (pede
// permissão na primeira vez). No modo local, usa a rota /api/exemplos.

const MENSAGENS: Record<string, string> = {
  not_granted: "A geração precisa da sua permissão para usar o Claude. Recarregue a página e permita.",
  sampling_disabled: "O Claude não está disponível para a sua conta.",
  rate_limited: "Muitos pedidos seguidos ou o seu limite de uso acabou. Tente de novo mais tarde.",
  session_expired: "A sua sessão no claude.ai expirou. Entre de novo e tente outra vez.",
  refused: "O Claude recusou este pedido. Descreva o nicho de outro jeito.",
  invalid_json: "A resposta veio num formato inesperado. Tente gerar de novo.",
  empty_completion: "A resposta veio vazia. Tente gerar de novo.",
};

export async function gerarGanchos(gancho: string, descricao: string, nicho: string): Promise<string[]> {
  if (!noArtefato && noSite && supabase) {
    const { data, error } = await supabase.functions.invoke("gerar-exemplos", { body: { gancho, descricao, nicho } });
    if (error) {
      const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => ({})) : {};
      throw new Error(corpo.erro ?? "Não deu para gerar agora. Confira a internet e tente de novo.");
    }
    return data.exemplos;
  }
  if (!noArtefato) {
    const resposta = await fetch("/api/exemplos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gancho, descricao, nicho }),
    }).catch(() => {
      throw new Error("Sem conexão com o app. Confira se ele ainda está rodando.");
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro ?? "Não deu para gerar agora. Tente de novo.");
    return dados.exemplos;
  }

  const sample = await usar("sample");
  if (!sample) throw new Error("A geração com o Claude não está disponível nesta visualização.");

  const prompt = `Você escreve ganchos para Reels em português do Brasil.
Abaixo vem um modelo de gancho com lacunas (___), a explicação de por que ele funciona e o nicho de quem vai gravar.
Escreva 3 ganchos prontos para falar na câmera: cada um preenche as lacunas com algo concreto e específico do nicho, soa natural na boca de quem trabalha nele e tem no máximo 18 palavras. Os três devem ser diferentes entre si no assunto, não só na palavra trocada. Nada de emoji, hashtag ou aspas.

Responda só com um array JSON de 3 strings, por exemplo: ["gancho 1", "gancho 2", "gancho 3"]

Modelo: ${gancho}
Por que funciona: ${descricao || "(sem explicação)"}
Nicho: ${nicho}`;

  try {
    const resposta = await sample.json<unknown>(prompt, { cache: false });
    const lista = Array.isArray(resposta) ? resposta.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
    if (lista.length === 0) throw { code: "invalid_json" };
    return lista.slice(0, 3);
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    throw new Error(MENSAGENS[code] ?? "O Claude não respondeu agora. Tente de novo em instantes.");
  }
}
