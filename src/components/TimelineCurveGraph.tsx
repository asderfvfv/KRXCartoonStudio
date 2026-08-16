import { useMemo } from "react";
import type { EasingName, Keyframe } from "../domain/types";
import { EASING_LABELS_RU, sampleEasingCurve, sampleKeyframeCurve } from "../domain/gestureLibrary";

const EASINGS: EasingName[] = ["linear", "easeIn", "easeOut", "easeInOut"];

interface TimelineCurveGraphProps {
  keyframes: Keyframe[];
  selectedKeyId: string | null;
  duration: number;
  playhead: number;
  selectedEasing: EasingName;
  onSeek(time: number): void;
  onChangeEasing(easing: EasingName): void;
}

function MiniEasingIcon({ name, active }: { name: EasingName; active: boolean }) {
  const samples = useMemo(() => sampleEasingCurve(name, 12), [name]);
  const w = 36;
  const h = 22;
  const pad = 2;
  const points = samples
    .map((sample, index) => {
      const x = pad + (sample.t * (w - pad * 2));
      const y = h - pad - (sample.v * (h - pad * 2));
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={active ? "easing-mini active" : "easing-mini"}>
      <path d={points} fill="none" stroke={active ? "#f2c75c" : "#8a949b"} strokeWidth={1.5} />
    </svg>
  );
}

export function TimelineCurveGraph({
  keyframes,
  selectedKeyId,
  duration,
  playhead,
  selectedEasing,
  onSeek,
  onChangeEasing,
}: TimelineCurveGraphProps) {
  const curve = useMemo(() => sampleKeyframeCurve(keyframes, 48), [keyframes]);
  const sorted = useMemo(() => [...keyframes].sort((a, b) => a.time - b.time), [keyframes]);

  const width = 320;
  const height = 72;
  const padX = 10;
  const padY = 8;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const values = curve.map((p) => p.v);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const spanV = Math.abs(maxV - minV) < 1e-6 ? 1 : maxV - minV;
  const t0 = sorted[0]?.time ?? 0;
  const t1 = sorted.at(-1)?.time ?? Math.max(duration, 0.01);
  const spanT = Math.max(1e-6, t1 - t0);

  const toX = (t: number) => padX + ((t - t0) / spanT) * innerW;
  const toY = (v: number) => padY + (1 - (v - minV) / spanV) * innerH;

  const path = curve
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point.t).toFixed(1)} ${toY(point.v).toFixed(1)}`)
    .join(" ");

  const playX = toX(Math.max(t0, Math.min(t1, playhead)));

  return (
    <div className="timeline-curve-graph">
      <div className="timeline-curve-easing">
        {EASINGS.map((name) => (
          <button
            key={name}
            type="button"
            className={selectedEasing === name ? "active" : ""}
            title={EASING_LABELS_RU[name]}
            onClick={() => onChangeEasing(name)}
          >
            <MiniEasingIcon name={name} active={selectedEasing === name} />
            <span>{EASING_LABELS_RU[name]}</span>
          </button>
        ))}
      </div>
      <svg
        className="timeline-curve-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Кривая ключей"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, (x - padX) / innerW));
          onSeek(t0 + ratio * spanT);
        }}
      >
        <rect x={0} y={0} width={width} height={height} fill="#15191c" rx={3} />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#2c3338" strokeWidth={1} />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#2c3338" strokeWidth={1} />
        {path && <path d={path} fill="none" stroke="#72c3cb" strokeWidth={1.8} />}
        <line x1={playX} y1={padY} x2={playX} y2={height - padY} stroke="#f2c75c" strokeWidth={1} strokeDasharray="3 2" />
        {sorted.map((key) => {
          const selected = key.id === selectedKeyId;
          return (
            <circle
              key={key.id}
              cx={toX(key.time)}
              cy={toY(key.value)}
              r={selected ? 4.5 : 3.2}
              fill={selected ? "#f2c75c" : "#d9e3e8"}
              stroke="#101418"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <small className="timeline-curve-hint">Клик по графику = ползунок · easing выбранного ключа</small>
    </div>
  );
}
