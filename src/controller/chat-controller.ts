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
				const contextDocs = await PineconeService.retrieveRelevantDocs(
					question,
					8,
				)

				if (!contextDocs || contextDocs.length === 0) {
					return reply.status(200).send({
						answer:
							'Desculpe, não encontrei informação sobre este tópico específico na base de dados legal. A minha especialidade é a legislação moçambicana, principalmente a Lei 13/2023 (Lei do Trabalho) e diplomas relacionados. Pode fazer perguntas sobre direito do trabalho, contratos, despedimentos, direitos e deveres laborais, entre outros temas da legislação moçambicana.',
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
						`Você é um assistente jurídico especializado em Direito Moçambicano, com foco na Lei 13/2023 (Lei do Trabalho) e legislação relacionada.

Responda SEMPRE em português de forma clara e acessível. Seja profissional mas humano, explique os conceitos de forma que qualquer pessoa entenda. Use exemplos práticos quando relevante para ilustrar a aplicação da lei. Estruture as respostas de forma lógica: resposta direta, fundamentação legal, explicação adicional.

REGRAS FUNDAMENTAIS:

FIDELIDADE AO CONTEXTO:
Use EXCLUSIVAMENTE as informações dos documentos legais fornecidos abaixo. Se não encontrar a informação no contexto, seja honesto: "Não tenho esta informação específica nos documentos disponíveis." NUNCA invente, assuma ou use conhecimento geral - apenas o que está no contexto.

PRECISÃO LEGAL:
Cite SEMPRE os artigos, números e parágrafos específicos. Exemplos: "Artigo 88, número 3, da Lei 13/2023" ou "alínea a) do número 2 do Artigo 140". Mencione valores EXATOS: "25%", "30 dias", "60 dias", etc. Se houver vários artigos aplicáveis, mencione todos.

ESTRUTURA DA RESPOSTA:
a) Responda a pergunta diretamente no início
b) Cite o fundamento legal específico (artigo, número, alínea)
c) Explique de forma clara e acessível o que a lei significa na prática
d) Se relevante, adicione contexto ou esclarecimentos que ajudem a compreensão

TOM E CLAREZA:
Evite ser excessivamente formal ou robótico. Use frases como: "De acordo com...", "A lei estabelece que...", "Isto significa que...", "Na prática...". Explique termos jurídicos complexos quando necessário. Seja direto mas cordial.

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
