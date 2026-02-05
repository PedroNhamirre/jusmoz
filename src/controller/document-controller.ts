import type { MultipartFile } from '@fastify/multipart'
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
			const { url } = request.body

			const urlObj = new URL(url)
			if (urlObj.protocol !== 'https:' && !url.startsWith('http://localhost')) {
				return reply.status(400).send({
					error: 'Bad Request',
					message: 'Only HTTPS URLs are allowed for security',
				})
			}

			try {
				const documents = await ProcessDocument(url)
				await PineconeService.upsertLawChunks(documents)

				return reply.status(201).send({
					message: 'Document uploaded and processed successfully',
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

export async function uploadDocumentFile(app: FastifyInstance) {
	app.post(
		'/documents/upload',
		{
			config: {
				rateLimit: {
					max: documentRateLimitConfig.max,
					timeWindow: documentRateLimitConfig.timeWindow,
				},
			},
			schema: {
				summary: 'Upload and process a law document from file',
				tags: ['Documents'],
				security: [{ apiKey: [] }],
				response: {
					201: UpsertResponseSchema,
					400: ErrorResponseSchema,
					500: ErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			try {
				const data = await request.file()

				if (!data) {
					return reply.status(400).send({
						error: 'Bad Request',
						message: 'No file uploaded',
					})
				}

				if (data.mimetype !== 'application/pdf') {
					return reply.status(400).send({
						error: 'Bad Request',
						message: 'Only PDF files are allowed',
					})
				}

				const buffer = await data.toBuffer()
				const documents = await ProcessDocument(buffer)
				await PineconeService.upsertLawChunks(documents)

				return reply.status(201).send({
					message: 'Document uploaded and processed successfully',
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
