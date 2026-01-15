import fs from 'node:fs/promises'
import type { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PDFParse } from 'pdf-parse'

function getMetadata(text: string) {
	const lawMatch = text.match(/Lei\s+n\.?[\sº"“]+(\d+\/\d{4})/i)
	const titleMatch = text.match(
		/Lei\s+n\.?[\sº"“]+\d+\/\d{4}[:\s\n]+([^.\n;]+)/i,
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

export async function ProcessDocument(
	input: string | Buffer,
): Promise<Document[]> {
	let dataBuffer: Buffer

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
		const metadata = getMetadata(rawText)

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

		return await splitter.createDocuments([rawText], [metadata])
	} catch (error) {
		console.error('Erro no processamento:', error)
		throw error
	}
}
