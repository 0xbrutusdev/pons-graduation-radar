/** Walk a block span, splitting a range whose log query is too wide. */
export async function mapRange<T>(
  from: bigint,
  to: bigint,
  width: bigint,
  read: (from: bigint, to: bigint) => Promise<T[]>,
): Promise<T[]> {
  if (from > to) return [];
  const span = to - from + 1n;
  if (span <= width) {
    try {
      return await read(from, to);
    } catch (error) {
      if (from === to) throw error;
      const mid = from + (to - from) / 2n;
      return [...(await mapRange(from, mid, width, read)), ...(await mapRange(mid + 1n, to, width, read))];
    }
  }

  const rows: T[] = [];
  for (let cursor = from; cursor <= to; cursor += width) {
    const end = cursor + width - 1n > to ? to : cursor + width - 1n;
    rows.push(...(await mapRange(cursor, end, width, read)));
  }
  return rows;
}
