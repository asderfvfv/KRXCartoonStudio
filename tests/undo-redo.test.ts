import { describe, expect, it } from "vitest";
import { formatExportUserError } from "../src/domain/exportErrors";
import { UndoRedoManager } from "../src/systems/UndoRedoManager";

describe("UndoRedoManager", () => {
  it("undoes and redoes one committed drag as one operation", () => {
    const history = new UndoRedoManager({ x: 0, y: 0 });
    history.commit({ x: 120, y: 45 }, "move drag");
    expect(history.peekUndoLabel()).toBe("move drag");
    expect(history.undo()).toEqual({ x: 0, y: 0 });
    expect(history.redo()).toEqual({ x: 120, y: 45 });
  });

  it("clears redo history after a new operation", () => {
    const history = new UndoRedoManager({ value: 0 });
    history.commit({ value: 1 }, "one");
    history.undo();
    history.commit({ value: 2 }, "two");
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toEqual({ value: 2 });
  });

  it("coalesces rapid commits with the same label", () => {
    const history = new UndoRedoManager({ n: 0 });
    history.commit({ n: 1 }, "Part rotation");
    history.commit({ n: 2 }, "Part rotation");
    history.commit({ n: 3 }, "Part rotation");
    expect(history.undo()).toEqual({ n: 0 });
    expect(history.canUndo()).toBe(false);
  });

  it("forceNew always pushes a history step", () => {
    const history = new UndoRedoManager({ n: 0 });
    history.commit({ n: 1 }, "drag", { forceNew: true });
    history.commit({ n: 2 }, "drag", { forceNew: true });
    expect(history.undo()).toEqual({ n: 1 });
    expect(history.undo()).toEqual({ n: 0 });
  });

  it("caps history length", () => {
    const history = new UndoRedoManager({ n: 0 }, undefined, 3);
    history.commit({ n: 1 }, "a", { forceNew: true });
    history.commit({ n: 2 }, "b", { forceNew: true });
    history.commit({ n: 3 }, "c", { forceNew: true });
    history.commit({ n: 4 }, "d", { forceNew: true });
    expect(history.undo()).toEqual({ n: 3 });
    expect(history.undo()).toEqual({ n: 2 });
    expect(history.undo()).toEqual({ n: 1 });
    expect(history.canUndo()).toBe(false);
  });
});

describe("formatExportUserError", () => {
  it("explains missing ffmpeg", () => {
    const text = formatExportUserError("FFmpeg not found");
    expect(text.toLowerCase()).toContain("ffmpeg");
    expect(text).toContain("Что делать:");
  });

  it("appends log path", () => {
    const text = formatExportUserError("encode failed", { logPath: "C:/tmp/ffmpeg.log" });
    expect(text).toContain("C:/tmp/ffmpeg.log");
  });
});
