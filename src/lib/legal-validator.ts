// ============================================================================
// LEGAL CITATION VALIDATOR FOR MOZAMBIQUE LAW 13/2023
// Validates that AI responses cite real articles from the Labor Law
// ============================================================================

// Known valid articles from Lei 13/2023 (Mozambique Labor Law)
// This should be expanded to include all articles from the actual law
const VALID_ARTICLES_LEI_13_2023 = new Set([
	// Título I - Disposições Gerais (Articles 1-15)
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
	// Título II - Contrato de Trabalho (Articles 16-80)
	16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
	35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,
	54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
	73, 74, 75, 76, 77, 78, 79, 80,
	// Título III - Prestação de Trabalho (Articles 81-130)
	81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
	100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
	115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129,
	130,
	// Título IV - Remuneração (Articles 131-160)
	131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145,
	146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160,
	// Título V - Suspensão e Cessação (Articles 161-200)
	161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
	176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190,
	191, 192, 193, 194, 195, 196, 197, 198, 199, 200,
	// Título VI - Trabalho Especial (Articles 201-250)
	201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215,
	216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230,
	231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245,
	246, 247, 248, 249, 250,
	// Título VII - Relações Coletivas (Articles 251-290)
	251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265,
	266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280,
	281, 282, 283, 284, 285, 286, 287, 288, 289, 290,
	// Título VIII - Disposições Finais (Articles 291-310)
	291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305,
	306, 307, 308, 309, 310,
])

// Maximum valid article number (prevents obvious hallucinations like "Artigo 9999")
const MAX_ARTICLE_NUMBER = 310

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
	// Portuguese: "Artigo 23" or "Artigo 23, nº 1" or "Art. 23"
	/artigos?\s*(\d+)(?:\s*,?\s*n[º°]?\s*(\d+))?/gi,
	/art\.?\s*(\d+)(?:\s*,?\s*n[º°]?\s*(\d+))?/gi,

	// English: "Article 23" or "Article 23, paragraph 1"
	/articles?\s*(\d+)(?:\s*,?\s*(?:paragraph|para?\.?)\s*(\d+))?/gi,

	// Law reference: "Lei 13/2023"
	/lei\s*(\d+)\/(\d{4})/gi,
	/law\s*(\d+)\/(\d{4})/gi,
]

export function extractCitations(text: string): Citation[] {
	const citations: Citation[] = []
	const seen = new Set<string>()

	for (const pattern of CITATION_PATTERNS) {
		// Reset regex state
		pattern.lastIndex = 0
		let match = pattern.exec(text)

		while (match !== null) {
			const rawText = match[0]
			const uniqueKey = rawText.toLowerCase()

			if (seen.has(uniqueKey)) {
				match = pattern.exec(text)
				continue
			}
			seen.add(uniqueKey)

			// Handle law references
			if (/lei|law/i.test(rawText)) {
				const lawNumber = Number.parseInt(match[1], 10)
				const year = Number.parseInt(match[2], 10)
				citations.push({
					law: `${lawNumber}/${year}`,
					article: 0,
					isValid: lawNumber === 13 && year === 2023,
					rawText,
				})
				match = pattern.exec(text)
				continue
			}

			// Handle article references
			const articleNumber = Number.parseInt(match[1], 10)
			const paragraphNumber = match[2]
				? Number.parseInt(match[2], 10)
				: undefined

			const isValidArticle =
				articleNumber > 0 &&
				articleNumber <= MAX_ARTICLE_NUMBER &&
				VALID_ARTICLES_LEI_13_2023.has(articleNumber)

			citations.push({
				law: '13/2023',
				article: articleNumber,
				paragraph: paragraphNumber,
				isValid: isValidArticle,
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
