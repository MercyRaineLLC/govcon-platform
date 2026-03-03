// =============================================================
// Document Analysis Service
// Claude API via fetch — SOW scope analysis for probability enrichment
// =============================================================
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { DocumentAnalysisResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const ANALYSIS_PROMPT = `You are a federal contracting intelligence analyst. Analyze this government contract document (SOW, amendment, or solicitation) and return a structured JSON analysis.

Return ONLY valid JSON with this exact structure — no markdown, no preamble:
{
  "scopeKeywords": ["keyword1", "keyword2"],
  "complexityScore": 0.0,
  "alignmentScore": 0.5,
  "incumbentSignals": ["signal1"],
  "certificationRequirements": ["cert1"],
  "recompeteSignals": ["signal1"],
  "competitivenessAssessment": "open",
  "analysisConfidence": 0.8,
  "summary": "brief summary"
}

Scoring guidance:
- complexityScore (0-1): 0=simple commodity, 1=highly specialized technical
- alignmentScore (0-1): how well this SOW aligns with a general small business/SDVOSB
- analysisConfidence (0-1): confidence given document quality
- incumbentSignals: text suggesting an existing contractor (transition language, bridge contract language)
- recompeteSignals: text suggesting recompete (option years, re-solicitation, follow-on language)
- competitivenessAssessment: one of "open", "moderate", "restricted"

Document to analyze:`;

export class DocumentAnalysisService {
  async analyzeDocument(
    filePath: string,
    opportunityContext?: {
      title?: string;
      agency?: string;
      naicsCode?: string;
      clientNaicsCodes?: string[];
      clientCertifications?: string[];
    }
  ): Promise<DocumentAnalysisResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn('ANTHROPIC_API_KEY not set — skipping document analysis');
      return this.defaultResult();
    }

    try {
      const ext = path.extname(filePath).toLowerCase();
      let content: string;

      if (ext === '.pdf') {
        content = await this.extractPdfText(filePath);
      } else {
        content = fs.readFileSync(filePath, 'utf-8');
      }

      if (!content || content.trim().length < 100) {
        logger.warn('Document too short for analysis', { filePath });
        return this.defaultResult();
      }

      const truncated = content.substring(0, 50000);

      let contextBlock = '';
      if (opportunityContext) {
        contextBlock = `\n\nOpportunity context:
- Title: ${opportunityContext.title || 'Unknown'}
- Agency: ${opportunityContext.agency || 'Unknown'}
- NAICS: ${opportunityContext.naicsCode || 'Unknown'}
- Client NAICS codes: ${opportunityContext.clientNaicsCodes?.join(', ') || 'Unknown'}
- Client certifications: ${opportunityContext.clientCertifications?.join(', ') || 'Unknown'}\n`;
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: `${ANALYSIS_PROMPT}${contextBlock}\n\n${truncated}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('Claude API error', { status: response.status, body: errText });
        return this.defaultResult();
      }

      const data = await response.json() as any;
      const rawText: string = data.content
        ?.filter((b: any) => b.type === 'text')
        ?.map((b: any) => b.text)
        ?.join('') || '';

      const parsed = this.parseResponse(rawText);
      return this.buildResult(parsed);
    } catch (err) {
      logger.error('Document analysis failed', { filePath, error: (err as Error).message });
      return this.defaultResult();
    }
  }

  computeAlignmentScore(
    analysis: DocumentAnalysisResult,
    clientProfile: {
      naicsCodes: string[];
      certifications: string[];
      capabilities?: string[];
    }
  ): number {
    let score = analysis.alignmentScore ?? 0.5;

    if (clientProfile.capabilities && clientProfile.capabilities.length > 0) {
      const scopeText = analysis.scopeKeywords.join(' ').toLowerCase();
      const matchCount = clientProfile.capabilities.filter((cap: string) =>
        scopeText.includes(cap.toLowerCase())
      ).length;
      const overlapRatio = matchCount / clientProfile.capabilities.length;
      score += overlapRatio * 0.3;
    }

    const certReqs: string[] = (analysis.rawAnalysis?.certificationRequirements as string[]) || [];
    if (certReqs.length > 0 && clientProfile.certifications.length > 0) {
      const certMatch = clientProfile.certifications.some((cert: string) =>
        certReqs.some((req: string) => req.toLowerCase().includes(cert.toLowerCase()))
      );
      if (certMatch) score += 0.1;
    }

    if (analysis.complexityScore > 0.8) score -= 0.1;
    if (analysis.incumbentSignals.length > 0) score -= 0.15;

    return Math.max(0, Math.min(1, score));
  }

  private async extractPdfText(filePath: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch {
      const buffer = fs.readFileSync(filePath);
      return buffer.toString('utf-8', 0, Math.min(buffer.length, 100000));
    }
  }

  private parseResponse(raw: string): Record<string, unknown> {
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      logger.warn('Failed to parse Claude JSON response');
      return {};
    }
  }

  private buildResult(parsed: Record<string, unknown>): DocumentAnalysisResult {
    return {
      scopeKeywords: Array.isArray(parsed.scopeKeywords) ? parsed.scopeKeywords as string[] : [],
      complexityScore: typeof parsed.complexityScore === 'number'
        ? Math.max(0, Math.min(1, parsed.complexityScore))
        : 0.5,
      alignmentScore: typeof parsed.alignmentScore === 'number'
        ? Math.max(0, Math.min(1, parsed.alignmentScore))
        : 0.5,
      incumbentSignals: Array.isArray(parsed.incumbentSignals) ? parsed.incumbentSignals as string[] : [],
      rawAnalysis: parsed,
    };
  }

  private defaultResult(): DocumentAnalysisResult {
    return {
      scopeKeywords: [],
      complexityScore: 0.5,
      alignmentScore: 0.5,
      incumbentSignals: [],
      rawAnalysis: {},
    };
  }
}

export const documentAnalysisService = new DocumentAnalysisService();