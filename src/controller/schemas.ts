import { z } from 'zod'

export const UpsertDocumentSchema = z
	.object({
		url: z
			.url()
			.or(z.literal(''))
			.transform((v) => (v === '' ? undefined : v))
			.optional(),
		filePath: z.string().optional(),
	})
	.refine((data) => data.url || data.filePath, {
		message: "Either 'url' or 'filePath' must be provided",
	})

export type UpsertDocumentInput = z.infer<typeof UpsertDocumentSchema>

export const SearchQuerySchema = z.object({
	question: z.string().min(3, 'Question must be at least 3 characters long'),
	limit: z.number().int().min(1).max(20).default(5),
})

export type SearchQueryInput = z.infer<typeof SearchQuerySchema>

// --- Schemas de Resposta (Output) ---

export const UpsertResponseSchema = z.object({
	message: z.string(),
	chunks: z.number().describe('Number of text segments processed and stored'),
})

export const RetrieveResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(
		z.object({
			content: z.string(),
			metadata: z.record(z.string(), z.any()),
		}),
	),
})

export const ChatResponseSchema = z.object({
	answer: z.string().describe('The AI generated response based on the law'),
	sources: z
		.array(z.string())
		.describe('List of document sources used for this answer'),
})

export const ErrorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional(),
})

export type UpsertResponse = z.infer<typeof UpsertResponseSchema>
export type RetrieveResponse = z.infer<typeof RetrieveResponseSchema>
export type ChatResponse = z.infer<typeof ChatResponseSchema>
