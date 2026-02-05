import type { Document } from '@langchain/core/documents'
import { getVectorStore } from '@/lib/langchain.js'
import { pineconeIndex, pineconeNamespace } from '@/lib/pinecone.js'
import type { UpsertOptions } from '@/services/types.js'

export const PineconeService = {
	async deleteAllChunks(): Promise<number> {
		let deleted = 0
		let paginationToken: string | undefined

		do {
			const listResult = await pineconeNamespace.listPaginated({
				limit: 1000,
				paginationToken,
			})

			const ids = listResult.vectors?.map((v) => v.id) || []
			if (ids.length === 0) break

			await pineconeNamespace.deleteMany(ids)
			deleted += ids.length

			paginationToken = listResult.pagination?.next
		} while (paginationToken)

		console.info(`Deleted ${deleted} vectors in Pinecone namespace.`)
		return deleted
	},
	/**
	 * Deleta todos os chunks de um documento específico antes de re-inserir
	 */
	async deleteDocumentChunks(source: string): Promise<number> {
		const sanitizedSource = sanitizeVectorId(source)
		const prefix = `${sanitizedSource}#chunk`

		try {
			// Listar IDs que começam com o prefixo do documento
			const listResult = await pineconeIndex.namespace('jusmoz').listPaginated({
				prefix,
				limit: 1000,
			})

			const ids = listResult.vectors?.map((v) => v.id) || []

			if (ids.length > 0) {
				await pineconeNamespace.deleteMany(ids)
				console.info(`Deleted ${ids.length} existing chunks for ${source}`)
			}

			return ids.length
		} catch (error) {
			console.warn(`Could not delete old chunks: ${error}`)
			return 0
		}
	},

	async upsertLawChunks(
		documents: Document[],
		options: UpsertOptions = { batchSize: 50 },
	): Promise<void> {
		const { batchSize = 50 } = options
		const totalDocuments = documents.length

		// Identificar fontes únicas e deletar chunks antigos
		const sources = [...new Set(documents.map((d) => String(d.metadata.source)))]
		for (const source of sources) {
			await this.deleteDocumentChunks(source)
		}

		console.info(`Starting synchronization of ${totalDocuments} documents.`)

		for (let i = 0; i < totalDocuments; i += batchSize) {
			const currentBatch = documents.slice(i, i + batchSize)

			const records = currentBatch.map((doc, index) => {
				const globalIndex = i + index
				const sanitizedSource = sanitizeVectorId(
					String(doc.metadata.source),
				)

				return {
					_id: `${sanitizedSource}#chunk${globalIndex}`,
					text: doc.pageContent,
					source: doc.metadata.source,
					type: doc.metadata.type,
					jurisdiction: doc.metadata.jurisdiction,
					processedAt: doc.metadata.processedAt,
					// Metadados enriquecidos (universal)
					chapter: doc.metadata.chapter || '',
					section: doc.metadata.section || '',
					articleRange: doc.metadata.articleRange || '',
					keywords: doc.metadata.keywords || '',
				}
			})

			try {
				await pineconeNamespace.upsertRecords(records)

				const currentProgress = Math.min(i + batchSize, totalDocuments)
				console.info(
					`Progress: ${currentProgress}/${totalDocuments} records synchronized.`,
				)
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error'
				console.error(`Failed to upsert batch at offset ${i}: ${message}`)
				throw new Error(`Pinecone synchronization failed: ${message}`)
			}
		}

		console.info('All documents synchronized successfully.')
	},

	async retrieveRelevantDocs(
		query: string,
		limit: number = 5,
	): Promise<Document[]> {
		const vectorStore = await getVectorStore()

		// Buscar mais documentos inicialmente (oversampling para melhor reranking)
		const oversamplingFactor = 3
		const initialLimit = Math.ceil(limit * oversamplingFactor)

		const docs = await vectorStore.similaritySearch(query, initialLimit)

		// Extração dinâmica de termos importantes da query (ignora stopwords)
		const queryTerms = extractSignificantTerms(query)

		const rankedDocs = docs.map((doc) => {
			let score = 0
			const text = doc.pageContent.toLowerCase()
			const queryLower = query.toLowerCase()

			// 1. DENSIDADE DE TERMOS (TF Local)
			for (const term of queryTerms) {
				const regex = new RegExp(`\\b${term}\\b`, 'gi')
				const occurrences = (text.match(regex) || []).length
				score += occurrences * 5
			}

			// 2. CORRESPONDÊNCIA DE ARTIGOS DINÂMICA
			const queryArticles = Array.from(
				queryLower.matchAll(/artigo\s+(\d+)/g),
			).map((m) => m[1])
			if (queryArticles.length > 0) {
				for (const artNum of queryArticles) {
					if (text.includes(`artigo ${artNum}`)) score += 100
					if (String(doc.metadata?.article || '') === artNum) score += 50
				}
			}

			// 3. ESTRUTURA DE LEI MOÇAMBICANA (Nº, Alíneas, Parágrafos)
			if (/^\s*artigo\s+\d+/i.test(text)) score += 15
			if (/\bn[º°].\s*\d+/i.test(text)) score += 5
			if (/\balínea\s+[a-z]\)/i.test(text)) score += 5

			return { doc, score }
		})

		// Ordenar por score e retornar os melhores
		return rankedDocs
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((item) => item.doc)
	},
}

/**
 * Extrai termos significativos ignorando conectores comuns.
 */
function extractSignificantTerms(query: string): string[] {
	const stopwords = new Set([
		'como', 'qual', 'quais', 'quem', 'onde', 'quando', 'porque', 'para',
		'pelo', 'pela', 'está', 'fazer', 'sobre', 'este', 'esta', 'tudo',
		'a', 'o', 'e', 'de', 'da', 'do', 'que', 'um', 'uma', 'com', 'não',
		'em', 'por', 'se', 'na', 'no', 'ao', 'os', 'as', 'é', 'foi', 'ser',
		'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'eu', 'também',
		'só', 'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo',
		'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'está',
		'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'têm', 'numa',
		'pelos', 'qual', 'quanto', 'acordo', 'deve', 'receber', 'valor', 'total',
	])

	return query
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\w\s]/g, ' ')
		.split(/\s+/)
		.filter((word) => word.length > 3 && !stopwords.has(word))
}

/**
 * Extrai termos-chave relevantes da query do usuário
 */
function extractQueryKeywords(query: string): string[] {
	const stopwords = new Set([
		'a', 'o', 'e', 'de', 'da', 'do', 'que', 'um', 'uma', 'para', 'com', 'não',
		'em', 'por', 'se', 'na', 'no', 'ao', 'os', 'as', 'é', 'foi', 'ser', 'tem',
		'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'eu', 'também', 'só',
		'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem',
		'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'está',
		'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos',
		'qual', 'quanto', 'qual', 'acordo', 'deve', 'receber', 'valor', 'total',
	])

	return query
		.toLowerCase()
		.replace(/[^\w\sáàâãéèêíìîóòôõúùûç]/g, ' ')
		.split(/\s+/)
		.filter((word) => word.length > 3 && !stopwords.has(word))
}

function sanitizeVectorId(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\x00-\x7F]/g, '')
		.replace(/[\s/]+/g, '_')
}
