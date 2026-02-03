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

const LEGAL_KEYWORDS = [
	'lei',
	'trabalho',
	'artigo',
	'contrato',
	'férias',
	'salário',
	'moçambique',
	'direito',
	'dever',
	'multa',
	'cláusula',
	'aviso',
	'indenização',
	'jurídico',
	'law',
	'labor',
	'article',
	'contract',
	'vacation',
	'salary',
	'mozambique',
	'right',
	'employment',
	'legal',
	'termination',
	'dismissal',
	'wage',
]

function isLikelyLegal(question: string): boolean {
	const normalized = question.toLowerCase()
	return (
		LEGAL_KEYWORDS.some((key) => normalized.includes(key)) ||
		question.length > 25
	)
}


function isEnglishQuestion(question: string): boolean {
	const englishIndicators = [
		'what',
		'how',
		'why',
		'who',
		'where',
		'law',
		'mozambique',
		'work',
		'is',
		'the',
	]
	const normalized = question.toLowerCase()
	const words = normalized.split(/\s+/)
	return englishIndicators.some((word) => words.includes(word))
}

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
			const { question, limit } = request.body

			const sanitizedQuestion = question.trim().toLowerCase()
			const cacheKey = `chat:${sanitizedQuestion}:${limit ?? 5}`

			const cachedResponse = cacheManager.get<{
				answer: string
				sources: string[]
			}>(cacheKey)

			if (cachedResponse) {
				reply.header('X-Cache', 'HIT')
				return reply.status(200).send(cachedResponse)
			}

			reply.header('X-Cache', 'MISS')

			if (!isLikelyLegal(question)) {
				const isEN = isEnglishQuestion(question)
				return reply.status(200).send({
					answer: isEN
						? 'Sorry, I can only help with questions regarding Mozambican legislation and Labor Law. How can I help you legally?'
						: 'Desculpe, só posso ajudar com questões sobre a legislação moçambicana e Direito do Trabalho. Como posso ajudar juridicamente?',
					sources: [],
				})
			}

			try {
				const contextDocs = await PineconeService.retrieveRelevantDocs(
					question,
					limit ?? 8,
				)

				if (!contextDocs || contextDocs.length === 0) {
					const isEN = isEnglishQuestion(question)
					return reply.status(200).send({
						answer: isEN
							? "I couldn't find specific information about this in the Mozambican legal database. My specialty is Law 13/2023 (Labor Law)."
							: 'Não encontrei informações específicas sobre este tópico na base de dados legal moçambicana. A minha especialidade é a Lei 13/2023 (Lei do Trabalho).',
						sources: [],
					})
				}

				const contextText = contextDocs
					.map(
						(doc, index) =>
							`[DOCUMENTO ${index + 1}]\nFonte: ${doc.metadata.source}\nConteúdo:\n${doc.pageContent}`,
					)
					.join('\n\n─────────────────\n\n')

				const response = await chatModel.invoke([
					[
						'system',
						`Você é um assistente jurídico especializado na Lei 13/2023 de Moçambique.

                        REGRAS DE IDIOMA E ESCOPO:
                        1. Responda SEMPRE no mesmo idioma da pergunta do usuário (Português ou Inglês).
                        2. Se a pergunta NÃO for sobre legislação moçambicana ou temas jurídicos, responda apenas:
                           - PT: "Desculpe, só posso ajudar com questões sobre a legislação moçambicana."
                           - EN: "Sorry, I can only help with questions regarding Mozambican legislation."
                        3. Se a informação não estiver no contexto abaixo, admita honestamente no idioma do usuário.

                        REGRAS DE RESPOSTA JURÍDICA:
                        - Seja direto e profissional.
                        - Cite obrigatoriamente: Artigo, Número e Alínea.
                        - Traduza termos técnicos se responder em Inglês (ex: "Artigo" vira "Article", "Número" vira "Number"), mas mantenha o nome da lei: "Lei 13/2023".
                        - Estrutura: Resposta direta -> Fundamentação -> Explicação prática.

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

				// Salva no cache por 5 minutos (300.000ms)
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
