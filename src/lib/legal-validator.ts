// ============================================================================
// LEGAL CITATION VALIDATOR FOR MOZAMBIQUE LEGISLATION
// Universal validator for any Mozambican law - not specific to any single law
// ============================================================================

export interface Citation {
	law: string
	article: number
	paragraph?: number
	isValid: boolean
	rawText: string
}

export interface CitationValidationResult {
	citations: Citation[]
	hasValidCitation: boolean
	hasInvalidCitation: boolean
	validCount: number
	invalidCount: number
	confidence: 'high' | 'medium' | 'low' | 'none'
}

// Regex patterns for citation extraction
const CITATION_PATTERNS = [
	// Portuguese with law: "Artigo 23 da Lei 13/2023" or "Lei 13/2023, Artigo 23"
	/(?:lei\s+(\d+\/\d{4})[,\s]+)?artigos?\s*(\d+)(?:\s*,?\s*n[º°]?\s*(\d+))?(?:\s+da\s+lei\s+(\d+\/\d{4}))?/gi,
	/(?:lei\s+(\d+\/\d{4})[,\s]+)?art\.?\s*(\d+)(?:\s*,?\s*n[º°]?\s*(\d+))?(?:\s+da\s+lei\s+(\d+\/\d{4}))?/gi,

	// English: "Article 23 of Law 13/2023" or "Law 13/2023, Article 23"
	/(?:law\s+(\d+\/\d{4})[,\s]+)?articles?\s*(\d+)(?:\s*,?\s*(?:paragraph|para?\.?)\s*(\d+))?(?:\s+of\s+law\s+(\d+\/\d{4}))?/gi,
]

export function extractCitations(text: string): Citation[] {
	const citations: Citation[] = []
	const seen = new Set<string>()

	for (const pattern of CITATION_PATTERNS) {
		pattern.lastIndex = 0
		let match = pattern.exec(text)

		while (match !== null) {
			const rawText = match[0]
			const lawBefore = match[1]
			const articleNumber = Number.parseInt(match[2], 10)
			const paragraphNumber = match[3] ? Number.parseInt(match[3], 10) : undefined
			const lawAfter = match[4]

			// Get law reference (either before or after article)
			const lawReference = lawBefore || lawAfter || 'unknown'

			const uniqueKey = `${lawReference}-${articleNumber}-${paragraphNumber || 0}`.toLowerCase()

			if (seen.has(uniqueKey)) {
				match = pattern.exec(text)
				continue
			}
			seen.add(uniqueKey)

			// Accept any citation with proper law reference and positive article number
			const isValidFormat =
				lawReference !== 'unknown' &&
				articleNumber > 0 &&
				articleNumber < 10000 && // Sanity check
				/^\d+\/\d{4}$/.test(lawReference)

			citations.push({
				law: lawReference,
				article: articleNumber,
				paragraph: paragraphNumber,
				isValid: isValidFormat,
				rawText,
			})

			match = pattern.exec(text)
		}
	}

	return citations
}

export function validateCitations(text: string): CitationValidationResult {
	const citations = extractCitations(text)

	const validCount = citations.filter((c) => c.isValid).length
	const invalidCount = citations.filter((c) => !c.isValid).length

	let confidence: CitationValidationResult['confidence'] = 'none'

	if (validCount >= 2) {
		confidence = 'high'
	} else if (validCount === 1 && invalidCount === 0) {
		confidence = 'medium'
	} else if (validCount === 1 && invalidCount > 0) {
		confidence = 'low'
	}

	return {
		citations,
		hasValidCitation: validCount > 0,
		hasInvalidCitation: invalidCount > 0,
		validCount,
		invalidCount,
		confidence,
	}
}

// Check if a response is a refusal/uncertainty response
export function isRefusalResponse(text: string): boolean {
	const refusalPatterns = [
		/não\s*(posso|consigo|encontrei)/i,
		/não\s*tenho\s*(informação|dados)/i,
		/lamento/i,
		/desculpe/i,
		/infelizmente/i,
		/cannot\s*(help|assist|find)/i,
		/sorry/i,
		/unfortunately/i,
		/no\s*(information|data)\s*(available|found)/i,
		/not\s*within\s*(my|the)\s*(scope|context)/i,
		/fora\s*do\s*(âmbito|escopo|contexto)/i,
	]

	return refusalPatterns.some((pattern) => pattern.test(text))
}

// Validate response quality for legal context
export interface ResponseValidation {
	isValid: boolean
	reason: string
	citationResult: CitationValidationResult
	shouldBlock: boolean
}

export function validateLegalResponse(text: string): ResponseValidation {
	// Check if it's a refusal - these are always valid
	if (isRefusalResponse(text)) {
		return {
			isValid: true,
			reason: 'Valid refusal/uncertainty response',
			citationResult: {
				citations: [],
				hasValidCitation: false,
				hasInvalidCitation: false,
				validCount: 0,
				invalidCount: 0,
				confidence: 'none',
			},
			shouldBlock: false,
		}
	}

	const citationResult = validateCitations(text)

	// If the response contains invalid citations (hallucinated articles)
	if (citationResult.hasInvalidCitation && !citationResult.hasValidCitation) {
		return {
			isValid: false,
			reason: `Response contains potentially hallucinated citations: ${citationResult.citations
				.filter((c) => !c.isValid)
				.map((c) => c.rawText)
				.join(', ')}`,
			citationResult,
			shouldBlock: true,
		}
	}

	// If no citations at all in a legal response
	if (!citationResult.hasValidCitation && text.length > 200) {
		return {
			isValid: false,
			reason: 'Legal response without proper citations',
			citationResult,
			shouldBlock: true,
		}
	}

	// Valid response with citations
	if (citationResult.hasValidCitation) {
		return {
			isValid: true,
			reason: `Valid response with ${citationResult.validCount} citation(s)`,
			citationResult,
			shouldBlock: false,
		}
	}

	// Short response without citations - might be okay for simple answers
	return {
		isValid: true,
		reason: 'Short response without citations (may need review)',
		citationResult,
		shouldBlock: false,
	}
}
