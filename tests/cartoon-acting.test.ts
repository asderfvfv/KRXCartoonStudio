import { describe, expect, it } from "vitest";
import { emotionFromDialogue, gestureFromDialogue, applyDialogueActing, applyCartoonCamera } from "../src/domain/cartoonActing";
import { createDefaultProject } from "../src/domain/defaults";
import { parseCartoonPrompt, planToScript, enrichScenesFromPromptPlan } from "../src/domain/promptCartoon";
import { buildCartoonFromScript, parseCartoonScript } from "../src/domain/scriptCartoon";

describe("cartoon acting from prompt lines", () => {
  it("maps greetings to Wave and cheers to Happy", () => {
    expect(gestureFromDialogue("Эй, Морозко! Привет!")).toBe("Wave");
    expect(gestureFromDialogue("Ура! Мы на месте!")).toBe("Happy");
    expect(gestureFromDialogue("Это был торт? Ха-ха!")).toBe("Laugh");
    expect(gestureFromDialogue("Ты меня не слушал!")).toBe("Angry");
  });

  it("picks TTS emotion from the line, not always excited", () => {
    expect(emotionFromDialogue("Ура!")).toBe("happy");
    expect(emotionFromDialogue("Мне страшно.")).toBe("scared");
    expect(emotionFromDialogue("Пойдём дальше.", "calm")).toBe("neutral");
    expect(emotionFromDialogue("Карта говорит — туда!", "adventure")).toBe("excited");
  });

  it("adds LookAt for listeners and camera tracks after enrich", () => {
    const plan = parseCartoonPrompt(`# Тест
Characters: Огонёк, Морозко
## Поляна
Огонёк: Привет!
Морозко: Пошли!
`);
    const project = createDefaultProject();
    const base = project.characters[0]!;
    project.characters = [
      { ...base, id: "c1", name: "Огонёк" },
      { ...base, id: "c2", name: "Морозко" },
    ];
    const parsed = parseCartoonScript(planToScript(plan));
    const built = buildCartoonFromScript(project, parsed, {
      mapping: { Огонёк: "c1", Морозко: "c2" },
      width: 1920,
      height: 1080,
      ttsClips: [{ sceneIndex: 0, lineIndex: 0, path: "C:/tmp/a.wav", duration: 1.2 }],
    });
    expect(built.project.scenes![0]!.dialogues![0]!.audioPath).toContain("a.wav");
    const enriched = enrichScenesFromPromptPlan(built.project, plan);
    const scene = enriched.scenes![0]!;
    expect(scene.actionSequence.some((action) => action.type === "LookAt")).toBe(true);
    expect(scene.actionSequence.some((action) => action.type === "Wave")).toBe(true);
    expect(scene.generatedTimeline?.cameraTracks.some((track) => track.property === "zoom")).toBe(true);
  });

  it("applyDialogueActing is a no-op without actors", () => {
    const scene = createDefaultProject().scenes![0]!;
    scene.actors = [];
    scene.dialogues = [];
    applyDialogueActing(scene);
    applyCartoonCamera(scene, "calm", 0);
    expect(scene.generatedTimeline?.cameraTracks.length).toBeGreaterThan(0);
  });
});
