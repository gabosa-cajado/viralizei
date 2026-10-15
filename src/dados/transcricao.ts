// Transcrição no navegador com Whisper (transformers.js), para quando o
// servidor não tem chave da OpenAI. O modelo baixa uma vez (fica no cache do
// navegador) e roda na placa de vídeo (WebGPU) ou na CPU (WASM). O áudio não
// sai do computador.

const VERSAO = "4.3.0";
const CDN = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${VERSAO}/dist/transformers.min.js`;

type Pipeline = (audio: Float32Array, opcoes: Record<string, unknown>) => Promise<{ text: string }>;

interface Transformers {
  pipeline: (tarefa: string, modelo: string, opcoes: Record<string, unknown>) => Promise<Pipeline>;
  env: { allowLocalModels: boolean };
}

let carregando: Promise<Pipeline> | null = null;

export function temWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Modelo pequeno na CPU (mais rápido de baixar e rodar), médio na GPU. */
export function modeloEscolhido() {
  return temWebGPU() ? "onnx-community/whisper-small" : "onnx-community/whisper-base";
}

async function obterPipeline(aoProgredir: (texto: string) => void): Promise<Pipeline> {
  if (!carregando) {
    carregando = (async () => {
      aoProgredir("Carregando o transcritor");
      const t = (await import(/* @vite-ignore */ CDN)) as Transformers;
      t.env.allowLocalModels = false;
      const gpu = temWebGPU();
      const vistos = new Map<string, number>();
      return t.pipeline("automatic-speech-recognition", modeloEscolhido(), {
        device: gpu ? "webgpu" : "wasm",
        ...(gpu ? { dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } } : {}),
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
          if (p.status === "progress" && p.file && typeof p.progress === "number") {
            vistos.set(p.file, p.progress);
            const media = [...vistos.values()].reduce((a, b) => a + b, 0) / vistos.size;
            aoProgredir(`Baixando o transcritor (uma vez só): ${Math.round(media)}%`);
          } else if (p.status === "ready") {
            aoProgredir("Transcritor pronto");
          }
        },
      });
    })().catch((e) => {
      carregando = null;
      throw e;
    });
  }
  return carregando;
}

/** Transcreve áudio mono a 16 kHz. Devolve texto vazio se não entender nada. */
export async function transcreverNoNavegador(amostras: Float32Array, aoProgredir: (texto: string) => void): Promise<string> {
  const pipeline = await obterPipeline(aoProgredir);
  aoProgredir(`Ouvindo a fala (${Math.round(amostras.length / 16000)} s de áudio${temWebGPU() ? ", na placa de vídeo" : ", na CPU: pode levar alguns minutos"})`);
  const saida = await pipeline(amostras, {
    language: "portuguese",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });
  return String(saida.text ?? "").trim();
}
