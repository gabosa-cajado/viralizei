import { useEffect, useMemo, useState } from "react";
import { useEstado } from "../dados/armazenamento";
import { usar, type Perfil } from "../dados/plataforma";

// Cor estável por pessoa e avatar de iniciais (o site não tem foto de perfil).
const CORES = ["#d40f1e", "#1d4ed8", "#17703f", "#8a5a00", "#6d28d9", "#0e7490", "#be185d"];
function corDe(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
function avatarDeIniciais(nome: string, cor: string) {
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${cor}"/><text x="20" y="26" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">${iniciais}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Resolve nomes e fotos dos ids na tela. Nada de nome fica guardado nos dados. */
export function usePerfis(ids: string[]): Record<string, Perfil> {
  const { modo, perfisSite, meuId } = useEstado();
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({});
  const chave = [...ids].sort().join(",");
  const doSite = useMemo(() => {
    const r: Record<string, Perfil> = {};
    for (const id of chave ? chave.split(",") : []) {
      const nome = perfisSite[id] ?? "";
      const cor = corDe(id);
      r[id] = { id, name: nome, color: cor, isMe: id === meuId, avatarUrl: avatarDeIniciais(nome, cor) };
    }
    return r;
  }, [chave, perfisSite, meuId]);
  useEffect(() => {
    if (!chave || modo === "site") return;
    let vivo = true;
    usar("user").then((u) => u?.profiles(chave.split(",")).then((p) => vivo && setPerfis(p)));
    return () => {
      vivo = false;
    };
  }, [chave]);
  return modo === "site" ? doSite : perfis;
}

export function nomeDe(p: Perfil | undefined) {
  if (p?.isMe) return "você";
  return p?.name || "um sócio";
}

/** Fotos de quem gravou, com os nomes para leitores de tela e no passar do mouse. */
export function Gravadores({ ids, perfis }: { ids: string[]; perfis: Record<string, Perfil> }) {
  if (ids.length === 0) return null;
  const nomes = ids.map((id) => nomeDe(perfis[id])).join(", ");
  return (
    <span className="gravadores" title={`Gravado por ${nomes}`}>
      <span className="visualmente-oculto">Gravado por {nomes}</span>
      {ids.slice(0, 4).map((id) =>
        perfis[id] ? (
          <img key={id} src={perfis[id].avatarUrl} alt="" aria-hidden="true" />
        ) : (
          <span key={id} className="gravador-vazio" aria-hidden="true" />
        ),
      )}
      {ids.length > 4 && <span className="gravadores-mais">+{ids.length - 4}</span>}
    </span>
  );
}
