export type AnimatableProperty = "x" | "y" | "rotation" | "scaleX" | "scaleY" | "opacity";
export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut";
export type SemanticRole = "None" | "Custom" | "Root" | "Body" | "Head" | "EyeLeft" | "EyeRight" | "Mouth" | "ArmLeft" | "ArmRight" | "HandLeft" | "HandRight" | "LegLeft" | "LegRight" | "FootLeft" | "FootRight";
export type SocketType = "HeadTop" | "Mouth" | "HandLeft" | "HandRight" | "FootLeft" | "FootRight" | "Custom";
export type MotionName = "Idle" | "Walk" | "Run" | "Wave" | "Talk" | "Happy" | "Angry" | "Surprised" | "Scared" | "Laugh" | "Jump" | "Attack" | "Hit" | "Fall";
export type FacingDirection = "Left" | "Right";
export type ActionType = "Enter" | "Exit" | "MoveTo" | "WalkTo" | "RunTo" | "Face" | "LookAt" | "Idle" | "Wave" | "Talk" | "Happy" | "Angry" | "Surprised" | "Scared" | "Laugh" | "Jump" | "Attack" | "Hit" | "Fall" | "Wait" | "CameraShake";
export type ActionStartMode = "AfterPrevious" | "WithPrevious" | "Absolute";

export interface Vec2 { x: number; y: number }
export interface Transform { x: number; y: number; rotation: number; scaleX: number; scaleY: number }

export interface AssetDefinition {
  id: string;
  name: string;
  path: string;
  mediaType: "image/png" | "image/svg+xml";
  width: number;
  height: number;
}

export interface RigPart {
  id: string;
  name: string;
  assetId: string;
  parentId: string | null;
  zIndex: number;
  transform: Transform;
  pivot: Vec2;
  anchor: Vec2;
  visible: boolean;
  locked: boolean;
  opacity: number;
  semanticRole?: SemanticRole;
  customSemanticRole?: string;
}

export interface RigSocket {
  id: string;
  name: string;
  type: SocketType;
  partId: string;
  position: Vec2;
}

export interface BindPosePart {
  transform: Transform;
  pivot: Vec2;
  anchor: Vec2;
  opacity: number;
}

export type BindPose = Record<string, BindPosePart>;

export interface CharacterDefinition {
  version: 1;
  id: string;
  name: string;
  assets?: AssetDefinition[];
  parts: RigPart[];
  sockets?: RigSocket[];
  bindPose?: BindPose;
  /** User-saved pose presets (relative to bindPose by semantic role). */
  poseLibrary?: Array<{
    id: string;
    labelRu: string;
    deltas: Partial<Record<SemanticRole, Partial<Transform>>>;
  }>;
  /** Assigned Voice Studio profile (Chatterbox). */
  voiceProfileId?: string | null;
  /** Automatic lip-sync mouth set (viseme → part mapping). */
  mouthSet?: import("./visemeSystem").MouthSetDefinition;
}

export interface Keyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingName;
}

export interface AnimationTrack {
  id: string;
  partId: string;
  property: AnimatableProperty;
  keyframes: Keyframe[];
}

export interface AnimationClip {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  tracks: AnimationTrack[];
  generated?: boolean;
}

export type ActorAnimatableProperty = "x" | "y" | "rotation" | "scale" | "opacity";
export type CameraAnimatableProperty = "x" | "y" | "zoom" | "rotation" | "shake";

export interface NumericKeyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingName;
}

export interface ActorTrack {
  id: string;
  actorId: string;
  property: ActorAnimatableProperty;
  keyframes: NumericKeyframe[];
}

export interface CameraTrack {
  id: string;
  property: CameraAnimatableProperty;
  keyframes: NumericKeyframe[];
}

export type PropAnimatableProperty = "x" | "y" | "rotation" | "scaleX" | "scaleY" | "opacity";

export interface PropTrack {
  id: string;
  propId: string;
  property: PropAnimatableProperty;
  keyframes: NumericKeyframe[];
}

export interface MotionSegment {
  id: string;
  actorId: string;
  motion: MotionName;
  start: number;
  duration: number;
  intensity: number;
  hold?: boolean;
}

export interface FacingChange { actorId: string; time: number; direction: FacingDirection }

