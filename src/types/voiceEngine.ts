export type VoiceEngineStateUi =
  | "not_installed"
  | "unloaded"
  | "starting"
  | "loading"
  | "ready"
  | "queued"
  | "generating"
  | "completed"
  | "failed";

export interface VoiceEngineStatusUi {
  state: VoiceEngineStateUi;
  device?: string | null;
  modelLoaded?: boolean;
  lastError?: string | null;
  queueLength?: number;
  gpu?: {
    cuda_available?: boolean;
    gpu_name?: string | null;
    cuda_version?: string | null;
    torch_version?: string | null;
    vram_total_mb?: number;
  } | null;
  t3_model?: string | null;
  sample_rate?: number | null;
  languages?: Record<string, string>;
  emotions?: string[];
  emotion_presets?: Record<string, { exaggeration: number; cfg_weight: number }>;
  engineRoot?: string;
  pythonPath?: string | null;
  setupStatusPath?: string | null;
  installed?: boolean;
}
