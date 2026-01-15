import type { FastifyReply, FastifyRequest } from 'fastify'

interface CacheEntry {
	value: unknown
	expiry: number
}

class CacheManager {
	private cache: Map<string, CacheEntry>
	private defaultTTL: number

	constructor(defaultTTL = 300000) {
		this.cache = new Map()
		this.defaultTTL = defaultTTL
		this.startCleanupInterval()
	}

	private startCleanupInterval(): void {
		setInterval(() => {
			const now = Date.now()
			for (const [key, entry] of this.cache.entries()) {
				if (entry.expiry < now) {
					this.cache.delete(key)
				}
			}
		}, 60000)
	}

	get<T>(key: string): T | null {
		const entry = this.cache.get(key)
		if (!entry) return null

		if (entry.expiry < Date.now()) {
			this.cache.delete(key)
			return null
		}

		return entry.value as T
	}

	set(key: string, value: unknown, ttl?: number): void {
		const expiry = Date.now() + (ttl || this.defaultTTL)
		this.cache.set(key, { value, expiry })
	}

	delete(key: string): void {
		this.cache.delete(key)
	}

	clear(): void {
		this.cache.clear()
	}

	has(key: string): boolean {
		const entry = this.cache.get(key)
		if (!entry) return false
		if (entry.expiry < Date.now()) {
			this.cache.delete(key)
			return false
		}
		return true
	}

	size(): number {
		return this.cache.size
	}
}

export const cacheManager = new CacheManager()

/**
 * Generate cache key from request
 */
export function generateCacheKey(request: FastifyRequest): string {
	const { url, method, body } = request
	const bodyString = body ? JSON.stringify(body) : ''
	return `${method}:${url}:${bodyString}`
}

export function cacheResponse(ttl?: number) {
	return async (
		request: FastifyRequest,
		reply: FastifyReply,
		done: () => void,
	) => {
		const cacheKey = generateCacheKey(request)
		const cachedResponse = cacheManager.get(cacheKey)

		if (cachedResponse) {
			reply.header('X-Cache', 'HIT')
			reply.send(cachedResponse)
			return
		}

		reply.header('X-Cache', 'MISS')

		const originalSend = reply.send.bind(reply)

		reply.send = (payload: unknown) => {
			if (reply.statusCode >= 200 && reply.statusCode < 300) {
				cacheManager.set(cacheKey, payload, ttl)
			}
			return originalSend(payload)
		}

		done()
	}
}
