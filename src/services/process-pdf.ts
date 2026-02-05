import fs from 'node:fs/promises'
import type { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PDFParse } from 'pdf-parse'

interface ChunkMetadata {
	source: string
	type: string
	jurisdiction: string
	processedAt: string
	chapter?: string
	section?: string
	articleRange?: string
	keywords?: string
}

function getMetadata(text: string): ChunkMetadata {
	const lawMatch = text.match(/Lei\s+n\.?[\sº""]+(\d+\/\d{4})/i)
	const titleMatch = text.match(
		/Lei\s+n\.?[\sº""]+\d+\/\d{4}[:\s\n]+([^.\n;]+)/i,
	)

	let type = titleMatch ? titleMatch[1].trim() : 'Documento Geral'
	type = type.split(/\s+e\s+revoga/i)[0].trim()

	return {
		source: lawMatch ? `Lei ${lawMatch[1]}` : 'Legislação',
		type: type,
		jurisdiction: 'Moçambique',
		processedAt: new Date().toISOString(),
	}
}

// Extrai capítulo e seção do texto
function extractChapterSection(text: string): { chapter?: string; section?: string } {
	const chapterPatterns = [
		/CAPÍ?TULO\s+([IVXLC]+)\s*[-–—]?\s*([^\n]+)/i,
		/CAPÍ?TULO\s+(\d+)\s*[-–—]?\s*([^\n]+)/i,
	]

	const sectionPatterns = [
		/SECÇ?ÃO\s+([IVXLC]+)\s*[-–—]?\s*([^\n]+)/i,
		/SECÇ?ÃO\s+(\d+)\s*[-–—]?\s*([^\n]+)/i,
		/SUBSECÇ?ÃO\s+([IVXLC]+)\s*[-–—]?\s*([^\n]+)/i,
	]

	let chapter: string | undefined
	let section: string | undefined

	for (const pattern of chapterPatterns) {
		const match = text.match(pattern)
		if (match) {
			chapter = `Capítulo ${match[1]}${match[2] ? ` - ${match[2].trim()}` : ''}`
			break
		}
	}

	for (const pattern of sectionPatterns) {
		const match = text.match(pattern)
		if (match) {
			section = `Secção ${match[1]}${match[2] ? ` - ${match[2].trim()}` : ''}`
			break
		}
	}

	return { chapter, section }
}

// Extrai range de artigos no chunk
function extractArticleRange(text: string): string | undefined {
	const articleMatches = text.match(/artigos?\s+(\d+)/gi)
	if (!articleMatches || articleMatches.length === 0) return undefined

	const numbers = articleMatches
		.map((m) => {
			const num = m.match(/\d+/)
			return num ? parseInt(num[0], 10) : 0
		})
		.filter((n) => n > 0)

	if (numbers.length === 0) return undefined
	if (numbers.length === 1) return `Artigo ${numbers[0]}`

	const min = Math.min(...numbers)
	const max = Math.max(...numbers)
	return min === max ? `Artigo ${min}` : `Artigos ${min}-${max}`
}

