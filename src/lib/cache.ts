import type { FastifyReply, FastifyRequest } from 'fastify'

interface CacheEntry {
	value: unknown
	expiry: number
	accessCount: number
	lastAccessed: number
}

// ============================================================================
// LRU CACHE MANAGER WITH SIZE LIMITS
// ============================================================================

class CacheManager {
	private cache: Map<string, CacheEntry>
	private defaultTTL: number
	private maxSize: number
	private cleanupInterval: NodeJS.Timeout | null = null

	constructor(defaultTTL = 300000, maxSize = 1000) {
		this.cache = new Map()
		this.defaultTTL = defaultTTL
		this.maxSize = maxSize
		this.startCleanupInterval()
	}

	private startCleanupInterval(): void {
		this.cleanupInterval = setInterval(() => {
			this.cleanup()
		}, 60000)
	}

	private cleanup(): void {
		const now = Date.now()
		for (const [key, entry] of this.cache.entries()) {
			if (entry.expiry < now) {
				this.cache.delete(key)
			}
		}
	}

	/**
	 * Evict least recently used entries when cache exceeds max size
	 */
	private evictLRU(): void {
		if (this.cache.size <= this.maxSize) return

		// Convert to array and sort by last accessed time
		const entries = Array.from(this.cache.entries()).sort(
			(a, b) => a[1].lastAccessed - b[1].lastAccessed,
		)

		// Remove oldest 20% of entries
		const toRemove = Math.ceil(this.cache.size * 0.2)
		for (let i = 0; i < toRemove; i++) {
			this.cache.delete(entries[i][0])
		}
	}

	get<T>(key: string): T | null {
		const entry = this.cache.get(key)
		if (!entry) return null

		if (entry.expiry < Date.now()) {
			this.cache.delete(key)
			return null
		}

		// Update LRU tracking
		entry.lastAccessed = Date.now()
		entry.accessCount++

		return entry.value as T
	}

	set(key: string, value: unknown, ttl?: number): void {
		// Evict if necessary before adding new entry
		if (this.cache.size >= this.maxSize) {
			this.evictLRU()
		}

		const now = Date.now()
		const expiry = now + (ttl || this.defaultTTL)
		this.cache.set(key, {
			value,
			expiry,
			accessCount: 1,
			lastAccessed: now,
		})
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

	/**
	 * Get cache statistics for monitoring
	 */
	getStats(): {
		size: number
		maxSize: number
		utilizationPercent: number
	} {
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
			utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100),
		}
	}

	/**
	 * Graceful shutdown - clear interval
	 */
	shutdown(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
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
