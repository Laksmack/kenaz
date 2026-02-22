export interface DetectedField {
  id: string;
  label: string;
  page: number;
  lineNumber: number;
  matchedText: string;
  suggestedType: 'company' | 'address' | 'date' | 'name' | 'title' | 'signature' | 'generic';
}

const FIELD_PATTERNS: { pattern: RegExp; type: DetectedField['suggestedType']; label: string }[] = [
  { pattern: /\[company\s*name\]/i, type: 'company', label: 'Company Name' },
  { pattern: /\[company\]/i, type: 'company', label: 'Company' },
  { pattern: /\[address\]/i, type: 'address', label: 'Address' },
  { pattern: /\[city,?\s*state,?\s*zip\]/i, type: 'address', label: 'City, State, ZIP' },
  { pattern: /\[date\]/i, type: 'date', label: 'Date' },
  { pattern: /\[effective\s*date\]/i, type: 'date', label: 'Effective Date' },
  { pattern: /\[name\]/i, type: 'name', label: 'Name' },
  { pattern: /\[signatory\s*name\]/i, type: 'name', label: 'Signatory Name' },
  { pattern: /\[printed?\s*name\]/i, type: 'name', label: 'Printed Name' },
  { pattern: /\[title\]/i, type: 'title', label: 'Title' },
  { pattern: /\[signature\]/i, type: 'signature', label: 'Signature' },
  { pattern: /\[insert[^[\]]*\]/i, type: 'generic', label: 'Insert Field' },
  { pattern: /_{5,}/, type: 'generic', label: 'Fill-in Field' },
  { pattern: /\[\s*\]/, type: 'generic', label: 'Checkbox/Field' },
  { pattern: /\[___+\]/, type: 'generic', label: 'Blank Field' },
];

export function detectPdfFields(pdfText: string): DetectedField[] {
  const fields: DetectedField[] = [];
  let fieldCounter = 0;

  // Split by page markers from our text extraction
  const pageBlocks = pdfText.split(/---\s*Page\s+(\d+).*?---/);

  let currentPage = 0;
  for (let i = 0; i < pageBlocks.length; i++) {
    const block = pageBlocks[i];

    // Check if this block is a page number
    const pageNum = parseInt(block);
    if (!isNaN(pageNum) && pageNum > 0) {
      currentPage = pageNum - 1;
      continue;
    }

    if (!block.trim()) continue;

    const lines = block.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (const { pattern, type, label } of FIELD_PATTERNS) {
        const match = pattern.exec(line);
        if (match) {
          fieldCounter++;
          fields.push({
            id: `field-${fieldCounter}`,
            label,
            page: currentPage,
            lineNumber: lineIdx,
            matchedText: match[0],
            suggestedType: type,
          });
        }
      }
    }
  }

  return fields;
}
