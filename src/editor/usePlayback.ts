import { useEffect, useRef } from "react";
import { useEditor } from "./EditorContext";

export function usePlayback(): void {
  const { playing, setPlaying, time, setTime, sceneTime, playbackDuration, loop, currentScene, project, projectPath, audioEngine } = useEditor();
  const timeRef = useRef(time);
  const previous = useRef<number | null>(null);
  useEffect(() => { timeRef.current = time; }, [time]);

  useEffect(() => {
    audioEngine.configure(project.audioAssets ?? [], (assetPath) => {
      if (typeof window !== "undefined" && window.kcs) return window.kcs.readAsset(assetPath, projectPath);
      return Promise.resolve(assetPath);
    });
  }, [audioEngine, project.audioAssets, projectPath]);

  useEffect(() => {
    void audioEngine.sync(currentScene.audioTracks, sceneTime, playing);
  }, [audioEngine, currentScene.audioTracks, playing, sceneTime]);

  useEffect(() => {
    if (!playing) { previous.current = null; return; }
    let frame = 0;
    const tick = (stamp: number) => {
      const delta = previous.current === null ? 0 : (stamp - previous.current) / 1000;
      previous.current = stamp;
      let next = timeRef.current + delta;
      if (next >= playbackDuration) {
        if (loop && playbackDuration > 0) next %= playbackDuration;
        else { next = playbackDuration; setPlaying(false); }
      }
      timeRef.current = next;
      setTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loop, playbackDuration, playing, setPlaying, setTime]);
}