// Extrai palavras-chave significativas do texto (universal, sem hardcode)
function extractKeywords(text: string): string | undefined {
	// Palavras comuns a ignorar (stopwords em PT)
	const stopwords = new Set([
		'a', 'à', 'ao', 'aos', 'as', 'até', 'com', 'como', 'da', 'das', 'de', 'dela',
		'delas', 'dele', 'deles', 'depois', 'do', 'dos', 'e', 'ela', 'elas', 'ele',
		'eles', 'em', 'entre', 'era', 'eram', 'essa', 'essas', 'esse', 'esses', 'esta',
		'estas', 'este', 'estes', 'eu', 'foi', 'foram', 'há', 'isso', 'isto', 'já',
		'lhe', 'lhes', 'lo', 'mais', 'mas', 'me', 'mesmo', 'meu', 'meus', 'minha',
		'minhas', 'muito', 'na', 'nas', 'não', 'nem', 'no', 'nos', 'nós', 'nossa',
		'nossas', 'nosso', 'nossos', 'num', 'numa', 'o', 'os', 'ou', 'para', 'pela',
		'pelas', 'pelo', 'pelos', 'por', 'qual', 'quando', 'que', 'quem', 'se', 'sem',
		'ser', 'será', 'seu', 'seus', 'só', 'sua', 'suas', 'também', 'te', 'tem',
		'têm', 'tendo', 'ter', 'teu', 'teus', 'tu', 'tua', 'tuas', 'um', 'uma', 'você',
		'vocês', 'vos', 'artigo', 'lei', 'número', 'nº', 'alínea', 'parágrafo',
		'presente', 'seguinte', 'anterior', 'deve', 'podem', 'pode', 'deve', 'devem',
		'caso', 'casos', 'forma', 'termos', 'acordo', 'mediante', 'sobre', 'sob',
		'previsto', 'prevista', 'disposto', 'disposta', 'estabelecido', 'aplicável',
	])

	// Normalizar e extrair palavras
	const words = text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // Remove acentos para comparação
		.replace(/[^\w\s]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 3 && !stopwords.has(w))

	// Contar frequência
	const freq: Record<string, number> = {}
	for (const word of words) {
		freq[word] = (freq[word] || 0) + 1
	}

	// Pegar as 5 palavras mais frequentes (que aparecem mais de 1 vez)
	const keywords = Object.entries(freq)
		.filter(([_, count]) => count > 1)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([word]) => word)

	return keywords.length > 0 ? keywords.join(', ') : undefined
}

function cleanText(text: string): string {
	return text
		.replace(/--- PAGE \d+ ---/g, '')
		.replace(/BOLETIM DA REPÚBLICA/g, '')
		.replace(/I SÉRIE\s+—\s+NÚMERO\s+\d+/g, '')
		.replace(/\d+\s+—\s+\(\d+\)/g, '')
		.replace(/A\s+rtigo/g, 'Artigo')
		.replace(/A\s+RTIGO/g, 'ARTIGO')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

// Mantém contexto do capítulo/seção ao longo do documento
let currentChapter = ''
let currentSection = ''

function updateContextFromText(text: string): void {
	const { chapter, section } = extractChapterSection(text)
	if (chapter) currentChapter = chapter
	if (section) currentSection = section
}

export async function ProcessDocument(
	input: string | Buffer,
): Promise<Document[]> {
	let dataBuffer: Buffer

	// Reset context for new document
	currentChapter = ''
	currentSection = ''

	try {
		if (typeof input === 'string') {
			if (input.startsWith('http')) {
				const response = await fetch(input)
				if (!response.ok)
					throw new Error(`Erro ao baixar PDF: ${response.statusText}`)
				dataBuffer = Buffer.from(await response.arrayBuffer())
			} else {
				dataBuffer = await fs.readFile(input)
			}
		} else {
			dataBuffer = input
		}

		const parser = new PDFParse(new Uint8Array(dataBuffer))
		const pdfData = await parser.getText()
		let rawText = pdfData.text

		if (!rawText || rawText.length < 10) {
			throw new Error('O PDF parece estar vazio ou requer OCR (imagem).')
		}

		rawText = cleanText(rawText)
		const baseMetadata = getMetadata(rawText)

		const separators = [
			'\n\nCAPÍTULO ',
			'\nCAPÍTULO ',
			'\n\nSECÇÃO ',
			'\nSECÇÃO ',
			'\n\nSubsecção ',
			'\n\nARTIGO ',
			'\n\nArtigo ',
			'\nARTIGO ',
			'\nArtigo ',
			'\n\n1. ',
			'\n\na) ',
			'\n\n',
			'. ',
			' ',
			'',
		]

		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: 1200,
			chunkOverlap: 200,
			separators: separators,
			keepSeparator: true,
		})

		const rawDocs = await splitter.createDocuments([rawText], [baseMetadata])

		// Enriquecer cada chunk com metadados
		const enrichedDocs = rawDocs.map((doc) => {
			updateContextFromText(doc.pageContent)

			const articleRange = extractArticleRange(doc.pageContent)
			const keywords = extractKeywords(doc.pageContent)

			return {
				...doc,
				metadata: {
					...doc.metadata,
					chapter: currentChapter || undefined,
					section: currentSection || undefined,
					articleRange,
					keywords,
				},
			}
		})

		return enrichedDocs
	} catch (error) {
		console.error('Erro no processamento:', error)
		throw error
	}
}
