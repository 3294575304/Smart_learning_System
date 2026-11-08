export function schoolIdentityLayout(
  width: number,
  ratio: number,
  compact: boolean,
) {
  // Keep breathing room inside the existing header cell, including for long names.
  const available = Math.min(216, Math.max(1, width - 16));
  const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 4;
  const logoSize = compact
    ? aspect > 8
      ? 32
      : aspect > 5
        ? 36
        : 40
    : aspect > 8
      ? 36
      : aspect > 5
        ? 38
        : 44;
  const gap = aspect >= 8 ? 12 : 14;
  const nameWidth = Math.min(
    Math.max(1, available - logoSize - gap),
    aspect * 30,
  );
  return { logoSize, gap, nameWidth, nameHeight: nameWidth / aspect };
}
