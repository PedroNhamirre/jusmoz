import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { chatRateLimitConfig } from '@/config/rate-limit.js'
import {
	ChatResponseSchema,
	ErrorResponseSchema,
	SearchQuerySchema,
} from '@/controller/schemas.js'
import { cacheManager } from '@/lib/cache.js'
import { chatModel } from '@/lib/langchain.js'
import { PineconeService } from '@/services/pinecone-service.js'

export async function chatWithAI(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/chat',
		{
			config: {
				rateLimit: {
					max: chatRateLimitConfig.max,
					timeWindow: chatRateLimitConfig.timeWindow,
				},
			},
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

			const cacheKey = `chat:${question}`
			const cachedResponse = cacheManager.get<{
				answer: string
				sources: string[]
			}>(cacheKey)
			if (cachedResponse) {
				reply.header('X-Cache', 'HIT')
				return reply.status(200).send(cachedResponse)
			}
			reply.header('X-Cache', 'MISS')
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

                        INSTRUÇÕES IMPORTANTES:
                        - Use estritamente o contexto abaixo para responder às perguntas
                        - Se a informação não estiver no contexto, explique que não possui dados sobre isso no momento
                        - Responda no MESMO IDIOMA da pergunta do usuário (Português ou Inglês)
                        - Seja claro, preciso e profissional
                        - SEMPRE verifique e cite os artigos corretos das leis mencionadas no contexto
                        - Se houver referência a artigos, confirme que está usando o artigo correto baseado no contexto fornecido

                        CONTEXTO LEGAL:
                        ${contextText}`,
					],
					['human', question],
				])

				const result = {
					answer: String(response.content),
					sources: contextDocs.map((doc) =>
						String(doc.metadata.source || 'Unknown'),
					),
				}

				cacheManager.set(cacheKey, result, 300000)

				return reply.status(200).send(result)
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
