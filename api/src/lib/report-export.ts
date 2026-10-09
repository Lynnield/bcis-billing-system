import ExcelJS from "exceljs";
import pdfMake from "pdfmake";
import path from "node:path";

// This package compiles to CommonJS (see package.json "type": "commonjs"),
// so the ambient `require` is available directly — no import.meta needed.
const pdfmakeFontsDir = path.join(path.dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");

pdfMake.setFonts({
  Roboto: {
    normal: path.join(pdfmakeFontsDir, "Roboto-Regular.ttf"),
    bold: path.join(pdfmakeFontsDir, "Roboto-Medium.ttf"),
    italics: path.join(pdfmakeFontsDir, "Roboto-Italic.ttf"),
    bolditalics: path.join(pdfmakeFontsDir, "Roboto-MediumItalic.ttf"),
  },
});
// Reports are built entirely from our own DB-derived strings — never allow
// pdfmake to fetch a remote URL or read an arbitrary local file on the
// server's behalf. The only local path it legitimately needs is the bundled
// Roboto font directory set above.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((requestedPath) => requestedPath.startsWith(pdfmakeFontsDir));

export interface ReportColumn {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
}

export interface TabularReport {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number>>;
}

export async function buildXlsxBuffer(report: TabularReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BCIS Billing System";
  workbook.created = new Date();
  // Excel worksheet names are capped at 31 characters and may not contain
  // some punctuation; the report title can exceed that.
  const sheet = workbook.addWorksheet(report.title.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Report");

  sheet.columns = report.columns.map((c) => ({ header: c.header, key: c.key, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of report.rows) sheet.addRow(row);
  for (const col of report.columns) {
    if (col.align === "right") {
      sheet.getColumn(col.key).alignment = { horizontal: "right" };
      sheet.getColumn(col.key).numFmt = "#,##0.00";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildPdfBuffer(report: TabularReport): Promise<Buffer> {
  const body = [
    report.columns.map((c) => ({ text: c.header, style: "tableHeader" as const })),
    ...report.rows.map((row) =>
      report.columns.map((c) => ({
        text: String(row[c.key] ?? ""),
        alignment: c.align ?? ("left" as const),
      })),
    ),
  ];

  const docDefinition = {
    pageOrientation: report.columns.length > 6 ? "landscape" : "portrait",
    pageMargins: [36, 48, 36, 36] as [number, number, number, number],
    content: [
      { text: report.title, style: "title" },
      { text: `Generated ${new Date().toLocaleString()}`, style: "subtitle" },
      ...(report.subtitle ? [{ text: report.subtitle, style: "subtitle" }] : []),
      {
        table: {
          headerRows: 1,
          widths: report.columns.map(() => "*"),
          body,
        },
        layout: "lightHorizontalLines",
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 9, color: "#64748B", margin: [0, 0, 0, 2] },
      tableHeader: { bold: true, fillColor: "#F6F8FB" },
    },
    defaultStyle: { fontSize: 9 },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}

export function exportContentType(format: "pdf" | "xlsx"): string {
  return format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export function exportFilename(slug: string, format: "pdf" | "xlsx"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${date}.${format}`;
}
