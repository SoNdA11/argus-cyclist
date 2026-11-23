// Tipos da cena 3D do Argus Cyclist (argus-scene.module.js)

export type ArgusCamera = 'chase' | 'drone' | 'cinematic';

export interface ArgusSceneOptions {
  /** Câmera inicial. Padrão: 'chase' (perseguição). */
  camera?: ArgusCamera;
  /** Horário inicial 0..1 (0 = 05h, ~0.13 = manhã, 0.6 = pôr do sol, 0.8 = noite). Padrão 0.13. */
  timeOfDay?: number;
  /** Duração de um dia completo em segundos. 0 congela o horário. Padrão 120. */
  dayCycleSeconds?: number;
  /** FTP do atleta em watts, usado no sprint automático. Padrão 250. */
  ftp?: number;
  /** Entra em sprint automaticamente quando a potência passa de ~1.35–1.65 × FTP. Padrão true. */
  autoSprintFromPower?: boolean;
  /** Massa ciclista + bike (kg) usada só na física interna (quando não há velocidade externa). Padrão 78. */
  riderMass?: number;
  /** Segurar o canvas aciona sprint manual. Padrão false. */
  interactive?: boolean;
  /** Espaço = sprint, C = troca de câmera. Padrão false. */
  keyboard?: boolean;
  /** Sprints automáticos de demonstração quando não há interação. Padrão false. */
  demo?: boolean;
  /** Pétalas voando durante o sprint. Padrão true. */
  petals?: boolean;
  /** Limite de devicePixelRatio (desempenho). Padrão 1.75. */
  maxPixelRatio?: number;
  /** URL ou data URI de uma máscara PNG (canal alfa) para a logo das costas. Padrão: logo Argus embutida. */
  logoUrl?: string | null;
  /** Inicia o laço de animação ao criar. Padrão true. */
  autoStart?: boolean;
}

export interface ArgusRideData {
  /** Potência instantânea (W). */
  power?: number | null;
  /** Cadência (rpm). */
  cadence?: number | null;
  /** Velocidade (km/h). Quando informada, substitui a física interna. */
  speedKmh?: number | null;
}

export interface ArgusSceneState {
  distanceM: number;
  speedKmh: number;
  power: number;
  cadence: number;
  /** Inclinação do terreno da cena no ponto atual (%). */
  gradePct: number;
  altitudeM: number;
  /** 0 = pedalando sentado, 1 = sprint completo. */
  sprint: number;
  timeOfDay: number;
  camera: ArgusCamera;
}

export interface ArgusScene {
  readonly canvas: HTMLCanvasElement;
  start(): void;
  stop(): void;
  /** Envia telemetria real. Campos omitidos não mudam; null volta a usar a simulação interna. */
  setRideData(data: ArgusRideData): void;
  clearRideData(): void;
  /** true/false força o sprint; null volta ao automático pela potência. */
  setSprint(on: boolean | null): void;
  setCamera(name: ArgusCamera): void;
  getCamera(): ArgusCamera;
  setTimeOfDay(p: number, cycleSeconds?: number): void;
  getState(): ArgusSceneState;
  resize(): void;
  /** Libera o contexto WebGL, listeners e remove os canvas. Chame ao sair da tela. */
  dispose(): void;
}

/** Cria a cena dentro de `container` (que deve ter tamanho definido). Lança erro se não houver WebGL 2. */
export function createArgusScene(container: HTMLElement, options?: ArgusSceneOptions): ArgusScene;
export default createArgusScene;
