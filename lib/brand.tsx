/**
 * Shared full-bleed brand mark used to generate app icons via next/og.
 * Two overlapping location pins — "where we (both) are" — kept inside the
 * middle ~70% of the canvas so it survives maskable-icon cropping.
 */
export function BrandMark(size: number) {
  const pin = Math.round(size * 0.34);
  const pinStyle = (background: string) =>
    ({
      position: "absolute",
      width: pin,
      height: pin,
      borderRadius: "50% 50% 50% 0",
      background,
      transform: "rotate(-45deg)",
    }) as const;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%)",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: Math.round(size * 0.62),
          height: Math.round(size * 0.62),
        }}
      >
        <div
          style={{
            ...pinStyle("#ffffff"),
            left: 0,
            top: Math.round(size * 0.04),
          }}
        />
        <div
          style={{
            ...pinStyle("#fbbf24"),
            right: 0,
            bottom: 0,
          }}
        />
      </div>
    </div>
  );
}
