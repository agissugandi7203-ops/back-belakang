// @ts-ignore
import { PDFParse } from 'pdf-parse';
// @ts-ignore
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

/**
 * Service untuk mengekstrak teks dari berbagai format file (PDF, DOCX, XLSX, TXT, MD)
 */
export async function extractTextFromFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  // 1. Plain Text / Markdown
  if (
    mimeType.startsWith('text/') || 
    extension === 'txt' || 
    extension === 'md' || 
    extension === 'markdown'
  ) {
    return buffer.toString('utf-8');
  }

  // 2. PDF
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    try {
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      return data.text || '';
    } catch (error: any) {
      throw new Error(`Gagal mengekstrak file PDF: ${error.message}`);
    }
  }

  // 3. Word (DOCX)
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
    extension === 'docx'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (error: any) {
      throw new Error(`Gagal mengekstrak file Word (DOCX): ${error.message}`);
    }
  }

  // 4. Excel (XLSX)
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
    extension === 'xlsx' || 
    extension === 'xls'
  ) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const sheetCsv = XLSX.utils.sheet_to_csv(worksheet);
        if (sheetCsv.trim()) {
          text += `Sheet: ${sheetName}\n${sheetCsv}\n\n`;
        }
      }
      return text.trim();
    } catch (error: any) {
      throw new Error(`Gagal mengekstrak file Excel: ${error.message}`);
    }
  }

  throw new Error(`Format file tidak didukung: ${mimeType} (.${extension})`);
}
