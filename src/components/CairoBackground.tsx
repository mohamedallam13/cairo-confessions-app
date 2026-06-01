import { useState, useEffect, useRef } from "react";
import { PHASES, type Phase } from "../hooks/useTimePhase";

interface Props {
  phase: Phase;
}

export default function CairoBackground({ phase }: Props) {
  // Track previous phase for crossfade
  const [layers, setLayers] = useState({ bottom: phase, top: phase, topOpacity: 1 });
  const prevPhase = useRef(phase);

  useEffect(() => {
    if (prevPhase.current === phase) return;
    const from = prevPhase.current;
    prevPhase.current = phase;

    // Slide in new photo on top, fade old one out beneath
    setLayers({ bottom: from, top: phase, topOpacity: 0 });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLayers({ bottom: from, top: phase, topOpacity: 1 });
      });
    });
  }, [phase]);

  const bottomTokens = PHASES[layers.bottom];
  const topTokens = PHASES[layers.top];
  const currentTokens = PHASES[phase];

  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    >
      {/* Bottom layer — outgoing photo */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${bottomTokens.photo})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: bottomTokens.photoFilter,
        }}
      />

      {/* Top layer — incoming photo, fades in */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${topTokens.photo})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: topTokens.photoFilter,
          opacity: layers.topOpacity,
          transition: "opacity 2.5s ease, filter 2.5s ease",
        }}
      />

      {/* Atmospheric gradient overlay — driven by current phase, not crossfade layers */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: currentTokens.overlayGradient,
          transition: "background 2.5s ease",
        }}
      />
    </div>
  );
}
