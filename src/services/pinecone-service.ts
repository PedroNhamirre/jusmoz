import type { Document } from '@langchain/core/documents'
import { getVectorStore } from '@/lib/langchain.js'
import { pineconeIndex, pineconeNamespace } from '@/lib/pinecone.js'
import type { UpsertOptions } from '@/services/types.js'

export const PineconeService = {
	/**
	 * Deleta todos os chunks de um documento específico antes de re-inserir
	 */
	async deleteDocumentChunks(source: string): Promise<number> {
		const sanitizedSource = source.replace(/[\s/]/g, '_')
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
				const sanitizedSource = String(doc.metadata.source).replace(
					/[\s/]/g,
					'_',
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

		// Buscar mais documentos inicialmente (oversampling)
		const oversamplingFactor = 2
		const initialLimit = Math.ceil(limit * oversamplingFactor)

		const docs = await vectorStore.similaritySearch(query, initialLimit)

		// Reranking baseado em qualidade do conteúdo
		const rankedDocs = docs.map((doc) => {
			let score = 0

			// Bonus para documentos que contêm números de artigos
			if (/artigo\s+\d+|article\s+\d+/i.test(doc.pageContent)) {
				score += 2
			}

			// Bonus para documentos com porcentagens e valores específicos
			if (/\d+%|\d+\s*(por\s*cento|percent)/i.test(doc.pageContent)) {
				score += 1.5
			}

			// Bonus para documentos com parágrafos numerados
			if (/par[áa]grafo\s+\d+|paragraph\s+\d+|n[º°]\s*\d+/i.test(doc.pageContent)) {
				score += 1
			}

			// Bonus se o documento tem keywords nos metadados
			const keywords = (doc.metadata.keywords as string) || ''
			if (keywords) {
				score += 0.5
			}

			// Bonus por capítulo definido
			const chapter = (doc.metadata.chapter as string) || ''
			if (chapter) {
				score += 0.5
			}

			return { doc, score }
		})

		// Ordenar por score e retornar os melhores
		return rankedDocs
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((item) => item.doc)
	},
}