export interface GeneratedSceneTimeline {
  version: 1;
  duration: number;
  actorTracks: ActorTrack[];
  cameraTracks: CameraTrack[];
  /** Optional still/prop animation (ads Ken Burns, punch, slide). */
  propTracks?: PropTrack[];
  motionSegments: MotionSegment[];
  facingChanges: FacingChange[];
  sourceHash: string;
  manualEdits: boolean;
}

export interface Actor {
  id: string;
  name: string;
  characterId: string;
  position: Vec2;
  scale: number;
  rotation: number;
  facingDirection: FacingDirection;
  visible: boolean;
  opacity?: number;
  tint?: string;
}

export interface SceneProp {
  id: string;
  name: string;
  assetId: string;
  position: Vec2;
  rotation: number;
  scale: Vec2;
  zIndex: number;
  opacity: number;
  visible: boolean;
}

export interface SceneCamera {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export interface SceneActionParameters {
  from?: "Left" | "Right" | "Top" | "Bottom";
  direction?: FacingDirection;
  x?: number;
  y?: number;
  distance?: number;
  intensity?: number;
  stopDistance?: number;
}

export interface SceneAction {
  id: string;
  actorId: string | null;
  type: ActionType;
  targetActorId: string | null;
  duration: number;
  startMode: ActionStartMode;
  startTime?: number;
  parameters: SceneActionParameters;
}

export interface Scene {
  id: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  background: string;
  /** Solid or vertical gradient under optional PNG backgroundAssetId. */
  backgroundFill?: import("./sceneBackgrounds").SceneBackgroundFill;
  backgroundAssetId?: string;
  actors: Actor[];
  props: SceneProp[];
  camera: SceneCamera;
  actionSequence: SceneAction[];
  generatedTimeline?: GeneratedSceneTimeline;
  audioTracks?: import("./audio").SceneAudioTrack[];
  dialogues?: import("./audio").DialogueLine[];
  subtitleSettings?: import("./audio").SubtitleSettings;
  lipSyncSettings?: import("./audio").LipSyncSettings;
  attachments?: import("./attachments").ActorAttachment[];
}

export type {
  ExportJobState,
  ExportPhase,
  OutputFormat,
  RenderPresetId,
  RenderSettings,
  VideoCodec,
  VideoQualityId,
} from "./renderSettings";

export type {
  AudioAssetDefinition,
  AudioMediaType,
  DialogueLine,
  SceneAudioTrack,
  SubtitleSettings,
} from "./audio";

export interface ProjectDocument {
  version: 1;
  schemaVersion?: number;
  name: string;
  canvas: { width: number; height: number; background: string };
  fps: 24 | 25 | 30 | 50 | 60;
  assets: AssetDefinition[];
  audioAssets?: import("./audio").AudioAssetDefinition[];
  characters: CharacterDefinition[];
  sceneObjects: Array<{ id: string; characterId: string }>;
  animationClips: AnimationClip[];
  settings: { snapToGrid: boolean; gridSize: number };
  scenes?: Scene[];
  activeSceneId?: string;
  renderSettings?: import("./renderSettings").RenderSettings;
  montage?: import("./montage").ProjectMontage;
  attachmentPresets?: import("./attachments").AttachmentPreset[];
  series?: import("./series").ProjectSeries;
  /** Persistent Chatterbox voice profiles (local references under Voices/). */
  voiceProfiles?: import("./voiceStudio").VoiceProfile[];
}

export type EvaluatedValues = Record<string, Partial<Record<AnimatableProperty, number>>>;

export interface ActorRuntimeState extends Actor {
  rig: EvaluatedValues;
}

export interface SceneRuntimeState {
  time: number;
  actors: Record<string, ActorRuntimeState>;
  camera: SceneCamera;
  props: SceneProp[];
}

export interface FutureAudioSystem { setTime(timeSeconds: number): void }
export interface FutureLipSyncSystem { evaluate(timeSeconds: number): void }
export interface FutureSubtitleSystem { setTime(timeSeconds: number): void }
export interface FutureSceneDirector { setTime(timeSeconds: number): void }
export interface RenderFrameProvider { renderFrame(timeSeconds: number): Promise<ImageData | Blob> }
export interface FutureRenderSystem { render(provider: RenderFrameProvider, timeSeconds: number): Promise<ImageData | Blob> }
