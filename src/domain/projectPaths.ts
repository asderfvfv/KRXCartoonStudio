/** Safe file stem for .kcsproj and stable Projects folder layout. */

export function sanitizeProjectFileStem(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || "project";
}

/**
 * Portable builds: keep Projects outside win-unpacked so electron-builder pack
 * does not wipe user cartoons when rebuilding the app folder.
 */
export function resolveProjectsDirLayout(input: {
  isPackaged: boolean;
  execDir: string;
  repoRoot: string;
}): { primary: string; legacy: string[] } {
  const norm = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const join = (a: string, b: string) => `${norm(a)}/${b}`.replace(/\/+/g, "/");
  if (!input.isPackaged) {
    return { primary: join(input.repoRoot, "Projects"), legacy: [] };
  }
  const exeDir = norm(input.execDir);
  const base = exeDir.split("/").pop() ?? "";
  if (/^win-unpacked$/i.test(base)) {
    const parent = exeDir.replace(/\/[^/]+$/, "") || exeDir;
    return {
      primary: join(parent, "Projects"),
      legacy: [join(exeDir, "Projects")],
    };
  }
  return { primary: join(exeDir, "Projects"), legacy: [] };
}
