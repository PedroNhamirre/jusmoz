export interface UpsertOptions {
	batchSize?: number
}

export interface DocumentMetadata {
	source: string
	type: string
	jurisdiction: string
	processedAt: string
}
