import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { documentRateLimitConfig } from '@/config/rate-limit.js'
import {
	ErrorResponseSchema,
	RetrieveResponseSchema,
	SearchQuerySchema,
	UpsertDocumentSchema,
	UpsertResponseSchema,
} from '@/controller/schemas.js'
import { PineconeService } from '@/services/pinecone-service.js'
import { ProcessDocument } from '@/services/process-pdf.js'

export async function upsertDocument(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/documents',
		{
			config: {
				rateLimit: {
					max: documentRateLimitConfig.max,
					timeWindow: documentRateLimitConfig.timeWindow,
				},
			},
			schema: {
				summary: 'Upload and process a law document',
				tags: ['Documents'],
				security: [{ apiKey: [] }],
				body: UpsertDocumentSchema,
				response: {
					201: UpsertResponseSchema,
					400: ErrorResponseSchema,
					500: ErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { url, filePath } = request.body
			const source = url ?? filePath

			if (!source) {
				return reply.status(400).send({ error: 'Source is missing' })
			}

			try {
				const documents = await ProcessDocument(source)
				await PineconeService.upsertLawChunks(documents)

				return reply.status(201).send({
					message: 'Document synchronized successfully',
					chunks: documents.length,
				})
			} catch (error) {
				app.log.error(error)
				return reply.status(500).send({
					error: 'Processing failed',
					message: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		},
	)
}

export async function retrieveDocument(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().get(
		'/documents',
		{
			config: {
				rateLimit: {
					max: documentRateLimitConfig.max,
					timeWindow: documentRateLimitConfig.timeWindow,
				},
			},
			schema: {
				summary: 'Retrieve legal context from Pinecone for AI usage',
				tags: ['Documents'],
				security: [{ apiKey: [] }],
				querystring: SearchQuerySchema,
				response: {
					200: RetrieveResponseSchema,
					500: ErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { question, limit } = request.query

			try {
				const documents = await PineconeService.retrieveRelevantDocs(
					question,
					limit,
				)

				return reply.status(200).send({
					success: true,
					data: documents.map((doc) => ({
						content: doc.pageContent,
						metadata: doc.metadata,
					})),
				})
			} catch (error) {
				app.log.error(error)
				return reply.status(500).send({
					error: 'Retrieval failed',
					message: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		},
	)
}
