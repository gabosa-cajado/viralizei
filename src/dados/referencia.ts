export interface Referencia {
  plataforma: "Instagram" | "TikTok" | "YouTube";
  embed: string;
  original: string;
}

/** Transforma o link de um vídeo no endereço de embed oficial da plataforma. */
export function lerReferencia(url: string): Referencia | null {
  let endereco: URL;
  try {
    endereco = new URL(url.trim());
  } catch {
    return null;
  }
  const host = endereco.hostname.replace(/^www\./, "");
  const caminho = endereco.pathname;

  if (host === "instagram.com") {
    const m = caminho.match(/^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    // Post comum (/p/) e Reel (/reel/) têm embeds em caminhos diferentes.
    const tipo = m?.[1] === "p" ? "p" : "reel";
    if (m) return { plataforma: "Instagram", embed: `https://www.instagram.com/${tipo}/${m[2]}/embed/captioned/`, original: url };
  }
  if (host.endsWith("tiktok.com")) {
    const m = caminho.match(/\/video\/(\d+)/);
    if (m) return { plataforma: "TikTok", embed: `https://www.tiktok.com/embed/v2/${m[1]}`, original: url };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = caminho.match(/^\/shorts\/([A-Za-z0-9_-]+)/)?.[1] ?? endereco.searchParams.get("v");
    if (id) return { plataforma: "YouTube", embed: `https://www.youtube.com/embed/${id}`, original: url };
  }
  if (host === "youtu.be") {
    const id = caminho.slice(1);
    if (id) return { plataforma: "YouTube", embed: `https://www.youtube.com/embed/${id}`, original: url };
  }
  return null;
}
