import dados from "../../conteudo/referencias.json";

// Repositório de referências: cinco criadores estudados em 15/10/2026 e o que
// se repete entre eles. É conteúdo fixo, versionado no repositório, igual nos
// três modos; muda só quando alguém refaz o estudo e regrava o JSON.

export interface GanchoReferencia {
  texto: string;
  onde: string;
  views: string;
  url: string;
}

export interface VideoReferencia {
  url: string;
  titulo: string;
  views: string;
}

export interface Criador {
  slug: string;
  nome: string;
  handle: string;
  instagram: string;
  nicho: string;
  resumo: string;
  numeros: Record<string, string>;
  porqueFunciona: string[];
  posicionamento: string;
  formatos: string[];
  ganchos: GanchoReferencia[];
  roteiro: string;
  legenda: string;
  visual: Record<string, string>;
  voz: string;
  cadencia: string;
  monetizacao: string;
  outrasPlataformas: string;
  trialReels: string;
  videos: VideoReferencia[];
  copiar: string[];
  evitar: string[];
}

export interface Padrao {
  titulo: string;
  texto: string;
}

export interface Checklist {
  titulo: string;
  fonte: string;
  itens: string[];
}

export interface Framework {
  nome: string;
  resumo: string;
}

export interface Referencias {
  versao: number;
  atualizado: string;
  metodo: string;
  criadores: Criador[];
  padroes: Padrao[];
  checklists: Checklist[];
  frameworks: Framework[];
}

export const REFERENCIAS: Referencias = dados as Referencias;

export function criadorPorSlug(slug: string | undefined): Criador | undefined {
  return REFERENCIAS.criadores.find((c) => c.slug === slug);
}

/** Rótulos legíveis para as chaves do bloco visual. */
export const ROTULOS_VISUAL: Record<string, string> = {
  cenario: "Cenário",
  luz: "Luz",
  enquadramento: "Enquadramento",
  roupa: "Roupa",
  textoNaTela: "Texto na tela",
  edicao: "Edição",
};
