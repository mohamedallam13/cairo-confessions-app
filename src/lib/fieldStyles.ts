import type { CSSProperties } from "react";

// Shared glass field style — used across all pages for cards, textareas, inputs
export const fieldStyle: CSSProperties = {
  background: "rgba(10,12,14,0.55)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "20px",
  backdropFilter: "blur(20px)",
};

export const fieldWithPadding: CSSProperties = {
  ...fieldStyle,
  padding: "24px",
};

export const inputStyle: CSSProperties = {
  ...fieldStyle,
  borderRadius: "14px",
  padding: "14px 18px",
};
