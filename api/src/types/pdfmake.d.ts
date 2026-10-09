// pdfmake 0.3.x ships no TypeScript types of its own, and the community
// @types/pdfmake package targets the older PdfPrinter-class API, not the
// current setFonts()/createPdf() singleton API this app actually uses.
// Minimal ambient declaration covering only what report-export.ts calls.
declare module "pdfmake" {
  interface PdfMakeFontDescriptor {
    normal: string;
    bold?: string;
    italics?: string;
    bolditalics?: string;
  }

  interface PdfMakeDocument {
    getBuffer(): Promise<Buffer>;
  }

  interface PdfMakeInstance {
    setFonts(fonts: Record<string, PdfMakeFontDescriptor>): void;
    createPdf(docDefinition: Record<string, unknown>): PdfMakeDocument;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
  }

  const pdfMake: PdfMakeInstance;
  export default pdfMake;
}
