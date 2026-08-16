import { useEffect, useMemo, useRef, useState } from "react";
import { downsamplePeaks } from "../domain/wavAmplitude";
import { amplitudeEnvelopeCache } from "../systems/AmplitudeEnvelopeCache";

type Props = {
  assetId: string;
  trimStart: number;
  duration: number;
  volume?: number;
  muted?: boolean;
  /** Bumps when envelopes finish loading. */
  revision: number;
  className?: string;
};

/** Compact amplitude bars for a Timeline audio clip (local WAV envelope). */
export function TimelineWaveform({
  assetId,
  trimStart,
  duration,
  volume = 1,
  muted = false,
  revision,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(120);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const update = () => {
      const next = Math.round(node.clientWidth);
      if (next > 0) setWidth(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const peaks = useMemo(() => {
    const envelope = amplitudeEnvelopeCache.get(assetId);
    if (!envelope) return null;
    const bars = Math.max(16, Math.min(160, Math.round(width / 3)));
    return downsamplePeaks(envelope, bars, Math.max(0, trimStart), Math.max(0.05, duration));
  }, [assetId, duration, revision, trimStart, width]);

  return (
    <div
      ref={hostRef}
      className={`timeline-waveform${muted ? " muted" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      {peaks ? (
        <svg viewBox={`0 0 ${peaks.length} 32`} preserveAspectRatio="none" className="timeline-waveform-svg">
          {peaks.map((value, index) => {
            const h = Math.max(1, value * Math.max(0.15, Math.min(1, volume)) * 28);
            return (
              <rect
                key={index}
                x={index + 0.15}
                y={16 - h / 2}
                width={0.7}
                height={h}
                rx={0.2}
              />
            );
          })}
        </svg>
      ) : (
        <span className="timeline-waveform-fallback">нет волны</span>
      )}
    </div>
  );
}
