import type { FastifyInstance } from 'fastify'

export interface RateLimitConfig {
	max: number
	timeWindow: string | number
	errorMessage?: string
}

export const defaultRateLimitConfig: RateLimitConfig = {
	max: 100, // 100 requests
	timeWindow: '1 minute', // per minute
	errorMessage: 'Rate limit exceeded. Please try again later.',
}

export const chatRateLimitConfig: RateLimitConfig = {
	max: 10, // 10 requests
	timeWindow: '1 minute', // per minute
	errorMessage: 'Too many chat requests. Please wait before trying again.',
}

export const documentRateLimitConfig: RateLimitConfig = {
	max: 20,
	timeWindow: '5 minutes',
	errorMessage:
		'Too many document operations. Please wait before trying again.',
}

export function setupRateLimiting(app: FastifyInstance) {
	app.addHook('onError', async (_request, reply, error) => {
		if (error.statusCode === 429) {
			reply.status(429).send({
				error: 'Rate limit exceeded',
				message: 'Too many requests. Please try again later.',
				retryAfter: reply.getHeader('Retry-After'),
			})
		}
	})
}
