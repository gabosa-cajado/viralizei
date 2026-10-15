import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  audioWav16k,
  avaliar,
  avaliarComIA,
  CONFERIR_MANUAL,
  extrairQuadros,
  medir,
  type AvaliacaoIA,
  type MedidasVideo,
  type TextosVideo,
} from "../dados/avaliacao";

const FORMATOS = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

type Etapa = "parado" | "medindo" | "quadros" | "ia" | "pronto";

const ETAPAS: Record<Etapa, string> = {
  parado: "",
  medindo: "Medindo duração, fala e silêncio",
  quadros: "Tirando os quadros e separando o áudio",
  ia: "A IA está lendo os quadros e ouvindo a fala (até 1 minuto)",
  pronto: "",
};

export function Avaliar() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [medidas, setMedidas] = useState<MedidasVideo | null>(null);
  const [etapa, setEtapa] = useState<Etapa>("parado");
  const [ia, setIa] = useState<AvaliacaoIA | null>(null);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [textos, setTextos] = useState<TextosVideo>({ ganchoFalado: "", textoNaTela: "", legenda: "" });
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const entrada = useRef<HTMLInputElement>(null);

  const manualResultado = useMemo(() => avaliar(medidas, textos, manual), [medidas, textos, manual]);
  const semIA = !!erroIA;
  const nota = ia ? ia.nota : semIA && (medidas || textos.ganchoFalado) ? manualResultado.nota : null;
  const corNota = nota == null ? "" : nota >= 80 ? "nota-boa" : nota >= 60 ? "nota-media" : "nota-baixa";

  async function receber(f: File | undefined) {
    if (!f) return;
    if (!FORMATOS.includes(f.type) && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)) {
      setErro("Use um vídeo mp4, mov ou webm.");
      return;
    }
    setErro(null);
    setErroIA(null);
    setIa(null);
    setArquivo(f);
    setMedidas(null);
    try {
      setEtapa("medindo");
      const m = await medir(f);
      setMedidas(m);
      setEtapa("quadros");
      const [quadros, audioWav] = await Promise.all([extrairQuadros(f), m.temAudio ? audioWav16k(f) : Promise.resolve(null)]);
      setEtapa("ia");
      try {
        setIa(await avaliarComIA({ medidas: m, quadros, audioWav }));
      } catch (e) {
        setErroIA(e instanceof Error ? e.message : "A avaliação com IA não respondeu.");
      }
      setEtapa("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para ler este vídeo.");
      setEtapa("parado");
    }
  }

  const grupos = ["Automático", "Texto", "Você confere"] as const;

  return (
    <div className="avaliar">
      <section className="abertura" aria-labelledby="titulo-avaliar">
        <p className={`abertura-numero ${corNota}`} aria-hidden="true">
          {nota == null ? "?" : nota}
        </p>
        <div className="abertura-texto">
          <h1 id="titulo-avaliar" className="rotulo">Avaliar antes de postar</h1>
          <p className="abertura-gancho">Solte o vídeo. A IA dá a nota de 0 a 100 contra o que os cinco criadores fazem.</p>
          <p className="abertura-acoes">
            <span>
              O navegador mede o vídeo e tira 8 quadros e o áudio; a IA transcreve a fala, lê o texto na tela e julga gancho, prova, roupa, luz, enquadramento e chamada. O arquivo inteiro não é enviado. Critérios em <Link to="/referencias" className="link">Referências</Link>.
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
            <p className="solta-texto" aria-live="polite">
              {etapa !== "parado" && etapa !== "pronto" ? ETAPAS[etapa] : arquivo ? `${(arquivo.size / 1e6).toFixed(1)} MB` : "mp4, mov ou webm, direto do celular"}
            </p>
            <button type="button" className="botao botao-primario" onClick={() => entrada.current?.click()} disabled={etapa !== "parado" && etapa !== "pronto"}>
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

          {ia && (
            <dl className="ficha">
              <div>
                <dt>Gancho falado</dt>
                <dd>{ia.ganchoFalado || <span className="sem-dado">não identificado</span>}</dd>
              </div>
              <div>
                <dt>Texto na tela</dt>
                <dd className="roteiro-legenda">{ia.textoNaTela || <span className="sem-dado">nenhum</span>}</dd>
              </div>
              {ia.transcricao && (
                <div>
                  <dt>Transcrição</dt>
                  <dd className="transcricao">{ia.transcricao}</dd>
                </div>
              )}
            </dl>
          )}

          {semIA && (
            <>
              <p className="aviso">
                {erroIA} Enquanto isso, a nota abaixo usa só as medidas, os textos que você escrever e a lista de conferência.
              </p>
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
            </>
          )}
        </div>

        <section className="avaliar-resultado" aria-live="polite" aria-label="Resultado">
          {ia ? (
            <>
              <p className="descricao avaliar-resumo">{ia.resumo}</p>
              {ia.avisos.length > 0 && (
                <ul className="roteiro-avisos">
                  {ia.avisos.map((a) => <li key={a}>{a}</li>)}
                </ul>
              )}
              <div className="criterios-grupo">
                <h2 className="subtitulo">O que mudar, na ordem</h2>
                <ol className="melhorias">
                  {ia.melhorias.map((m) => <li key={m}>{m}</li>)}
                </ol>
              </div>
              <div className="criterios-grupo">
                <h2 className="subtitulo">Critério por critério</h2>
                <ul className="criterios">
                  {ia.criterios.map((c) => (
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
            </>
          ) : semIA && (medidas || textos.ganchoFalado || textos.textoNaTela) ? (
            grupos.map((g) => {
              const itens = manualResultado.criterios.filter((c) => c.grupo === g);
              if (itens.length === 0) return null;
              return (
                <div key={g} className="criterios-grupo">
                  <h2 className="subtitulo">{g}</h2>
                  <ul className="criterios">
                    {itens.map((c) => (
                      <li key={c.id} className={`criterio criterio-${c.estado}`}>
                        <span className="criterio-estado">{c.estado === "ok" ? "✓" : c.estado === "falha" ? "✕" : "?"}</span>
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
            })
          ) : etapa !== "parado" && etapa !== "pronto" ? (
            <p className="sem-dado">{ETAPAS[etapa]}.</p>
          ) : (
            <p className="sem-dado">Solte um vídeo: a nota, o que mudar e o critério por critério aparecem aqui.</p>
          )}
        </section>
      </div>
    </div>
  );
}
