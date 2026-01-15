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
				// Buscar mais documentos para cobrir múltiplos artigos relacionados
				const contextDocs = await PineconeService.retrieveRelevantDocs(
					question,
					8,
				)

				// Formatar contexto de forma estruturada
				const contextText = contextDocs
					.map(
						(doc, index) =>
							`[DOCUMENTO ${index + 1}]\nFonte: ${doc.metadata.source}\nConteúdo:\n${doc.pageContent}`,
					)
					.join('\n\n─────────────────\n\n')

				// Detectar idioma da pergunta
				const isEnglish =
					/[a-zA-Z]/.test(question) && !/[àáâãçéêíóôõú]/i.test(question)
				const languageInstruction = isEnglish
					? 'CRITICAL: You MUST respond in ENGLISH. The user asked in English, so your entire answer must be in English.'
					: 'CRÍTICO: Você DEVE responder em PORTUGUÊS. O usuário perguntou em português, então toda a sua resposta deve ser em português.'

				const response = await chatModel.invoke([
					[
						'system',
						`You are a legal assistant specialized in Mozambican Law (Lei 13/2023 and related legislation).

${languageInstruction}

CRITICAL INSTRUCTIONS:
1. **LANGUAGE**: Respond in the SAME language as the user's question (English or Portuguese)
2. **SPECIFICITY**: Always cite EXACT numbers, percentages, and values from the law
   - Example: "25% premium" NOT "a premium is paid"
   - Example: "Article 88, Paragraph 3" NOT "the law mentions"
3. **ARTICLE CITATION**: ALWAYS cite specific articles, paragraphs, and law numbers
   - Format: "Article X, Paragraph Y of Law 13/2023"
   - Cite ALL relevant articles, not just one
4. **CONTEXT USAGE**: Use ONLY the context below. If information is missing, state it clearly
5. **PRECISION**: Include exact percentages, time periods, amounts, and specific legal requirements
6. **STRUCTURE**:
   - Answer the question directly
   - Provide legal basis with exact article numbers
   - Include specific values (%, days, amounts)
   - Cite multiple articles if applicable

LEGAL CONTEXT:
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
