import fs from 'node:fs/promises'
import type { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Configurar o worker do pdfjs para Node.js (sem node:module)
const workerUrl = new URL(
	'../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
	import.meta.url,
)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.toString()

interface TextItem {
	str: string
	x: number
	y: number
	width: number
	height: number
}

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

/**
 * Extrai itens de texto com coordenadas precisas.
 * Crucial para identificar a posição X e separar as colunas do Boletim da República.
 */
async function extractTextWithCoordinates(page: any): Promise<TextItem[]> {
	const textContent = await page.getTextContent()
	const viewport = page.getViewport({ scale: 1.0 })

	const items: TextItem[] = []

	for (const item of textContent.items) {
		if ('str' in item && item.str.trim()) {
			// Transformar coordenadas para o sistema da página
			const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
			items.push({
				str: item.str,
				x: tx[4],
				y: viewport.height - tx[5], // Inverter Y para leitura de cima para baixo
				width: item.width || 0,
				height: item.height || 0,
			})
		}
	}

	return items
}

/**
 * Ordena os itens respeitando o layout de colunas.
 * Primeiro lê toda a coluna da esquerda (de cima a baixo) e depois a da direita.
 */
function sortTextItems(items: TextItem[], pageWidth: number): TextItem[] {
	const midPoint = pageWidth / 2

	// Filtro para separar colunas
	const leftColumn = items.filter(item => item.x < midPoint - 10)
	const rightColumn = items.filter(item => item.x >= midPoint - 10)

	// Função de ordenação: prioritariamente por Y (altura) e secundariamente por X (largura)
	const sortByY = (a: TextItem, b: TextItem) => {
		const yDiff = a.y - b.y
		if (Math.abs(yDiff) > 4) return yDiff // Tolerância de 4px para considerar a mesma linha
		return a.x - b.x
	}

	leftColumn.sort(sortByY)
	rightColumn.sort(sortByY)

	return [...leftColumn, ...rightColumn]
}

/**
 * Reconstrói o texto garantindo espaços e quebras de linha lógicas.
 */
function reconstructText(items: TextItem[]): string {
	if (items.length === 0) return ''

	const lines: string[] = []
	let currentLine = ''
	let lastY = items[0].y

	for (const item of items) {
		// Se a diferença de Y for significativa, é uma nova linha
		if (Math.abs(item.y - lastY) > 8) {
			if (currentLine.trim()) lines.push(currentLine.trim())
			currentLine = item.str
		} else {
			// Adicionar espaço se necessário
			if (currentLine && !currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
				currentLine += ' '
			}
			currentLine += item.str
		}
		lastY = item.y
	}

	if (currentLine.trim()) lines.push(currentLine.trim())

	// Normalização específica para Artigos: garantir que "Artigo X" esteja numa nova linha
	return lines.join('\n').replace(/(\bARTIGO\s+\d+\b)/gi, '\n\n$1\n')
}

/**
 * Limpeza de ruído comum em Boletins da República (cabeçalhos e rodapés).
 */
function cleanText(text: string): string {
	return text
		.replace(/BOLETIM DA REPÚBLICA/gi, '')
		.replace(/I SÉRIE\s*[—–-]\s*NÚMERO\s+\d+/gi, '')
		.replace(/\d+\s*[—–-]\s*\(\d+\)/g, '') // Remove números de página isolados
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

/**
 * Extrai metadados contextuais (Capítulo, Secção) para enriquecer o chunk.
 */
function extractContext(text: string): { chapter?: string; section?: string } {
	const capMatch = text.match(/CAPÍ?TULO\s+([IVXLC\d]+)(?:\s*[-–—]?\s*([^\n]+))?/i)
	const secMatch = text.match(/SECÇ?ÃO\s+([IVXLC\d]+)(?:\s*[-–—]?\s*([^\n]+))?/i)

	return {
		chapter: capMatch ? `Capítulo ${capMatch[1]}${capMatch[2] ? ' - ' + capMatch[2].trim() : ''}` : undefined,
		section: secMatch ? `Secção ${secMatch[1]}${secMatch[2] ? ' - ' + secMatch[2].trim() : ''}` : undefined
	}
}

/**
 * Extrai o número do artigo principal contido no texto para metadados.
 */
function extractArticle(text: string): string | undefined {
	const match = text.match(/ARTIGO\s+(\d+)/i)
	return match ? `Artigo ${match[1]}` : undefined
}

export async function ProcessDocument(input: string | Buffer): Promise<Document[]> {
	let dataBuffer: Buffer
	let currentChapter = ''
	let currentSection = ''

	if (typeof input === 'string') {
		dataBuffer = await fs.readFile(input)
	} else {
		dataBuffer = input
	}

	const data = new Uint8Array(dataBuffer)
	const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

	const allPagesText: string[] = []

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i)
		const viewport = page.getViewport({ scale: 1.0 })
		const items = await extractTextWithCoordinates(page)
		const sortedItems = sortTextItems(items, viewport.width)
		allPagesText.push(reconstructText(sortedItems))
	}

	const fullText = cleanText(allPagesText.join('\n\n'))

	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1000,
		chunkOverlap: 150,
		separators: ['\n\nARTIGO ', '\n\nArtigo ', '\nCAPÍTULO ', '\nSECÇÃO ', '\n\n', '\n', '. ', ' '],
		keepSeparator: true
	})

	const rawDocs = await splitter.createDocuments([fullText])

	return rawDocs.map(doc => {
		const { chapter, section } = extractContext(doc.pageContent)
		if (chapter) currentChapter = chapter
		if (section) currentSection = section

		return {
			pageContent: doc.pageContent,
			metadata: {
				source: 'Lei 13/2023 - Moçambique',
				chapter: currentChapter,
				section: currentSection,
				article: extractArticle(doc.pageContent),
				processedAt: new Date().toISOString()
			}
		}
	})
}