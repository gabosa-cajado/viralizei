export interface Formato {
  id: string;
  nome: string;
}

export interface Exemplo {
  nicho: string;
  texto: string;
}

export interface Dia {
  id: string;
  numero: number;
  /** Modelo do gancho. Cada `___` vira uma lacuna para preencher. */
  gancho: string;
  descricao: string;
  formatoId: string;
  referenciaUrl: string;
  exemplos: Exemplo[];
}

export interface Conteudo {
  versao: 1;
  formatos: Formato[];
  dias: Dia[];
}
