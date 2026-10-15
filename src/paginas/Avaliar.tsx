import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { avaliar, CONFERIR_MANUAL, medir, type MedidasVideo, type TextosVideo } from "../dados/avaliacao";

const FORMATOS = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

export function Avaliar() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [medidas, setMedidas] = useState<MedidasVideo | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [textos, setTextos] = useState<TextosVideo>({ ganchoFalado: "", textoNaTela: "", legenda: "" });
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const entrada = useRef<HTMLInputElement>(null);

  const resultado = useMemo(() => avaliar(medidas, textos, manual), [medidas, textos, manual]);
  const grupos = ["Automático", "Texto", "Você confere"] as const;

  async function receber(f: File | undefined) {
    if (!f) return;
    if (!FORMATOS.includes(f.type) && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)) {
      setErro("Use um vídeo mp4, mov ou webm. O arquivo não sai do seu computador.");
      return;
    }
    setErro(null);
    setArquivo(f);
    setMedidas(null);
    setMedindo(true);
    try {
      setMedidas(await medir(f));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para ler este vídeo.");
    } finally {
      setMedindo(false);
    }
  }

  const corNota = resultado.nota >= 80 ? "nota-boa" : resultado.nota >= 60 ? "nota-media" : "nota-baixa";

  return (
    <div className="avaliar">
      <section className="abertura" aria-labelledby="titulo-avaliar">
        <p className={`abertura-numero ${medidas || textos.ganchoFalado ? corNota : ""}`} aria-hidden="true">
          {medidas || textos.ganchoFalado || textos.textoNaTela ? resultado.nota : "?"}
        </p>
        <div className="abertura-texto">
          <h1 id="titulo-avaliar" className="rotulo">Avaliar antes de postar</h1>
          <p className="abertura-gancho">Nota de 0 a 100 contra o que os cinco criadores fazem.</p>
          <p className="abertura-acoes">
            <span>
              O vídeo é medido no seu navegador (duração, começo da fala, silêncio, energia, quadros) e não é enviado a lugar nenhum. Os textos e a lista de conferência completam a nota. Critérios em <Link to="/referencias" className="link">Referências</Link>.
            </span>
          </p>
        </div>
      </section>

      <div className="avaliar-grade">
        <div className="avaliar-entrada">
          <div
            className={`solta-video${arrastando ? " arrastando" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); void receber(e.dataTransfer.files[0]); }}
          >
            <input ref={entrada} type="file" accept="video/*" className="visualmente-oculto" onChange={(e) => void receber(e.target.files?.[0])} />
            <p className="solta-titulo">{arquivo ? arquivo.name : "Solte o vídeo aqui"}</p>
            <p className="solta-texto">{medindo ? "Medindo o vídeo" : arquivo ? `${(arquivo.size / 1e6).toFixed(1)} MB` : "mp4, mov ou webm, direto do celular"}</p>
            <button type="button" className="botao botao-primario" onClick={() => entrada.current?.click()} disabled={medindo}>
              {arquivo ? "Trocar o vídeo" : "Escolher o vídeo"}
            </button>
          </div>
          {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

          {medidas && medidas.quadros.length > 0 && (
            <ul className="quadros" aria-label="Quadros do vídeo">
              {medidas.quadros.map((q) => (
                <li key={q.tempo}>
                  <img src={q.imagem} alt={`Quadro em ${q.tempo}`} />
                  <span>{q.tempo}</span>
                </li>
              ))}
            </ul>
          )}

          <label className="campo">
            <span className="rotulo">Gancho falado (primeira frase)</span>
            <input value={textos.ganchoFalado} onChange={(e) => setTextos({ ...textos, ganchoFalado: e.target.value })} placeholder="O que você diz no primeiro segundo" />
          </label>
          <label className="campo">
            <span className="rotulo">Texto na tela (uma linha por linha)</span>
            <textarea rows={2} value={textos.textoNaTela} onChange={(e) => setTextos({ ...textos, textoNaTela: e.target.value })} placeholder={"ESSE É O LADO DA MESA\nQUE ESCONDEM DE VOCÊ"} />
          </label>
          <label className="campo">
            <span className="rotulo">Legenda</span>
            <textarea rows={4} value={textos.legenda} onChange={(e) => setTextos({ ...textos, legenda: e.target.value })} placeholder="Primeira linha = gancho. Depois a tese e a chamada." />
          </label>

          <fieldset className="conferir">
            <legend className="rotulo">Você confere</legend>
            {CONFERIR_MANUAL.map((item) => (
              <label key={item.id} className="marcador conferir-item">
                <input type="checkbox" className="visualmente-oculto" checked={!!manual[item.id]} onChange={(e) => setManual({ ...manual, [item.id]: e.target.checked })} />
                <span className={`marcador-caixa${manual[item.id] ? " cheia" : ""}`} aria-hidden="true" />
                <span className="marcador-texto">
                  {item.nome}
                  <span className="conferir-detalhe">{item.detalhe}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <section className="avaliar-resultado" aria-live="polite" aria-label="Resultado">
          {grupos.map((g) => {
            const itens = resultado.criterios.filter((c) => c.grupo === g);
            if (itens.length === 0) return null;
            return (
              <div key={g} className="criterios-grupo">
                <h2 className="subtitulo">{g}</h2>
                <ul className="criterios">
                  {itens.map((c) => (
                    <li key={c.id} className={`criterio criterio-${c.estado}`}>
                      <span className="criterio-estado" aria-label={c.estado === "ok" ? "Passou" : c.estado === "falha" ? "Falhou" : "Conferir"}>
                        {c.estado === "ok" ? "✓" : c.estado === "falha" ? "✕" : "?"}
                      </span>
                      <span className="criterio-corpo">
                        <span className="criterio-nome">{c.nome}</span>
                        <span className="criterio-detalhe">{c.detalhe}</span>
                      </span>
                      <span className="criterio-peso mono">{c.peso}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!medidas && !textos.ganchoFalado && !textos.textoNaTela && (
            <p className="sem-dado">Solte um vídeo ou escreva o gancho: a nota aparece aqui, critério por critério.</p>
          )}
        </section>
      </div>
    </div>
  );
}
