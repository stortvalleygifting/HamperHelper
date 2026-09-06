function escapeCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(fields, rows) {
  const lines = [fields.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(fields.map((f) => escapeCell(row[f])).join(','));
  }
  return lines.join('\r\n');
}
