"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentAnalysisService = exports.DocumentAnalysisService = void 0;
// =============================================================
// Document Analysis Service
// Claude API via fetch — SOW scope analysis for probability enrichment
// =============================================================
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
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
class DocumentAnalysisService {
    async analyzeDocument(filePath, opportunityContext) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            logger_1.logger.warn('ANTHROPIC_API_KEY not set — skipping document analysis');
            return this.defaultResult();
        }
        try {
            const ext = path.extname(filePath).toLowerCase();
            let content;
            if (ext === '.pdf') {
                content = await this.extractPdfText(filePath);
            }
            else {
                content = fs.readFileSync(filePath, 'utf-8');
            }
            if (!content || content.trim().length < 100) {
                logger_1.logger.warn('Document too short for analysis', { filePath });
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
                logger_1.logger.error('Claude API error', { status: response.status, body: errText });
                return this.defaultResult();
            }
            const data = await response.json();
            const rawText = data.content
                ?.filter((b) => b.type === 'text')
                ?.map((b) => b.text)
                ?.join('') || '';
            const parsed = this.parseResponse(rawText);
            return this.buildResult(parsed);
        }
        catch (err) {
            logger_1.logger.error('Document analysis failed', { filePath, error: err.message });
            return this.defaultResult();
        }
    }
    computeAlignmentScore(analysis, clientProfile) {
        let score = analysis.alignmentScore ?? 0.5;
        if (clientProfile.capabilities && clientProfile.capabilities.length > 0) {
            const scopeText = analysis.scopeKeywords.join(' ').toLowerCase();
            const matchCount = clientProfile.capabilities.filter((cap) => scopeText.includes(cap.toLowerCase())).length;
            const overlapRatio = matchCount / clientProfile.capabilities.length;
            score += overlapRatio * 0.3;
        }
        const certReqs = analysis.rawAnalysis?.certificationRequirements || [];
        if (certReqs.length > 0 && clientProfile.certifications.length > 0) {
            const certMatch = clientProfile.certifications.some((cert) => certReqs.some((req) => req.toLowerCase().includes(cert.toLowerCase())));
            if (certMatch)
                score += 0.1;
        }
        if (analysis.complexityScore > 0.8)
            score -= 0.1;
        if (analysis.incumbentSignals.length > 0)
            score -= 0.15;
        return Math.max(0, Math.min(1, score));
    }
    async extractPdfText(filePath) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            const buffer = fs.readFileSync(filePath);
            const data = await pdfParse(buffer);
            return data.text || '';
        }
        catch {
            const buffer = fs.readFileSync(filePath);
            return buffer.toString('utf-8', 0, Math.min(buffer.length, 100000));
        }
    }
    parseResponse(raw) {
        try {
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleaned);
        }
        catch {
            logger_1.logger.warn('Failed to parse Claude JSON response');
            return {};
        }
    }
    buildResult(parsed) {
        return {
            scopeKeywords: Array.isArray(parsed.scopeKeywords) ? parsed.scopeKeywords : [],
            complexityScore: typeof parsed.complexityScore === 'number'
                ? Math.max(0, Math.min(1, parsed.complexityScore))
                : 0.5,
            alignmentScore: typeof parsed.alignmentScore === 'number'
                ? Math.max(0, Math.min(1, parsed.alignmentScore))
                : 0.5,
            incumbentSignals: Array.isArray(parsed.incumbentSignals) ? parsed.incumbentSignals : [],
            rawAnalysis: parsed,
        };
    }
    defaultResult() {
        return {
            scopeKeywords: [],
            complexityScore: 0.5,
            alignmentScore: 0.5,
            incumbentSignals: [],
            rawAnalysis: {},
        };
    }
}
exports.DocumentAnalysisService = DocumentAnalysisService;
exports.documentAnalysisService = new DocumentAnalysisService();
//# sourceMappingURL=documentAnalysis.js.map