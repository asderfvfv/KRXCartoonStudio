/** Local image from Assets/Backgrounds or Assets/Props. */
export type StudioImageFile = {
  path: string;
  name: string;
  width: number;
  height: number;
};

export type RightSidebarTab = "layers" | "inspector" | "actions" | "audio";
export type StudioImageKind = "backgrounds" | "props";
