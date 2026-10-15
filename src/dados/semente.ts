import dados from "../../conteudo/pauta.json";
import type { Conteudo } from "./tipos";

// Conteúdo de partida do modo local: os 72 dias de conteudo/pauta.json,
// gerado por conteudo/ganchos.py. No artefato o mesmo conteúdo vive no banco.
export const SEMENTE = dados as Conteudo;
