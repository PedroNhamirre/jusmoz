import { createHash } from 'node:crypto'
import { franc } from 'franc-min'

// ============================================================================
// CACHE KEY HASHING - Prevents PII leakage and normalizes keys
// ============================================================================

export function hashCacheKey(
	question: string,
	limit: number,
	salt = 'jusmoz-v1',
): string {
	const normalized = question.toLowerCase().trim()
	const payload = `${salt}:${normalized}:${limit}`
	return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

// ============================================================================
// LANGUAGE DETECTION - Using franc for reliable detection
// ============================================================================

export type SupportedLanguage = 'pt' | 'en'

export function detectLanguage(text: string): SupportedLanguage {
	// franc returns ISO 639-3 codes
	const detected = franc(text, { minLength: 10, only: ['por', 'eng'] })

	if (detected === 'por') return 'pt'
	if (detected === 'eng') return 'en'

	// Fallback: check for Portuguese-specific characters/words
	const portugueseIndicators =
		/[ãõçáéíóúâêîôû]|artigo|trabalho|lei|salário|férias/i
	if (portugueseIndicators.test(text)) return 'pt'

	// Default to Portuguese (primary language for Mozambique)
	return 'pt'
}

// ============================================================================
// PROMPT INJECTION DETECTION - Multi-layer defense
// ============================================================================

// Extended blacklist with common injection patterns
const INJECTION_PATTERNS: RegExp[] = [
	// Direct instruction overrides
	/ignore\s*(all\s*)?(previous\s*)?instructions?/i,
	/disregard\s*(all\s*)?(previous\s*)?instructions?/i,
	/forget\s*(all\s*)?(previous\s*)?instructions?/i,
	/esqueça\s*(todas?\s*)?(as\s*)?instruções/i,
	/ignore\s*(todas?\s*)?(as\s*)?instruções/i,

	// System prompt extraction
	/system\s*prompt/i,
	/show\s*(me\s*)?(your\s*)?prompt/i,
	/reveal\s*(your\s*)?instructions?/i,
	/what\s*are\s*your\s*instructions?/i,

	// Role-play attacks
	/you\s*are\s*now/i,
	/act\s*as\s*(if|a|an)/i,
	/pretend\s*(to\s*be|you\s*are)/i,
	/agir?\s*como/i,
	/finja\s*(ser|que)/i,
	/vire\s*um/i,

	// Jailbreak patterns
	/DAN\s*mode/i,
	/developer\s*mode/i,
	/jailbreak/i,
	/bypass\s*(safety|filter|restriction)/i,

	// Data extraction
	/output\s*(all|your)\s*(training|data)/i,
	/leak\s*(your\s*)?data/i,

	// Reset attempts
	/reset\s*(all\s*)?(system|context)/i,
	/clear\s*(all\s*)?(system|context)/i,

	// Unicode/encoding tricks (common patterns)
	/[\u200b-\u200f\u2028-\u202f\u205f-\u206f]/g, // Zero-width and invisible chars
]

// Homoglyph detection for common attack characters
const HOMOGLYPH_MAP: Record<string, string> = {
	а: 'a', // Cyrillic
	е: 'e',
	о: 'o',
	р: 'p',
	с: 'c',
	х: 'x',
	і: 'i',
	ɪ: 'i',
	ｉ: 'i', // Fullwidth
	ｇ: 'g',
	ｎ: 'n',
	ｏ: 'o',
	ｒ: 'r',
	ｅ: 'e',
}

function normalizeHomoglyphs(text: string): string {
	let normalized = text
	for (const [homoglyph, replacement] of Object.entries(HOMOGLYPH_MAP)) {
		normalized = normalized.replaceAll(homoglyph, replacement)
	}
	return normalized
}

function containsBase64Payload(text: string): boolean {
	// Check for base64-like patterns that might hide instructions
	const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/
	if (!base64Pattern.test(text)) return false

	// Try to decode and check for suspicious content
	const matches = text.match(/[A-Za-z0-9+/]{20,}={0,2}/g) || []
	for (const match of matches) {
		try {
			const decoded = Buffer.from(match, 'base64').toString('utf-8')
			// Check if decoded content contains injection patterns
			if (INJECTION_PATTERNS.some((pattern) => pattern.test(decoded))) {
				return true
			}
		} catch {
			// Invalid base64, ignore
		}
	}
	return false
}

export interface InjectionCheckResult {
	isSafe: boolean
	reason?: string
	severity: 'none' | 'low' | 'medium' | 'high'
}

export function checkPromptInjection(text: string): InjectionCheckResult {
	// Layer 1: Normalize homoglyphs
	const normalized = normalizeHomoglyphs(text)

	// Layer 2: Check for injection patterns
	for (const pattern of INJECTION_PATTERNS) {
		if (pattern.test(normalized)) {
			return {
				isSafe: false,
				reason: 'Detected prompt injection pattern',
				severity: 'high',
			}
		}
	}

	// Layer 3: Check for base64 encoded payloads
	if (containsBase64Payload(text)) {
		return {
			isSafe: false,
			reason: 'Detected encoded payload',
			severity: 'medium',
		}
	}

	// Layer 4: Check for excessive special characters (potential obfuscation)
	const specialCharRatio =
		(text.match(/[^\w\s.,!?áàâãéèêíìîóòôõúùûç]/gi) || []).length / text.length
	if (specialCharRatio > 0.3) {
		return {
			isSafe: false,
			reason: 'Suspicious character pattern',
			severity: 'low',
		}
	}

	// Layer 5: Check for nested XML/HTML tags that might override system prompts
	if (/<\/?system|<\/?prompt|<\/?instruction/i.test(text)) {
		return {
			isSafe: false,
			reason: 'Detected system tag injection',
			severity: 'high',
		}
	}

	return { isSafe: true, severity: 'none' }
}

// ============================================================================
// LEGAL QUERY CLASSIFICATION - Improved heuristics
// ============================================================================

const LEGAL_DOMAIN_KEYWORDS = new Set([
	// Portuguese
	'lei',
	'artigo',
	'trabalho',
	'trabalhador',
	'empregador',
	'contrato',
	'férias',
	'salário',
	'despedimento',
	'aviso',
	'prévio',
	'indenização',
	'indemnização',
	'direito',
	'dever',
	'obrigação',
	'jornada',
	'horas',
	'extras',
	'licença',
	'maternidade',
	'paternidade',
	'sindicato',
	'greve',
	'rescisão',
	'demissão',
	'multa',
	'penalidade',
	'jurídico',
	'legal',
	// English
	'law',
	'article',
	'labor',
	'labour',
	'worker',
	'employer',
	'employee',
	'contract',
	'vacation',
	'salary',
	'wage',
	'dismissal',
	'termination',
	'notice',
	'compensation',
	'right',
	'duty',
	'obligation',
	'working',
	'hours',
	'overtime',
	'leave',
	'maternity',
	'paternity',
	'union',
	'strike',
	'legal',
	'mozambique',
	'mozambican',
])

const LEGAL_QUESTION_PATTERNS = [
	/quais?\s*(são|sao)\s*(os|as)\s*(direitos?|deveres?|obrigações?)/i,
	/como\s*(funciona|é|são)\s*(o|a|os|as)/i,
	/o\s*que\s*(diz|prevê|estabelece)\s*(a\s*lei|o\s*artigo)/i,
	/segundo\s*(a\s*lei|o\s*código)/i,
	/de\s*acordo\s*com\s*(a\s*lei|o\s*artigo)/i,
	/what\s*(does|is|are)\s*(the\s*)?(law|article|right)/i,
	/how\s*(does|is|are)\s*(the\s*)?(law|article|right)/i,
	/according\s*to\s*(the\s*)?(law|article)/i,
	/lei\s*\d+\/\d{4}/i, // Lei 13/2023 pattern
]

export function isLegalQuery(text: string): boolean {
	const normalized = text.toLowerCase()
	const words = normalized.split(/\s+/)

	// Check for legal domain keywords
	const keywordCount = words.filter((word) =>
		LEGAL_DOMAIN_KEYWORDS.has(word.replace(/[.,!?]/g, '')),
	).length

	// At least 2 legal keywords = likely legal
	if (keywordCount >= 2) return true

	// Check for legal question patterns
	if (LEGAL_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
		return true
	}

	// Check for law reference patterns (Lei X/YYYY, Artigo X)
	if (/lei\s*\d+\/\d{4}|artigo\s*\d+|article\s*\d+/i.test(normalized)) {
		return true
	}

	// Single keyword + reasonable length (more specific than 40 chars)
	if (keywordCount >= 1 && words.length >= 5 && words.length <= 100) {
		return true
	}

	return false
}

// ============================================================================
// PII MASKING - For safe logging
// ============================================================================

export function maskPII(text: string): string {
	return (
		text
			// Mask email addresses
			.replace(
				/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
				'[EMAIL_REDACTED]',
			)
			// Mask phone numbers (various formats)
			.replace(
				/\+?\d{1,3}[-.\s]?\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
				'[PHONE_REDACTED]',
			)
			// Mask potential ID numbers (8+ consecutive digits)
			.replace(/\b\d{8,}\b/g, '[ID_REDACTED]')
			// Mask names after common patterns
			.replace(
				/(meu\s*nome\s*[ée]\s*|my\s*name\s*is\s*|chamado?\s*|chamo-me\s*)[\w\s]+/gi,
				'$1[NAME_REDACTED]',
			)
	)
}
