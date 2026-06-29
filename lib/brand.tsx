/** Shared full-bleed brand mark used to generate app icons via next/og. */
export function BrandMark(size: number) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f766e",
        color: "white",
        fontFamily: "sans-serif",
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        letterSpacing: -2,
      }}
    >
      we
    </div>
  );
}
