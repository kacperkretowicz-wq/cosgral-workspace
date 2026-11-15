/** WCAG relative luminance ratio for opaque computed rgb colors. */
export function contrastRatio(foreground: string, background: string): number {
  function luminance(color: string): number {
    const channels = color.match(/[\d.]+/g)?.map(Number);
    if (!color.startsWith("rgb") || !channels || channels.length !== 3)
      throw new Error("Expected an opaque computed rgb color.");
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  }
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
