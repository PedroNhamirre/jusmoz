import type { Document } from '@langchain/core/documents'
import { getVectorStore } from '@/lib/langchain.js'
import { pineconeNamespace } from '@/lib/pinecone.js'
import type { UpsertOptions } from '@/services/types.js'

export const PineconeService = {
	async upsertLawChunks(
		documents: Document[],
		options: UpsertOptions = { batchSize: 50 },
	): Promise<void> {
		const { batchSize = 50 } = options
		const totalDocuments = documents.length

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

		return await vectorStore.similaritySearch(query, limit)
	},
}
