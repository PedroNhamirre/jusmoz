import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
	ChatResponseSchema,
	ErrorResponseSchema,
	SearchQuerySchema,
} from '@/controller/schemas.js'
import { chatModel } from '@/lib/langchain.js'
import { PineconeService } from '@/services/pinecone-service.js'

export async function chatWithAI(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/chat',
		{
			schema: {
				summary: 'Chat with Mozambican Laws using AI',
				tags: ['Chat'],
				body: SearchQuerySchema,
				response: {
					200: ChatResponseSchema,
					500: ErrorResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const { question } = request.body
			try {
				const contextDocs = await PineconeService.retrieveRelevantDocs(question)
				const contextText = contextDocs
					.map(
						(doc) =>
							`Documento: ${doc.metadata.source}\nConteúdo: ${doc.pageContent}`,
					)
					.join('\n\n---\n\n')

				const response = await chatModel.invoke([
					[
						'system',
						`Você é um assistente jurídico especializado no Direito de Moçambique.
                        Use estritamente o contexto abaixo para responder às perguntas.
                        Se a informação não estiver no contexto, explique que não possui dados sobre isso no momento.
                        Responda sempre em Português de Moçambique de forma clara e profissional.

                        CONTEXTO LEGAL:
                        ${contextText}`,
					],
					['human', question],
				])

				return reply.status(200).send({
					answer: String(response.content),
					sources: contextDocs.map((doc) =>
						String(doc.metadata.source || 'Unknown'),
					),
				})
			} catch (error) {
				app.log.error(error)
				return reply.status(500).send({
					error: 'Chat processing failed',
					message: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		},
	)
}
