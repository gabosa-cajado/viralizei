const LACUNA = /_{3,}/;

export function partesDoGancho(gancho: string): string[] {
  return gancho.split(LACUNA);
}

export function contarLacunas(gancho: string): number {
  return partesDoGancho(gancho).length - 1;
}

/** Junta o modelo com o que foi escrito nas lacunas. Lacuna vazia continua ___. */
export function montarGancho(gancho: string, valores: string[]): string {
  return partesDoGancho(gancho)
    .map((parte, i, todas) => (i < todas.length - 1 ? parte + (valores[i]?.trim() || "___") : parte))
    .join("");
}

interface Props {
  gancho: string;
  className?: string;
}

/** Gancho só para leitura: cada lacuna vira um fio de latão. */
export function Gancho({ gancho, className }: Props) {
  const partes = partesDoGancho(gancho);
  return (
    <span className={className}>
      {partes.map((parte, i) => (
        <span key={i}>
          {parte}
          {i < partes.length - 1 && (
            <span className="lacuna">
              <span className="visualmente-oculto">lacuna</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

interface PropsEditavel extends Props {
  valores: string[];
  onMudar: (valores: string[]) => void;
}

/** Gancho com as lacunas viradas em campos: quem lê completa a frase ali mesmo. */
export function GanchoEditavel({ gancho, className, valores, onMudar }: PropsEditavel) {
  const partes = partesDoGancho(gancho);
  return (
    <span className={className}>
      {partes.map((parte, i) => (
        <span key={i}>
          {parte}
          {i < partes.length - 1 && (
            <input
              className="lacuna-campo"
              value={valores[i] ?? ""}
              placeholder="   "
              aria-label={`Lacuna ${i + 1} do gancho`}
              style={{ width: `${Math.max((valores[i] ?? "").length, 3) + 1.5}ch` }}
              onChange={(e) => {
                const novos = [...valores];
                novos[i] = e.target.value;
                onMudar(novos);
              }}
            />
          )}
        </span>
      ))}
    </span>
  );
}
