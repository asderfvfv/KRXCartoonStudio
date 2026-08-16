import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../src/domain/defaults";
import { createId } from "../src/domain/ids";
import { migrateProject } from "../src/domain/migration";
import {
  applyEpisodeTemplateToProject,
  buildEpisodesFromTemplate,
  buildSceneFromTemplate,
  episodeTemplates,
  sceneTemplates,
} from "../src/domain/templates";

describe("Scene / episode templates", () => {
  it("lists built-in scene and episode templates", () => {
    expect(sceneTemplates.map((item) => item.id)).toEqual(["empty", "solo", "duo", "dialogue", "action"]);
    expect(episodeTemplates.map((item) => item.id)).toEqual(["blank", "single", "per-scene", "intro-main-outro"]);
  });

  it("builds scene templates from project characters", () => {
    const project = migrateProject(createDefaultProject("Tpl"));
    const ctx = {
      name: "S",
      width: 1920,
      height: 1080,
      characters: project.characters,
      background: "#abc",
    };

    expect(buildSceneFromTemplate("empty", ctx).actors).toHaveLength(0);

    const solo = buildSceneFromTemplate("solo", ctx);
    expect(solo.actors).toHaveLength(1);
    expect(solo.actors[0].position.x).toBe(960);

    const duo = buildSceneFromTemplate("duo", ctx);
    expect(duo.actors).toHaveLength(2);
    expect(duo.actors[0].facingDirection).toBe("Right");
    expect(duo.actors[1].facingDirection).toBe("Left");

    const dialogue = buildSceneFromTemplate("dialogue", ctx);
    expect(dialogue.actors).toHaveLength(2);
    expect(dialogue.dialogues?.length).toBe(2);
    expect(dialogue.subtitleSettings?.enabled).toBe(true);
    expect(dialogue.duration).toBeGreaterThan(6);

    const action = buildSceneFromTemplate("action", ctx);
    expect(action.actionSequence.map((item) => item.type)).toEqual(["Enter", "WalkTo", "Wave", "Idle"]);
    expect(action.generatedTimeline?.actorTracks.length).toBeGreaterThan(0);
    expect(action.duration).toBe(action.generatedTimeline!.duration);
  });

  it("builds episode templates and applies them to a project", () => {
    const project = migrateProject(createDefaultProject("SeriesTpl"));
    const a = project.scenes![0];
    const b = structuredClone(a);
    b.id = createId("scene");
    b.name = "Mid";
    const c = structuredClone(a);
    c.id = createId("scene");
    c.name = "End";
    project.scenes = [a, b, c];

    expect(buildEpisodesFromTemplate("blank", project.scenes)).toHaveLength(1);
    expect(buildEpisodesFromTemplate("per-scene", project.scenes).map((ep) => ep.sceneIds)).toEqual([
      [a.id],
      [b.id],
      [c.id],
    ]);

    const intro = buildEpisodesFromTemplate("intro-main-outro", project.scenes);
    expect(intro.map((ep) => ep.title)).toEqual(["Intro", "Main", "Outro"]);
    expect(intro[0].sceneIds).toEqual([a.id]);
    expect(intro[1].sceneIds).toEqual([b.id]);
    expect(intro[2].sceneIds).toEqual([c.id]);

    const next = applyEpisodeTemplateToProject(project, "per-scene");
    expect(next.series!.episodes).toHaveLength(3);
    expect(next.series!.episodes[1].title).toBe("Mid");
  });
});
