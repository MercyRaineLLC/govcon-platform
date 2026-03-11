import fs from 'fs'
import path from 'path'

const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL ADDRESS]' },
  { pattern: /https?:\/\/[^\s<>"]+/g, replacement: '[WEBSITE]' },
  { pattern: /www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[WEBSITE]' },
  { pattern: /\b[A-Z0-9]{4,6}-\d{2}-[A-Z]-\d{4,5}\b/g, replacement: '[CONTRACT NUMBER]' },
]

function scrubText(text: string, companyName: string): { result: string; count: number } {
  let result = text
  let count = 0

  // Replace company name first (case-insensitive)
  if (companyName && companyName.trim().length > 2) {
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const nameRe = new RegExp(escaped, 'gi')
    const before = result
    result = result.replace(nameRe, '[COMPANY NAME]')
    if (result !== before) count++
  }

  // Apply all other redaction rules
  for (const rule of REDACTION_RULES) {
    rule.pattern.lastIndex = 0
    const before = result
    result = result.replace(rule.pattern, rule.replacement)
    if (result !== before) count++
  }

  return { result, count }
}

export async function anonymizeDocument(
  inputPath: string,
  outputPath: string,
  companyName: string,
): Promise<{ patternsReplaced: number; outputPath: string }> {
  const ext = path.extname(inputPath).toLowerCase()
  let rawText: string

  if (ext === '.txt' || ext === '.md') {
    rawText = fs.readFileSync(inputPath, 'utf-8')
  } else if (ext === '.docx') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth')
    const r = await mammoth.extractRawText({ path: inputPath })
    rawText = r.value
  } else {
    throw new Error('Unsupported file type. Please upload .docx or .txt files.')
  }

  const { result: anonymized, count } = scrubText(rawText, companyName)
  const finalPath = outputPath.replace(/\.[^.]+$/, '.txt')
  fs.writeFileSync(finalPath, anonymized, 'utf-8')
  return { patternsReplaced: count, outputPath: finalPath }
}
