import { inferImportField, mapContentTables, type ContentImportTable } from "./content-import-columns";

function delimitedRecords(text: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [], cell = "", quoted = false, line = 1, startLine = 1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && (quoted || cell === "")) {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (char === "\t" && !quoted) { cells.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      cells.push(cell); if (cells.some((value) => value.trim())) records.push({ line: startLine, cells });
      cell = ""; cells = []; line++; startLine = line;
    } else { cell += char; if (char === "\n") line++; }
  }
  if (quoted) throw new Error("The pasted table contains an unclosed quoted cell.");
  cells.push(cell); if (cells.some((value) => value.trim())) records.push({ line: startLine, cells });
  return records;
}
function markdownCells(line: string): string[] {
  const text = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return text.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|").replace(/<br\s*\/?\s*>/gi, "\n").replace(/&#124;/g, "|"));
}
export function tableFromRecords(records: Array<{ line: number; cells: string[] }>, source: string, forceHeader = false): ContentImportTable {
  if (!records.length) return { source, headers: [], mapping: [], rows: [] };
  const first = records[0].cells;
  const mapping = first.map(inferImportField);
  const width = Math.max(...records.map((row) => row.cells.length));
  const hasHeader = forceHeader || mapping.some(Boolean) || width > 1;
  const headers = hasHeader ? first : ["Name"];
  const overflow = hasHeader && records.slice(1).find((row) => row.cells.slice(headers.length).some((cell) => cell.trim()));
  if (overflow) throw new Error(`${source}, row ${overflow.line}: values extend beyond the header columns. Add the missing column headings.`);
  return { source, headers, mapping: hasHeader ? mapping : ["label"], rows: hasHeader ? records.slice(1) : records };
}
export function parseContentTables(text: string, source = "Pasted input", requireMarkdown = false): ContentImportTable[] {
  if (text.length > 5 * 1024 * 1024) throw new Error("Keep input below 5 MiB.");
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const separator = (line: string) => markdownCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
  const markdownStart = lines.findIndex((line, index) => index > 0 && line.includes("|") && separator(line));
  if (markdownStart < 0) {
    if (requireMarkdown || (!text.includes("\t") && lines.some((line) => /^\s*\|/.test(line)))) throw new Error("Use a Markdown table with a header row and a separator row such as | --- | --- |.");
    const table = tableFromRecords(delimitedRecords(normalized), source);
    if (table.rows.length > 5000) throw new Error("Import at most 5,000 content rows at a time.");
    return [table];
  }
  const tables: ContentImportTable[] = [];
  for (let index = 1; index < lines.length; index++) {
    if (!lines[index].includes("|") || !separator(lines[index])) continue;
    const records = [{ line: index, cells: markdownCells(lines[index - 1]) }];
    let next = index + 1;
    while (next < lines.length && lines[next].trim().includes("|")) {
      const cells = markdownCells(lines[next]);
      if (cells.length !== records[0].cells.length) throw new Error(`${source}, row ${next + 1}: column count does not match the Markdown header. Escape literal pipes as \\|.`);
      records.push({ line: next + 1, cells }); next++;
    }
    tables.push(tableFromRecords(records, `${source} (table ${tables.length + 1})`, true));
    index = next;
  }
  if (tables.reduce((total, table) => total + table.rows.length, 0) > 5000) throw new Error("Import at most 5,000 content rows at a time.");
  return tables;
}
export function parseContentText(text: string, kind = "lexical") { return mapContentTables(parseContentTables(text), kind); }
