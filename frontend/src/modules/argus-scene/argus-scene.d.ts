// Types of the Argus Cyclist 3D scene (argus-scene.module.js)

export type ArgusCamera = 'chase' | 'drone' | 'cinematic';

export interface ArgusSceneOptions {
  /** Initial camera. Default: 'chase'. */
  camera?: ArgusCamera;
  /** Initial time of day 0..1 (0 = 5 am, ~0.13 = morning, 0.6 = sunset, 0.8 = night). Default 0.13. */
  timeOfDay?: number;
  /** Length of a full day in seconds. 0 freezes the time of day. Default 120. */
  dayCycleSeconds?: number;
  /** Rider FTP in watts, used by the automatic sprint. Default 250. */
  ftp?: number;
  /** Sprints automatically when power goes above ~1.35–1.65 × FTP. Default true. */
  autoSprintFromPower?: boolean;
  /** Rider + bike mass (kg), used only by the internal physics (no external speed). Default 78. */
  riderMass?: number;
  /** Holding the canvas triggers a manual sprint. Default false. */
  interactive?: boolean;
  /** Space = sprint, C = switch camera. Default false. */
  keyboard?: boolean;
  /** Automatic demo sprints when there is no interaction. Default false. */
  demo?: boolean;
  /** Petals flying during the sprint. Default true. */
  petals?: boolean;
  /** devicePixelRatio cap (performance). Default 1.75. */
  maxPixelRatio?: number;
  /** [Argus app] Scale over devicePixelRatio (supersampling above 1). Default 1. */
  renderScale?: number;
  /** URL or data URI of a PNG mask (alpha channel) for the back logo. Default: embedded Argus logo. */
  logoUrl?: string | null;
  /** Starts the animation loop on creation. Default true. */
  autoStart?: boolean;
}

export interface ArgusRideData {
  /** Instantaneous power (W). */
  power?: number | null;
  /** Cadence (rpm). */
  cadence?: number | null;
  /** Speed (km/h). When given, it replaces the internal physics. */
  speedKmh?: number | null;
  /** [Argus app] Distance covered on the app's course (m). The scene follows it smoothly; it is
   *  the reference for the gates and the ghost. null goes back to the scene's integrated distance. */
  distanceM?: number | null;
}

/** [Argus app] Ghost position, queried every frame. */
export interface ArgusGhostSample {
  /** Ghost distance on the course (m, same reference as distanceM). */
  distanceM: number;
  speedKmh?: number;
  /** Cadence (rpm). Default: 88 while moving, 0 when stopped. */
  cadence?: number | null;
}

/** [Argus app] Race gates, in course meters (same reference as distanceM). */
export interface ArgusRace {
  start?: number;
  finish?: number;
}

export interface ArgusSceneState {
  distanceM: number;
  speedKmh: number;
  power: number;
  cadence: number;
  /** Grade of the scene terrain at the current point (%). */
  gradePct: number;
  altitudeM: number;
  /** 0 = seated pedaling, 1 = full sprint. */
  sprint: number;
  timeOfDay: number;
  camera: ArgusCamera;
  /** [Argus app] Frames per second (moving average). */
  fps: number;
  /** [Argus app] Rider distance from the course origin (m). */
  courseDistanceM: number;
  /** [Argus app] Ghost distance (m), or null without a ghost. */
  ghostDistanceM: number | null;
}

export interface ArgusScene {
  readonly canvas: HTMLCanvasElement;
  start(): void;
  stop(): void;
  /** Sends real telemetry. Omitted fields do not change; null goes back to the internal simulation. */
  setRideData(data: ArgusRideData): void;
  clearRideData(): void;
  /** true/false forces the sprint; null goes back to automatic from power. */
  setSprint(on: boolean | null): void;
  setCamera(name: ArgusCamera): void;
  getCamera(): ArgusCamera;
  setTimeOfDay(p: number, cycleSeconds?: number): void;
  getState(): ArgusSceneState;
  resize(): void;
  /** [Argus app] Stops the rider where it is and makes that spot course distance 0 (start line). */
  resetRide(): void;
  /** [Argus app] Stops the rider immediately (speed, power and cadence set to zero). */
  halt(): void;
  /** [Argus app] Draws the start/finish gates (replacing the previous ones). */
  setRace(race: ArgusRace | null): void;
  /** [Argus app] Translucent ghost in the left lane; the provider is called every frame. */
  setGhost(provider: (() => ArgusGhostSample | null) | null, label?: string | null): void;
  /** [Argus app] Removes the gates and the ghost. */
  clearRace(): void;
  /** [Argus app] Updates the FTP used by the automatic sprint. */
  setFtp(watts: number): void;
  /** [Argus app] devicePixelRatio cap. */
  setPixelRatio(ratio: number): void;
  /** [Argus app] Supersampling: resolution = devicePixelRatio × scale (capped by maxPixelRatio). */
  setRenderScale(scale: number): void;
  /** [Argus app] JPEG of the next frame (scene + 2D layer); null when the loop is stopped. */
  captureFrame(quality?: number): Promise<string | null>;
  /** Releases the WebGL context and listeners and removes the canvases. Call it when leaving the screen. */
  dispose(): void;
}

/** Creates the scene inside `container` (which must have a defined size). Throws without WebGL 2. */
export function createArgusScene(container: HTMLElement, options?: ArgusSceneOptions): ArgusScene;
export default createArgusScene;
