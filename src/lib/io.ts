// Export/import utilities: CSV, Excel-compatible CSV, print-to-PDF, JSON backup, bulk CSV import.

type Row = Record<string, unknown>;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportCSV(rows: Row[], columns: { key: string; label: string }[], filename: string) {
  const lines = [
    columns.map((c) => csvEscape(c.label)).join(';'),
    ...rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(';')),
  ];
  download(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

// Excel opens this natively (SpreadsheetML)
export function exportExcel(rows: Row[], columns: { key: string; label: string }[], filename: string) {
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const header = columns.map((c) => `<Cell><Data ss:Type="String">${esc(c.label)}</Data></Cell>`).join('');
  const body = rows
    .map((r) =>
      `<Row>${columns
        .map((c) => {
          const v = r[c.key];
          if (typeof v === 'number' && isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
          return `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
        })
        .join('')}</Row>`
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Export"><Table>${header ? `<Row>${header}</Row>` : ''}${body}</Table></Worksheet></Workbook>`;
  download(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${filename}.xls`);
}

export function exportJSON(data: unknown, filename: string) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${filename}.json`);
}

// Print-to-PDF: opens a print window with a formatted table; the user saves as PDF.
export function exportPDF(title: string, rows: Row[], columns: { key: string; label: string }[]) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const esc = (s: unknown) => String(s ?? '').replace(/</g, '&lt;');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1e293b; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .date { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #0f172a; color: white; text-align: left; padding: 8px 10px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${esc(title)}</h1>
<div class="date">YOS360 — généré le ${new Date().toLocaleString('fr-FR')}</div>
<table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody>
</table>
<script>window.onload = function() { window.print(); };</script>
</body></html>`);
  w.document.close();
  return true;
}

// Parse a CSV file (semicolon or comma separated, headers on first row).
// Returns rows keyed by header name.
export function parseCSV(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split('\n')[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}
