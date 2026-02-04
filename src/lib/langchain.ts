import { ChatGroq } from '@langchain/groq'
import { PineconeEmbeddings, PineconeStore } from '@langchain/pinecone'
import { env } from '@/config/env.js'
import { pineconeIndex } from './pinecone.js'

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

export const LLM_CONFIG = {
	// Maximum tokens for output to prevent cost explosion
	maxTokens: 1024,
	// Temperature 0 for deterministic legal responses
	temperature: 0,
	// Timeout in milliseconds for LLM calls
	timeoutMs: 30000,
	// Retry configuration
	maxRetries: 2,
} as const

export const PINECONE_CONFIG = {
	// Timeout for Pinecone operations
	timeoutMs: 10000,
} as const

// ============================================================================
// EMBEDDINGS
// ============================================================================

export const pineconeEmbeddings = new PineconeEmbeddings({
	model: 'multilingual-e5-large',
	apiKey: env.PINECONE_API_KEY,
})

// ============================================================================
// CHAT MODEL WITH PRODUCTION SETTINGS
// ============================================================================

export const chatModel = new ChatGroq({
	apiKey: env.GROQ_API_KEY,
	model: 'llama-3.3-70b-versatile',
	temperature: LLM_CONFIG.temperature,
	maxTokens: LLM_CONFIG.maxTokens,
	maxRetries: LLM_CONFIG.maxRetries,
})

// ============================================================================
// VECTOR STORE
// ============================================================================

export async function getVectorStore() {
	return await PineconeStore.fromExistingIndex(pineconeEmbeddings, {
		pineconeIndex: pineconeIndex,
		namespace: env.PINECONE_INDEX_NAMESPACE,
		textKey: 'text',
	})
}

// ============================================================================
// TIMEOUT UTILITIES
// ============================================================================

export class LLMTimeoutError extends Error {
	constructor(message = 'LLM request timed out') {
		super(message)
		this.name = 'LLMTimeoutError'
	}
}

export class PineconeTimeoutError extends Error {
	constructor(message = 'Pinecone request timed out') {
		super(message)
		this.name = 'PineconeTimeoutError'
	}
}

/**
 * Wraps a promise with a timeout
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	errorFactory: () => Error,
): Promise<T> {
	let timeoutId: NodeJS.Timeout

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(errorFactory()), timeoutMs)
	})

	try {
		const result = await Promise.race([promise, timeoutPromise])
		clearTimeout(timeoutId!)
		return result
	} catch (error) {
		clearTimeout(timeoutId!)
		throw error
	}
}

/**
 * Invoke chat model with timeout protection
 */
export async function invokeWithTimeout(
	messages: Parameters<typeof chatModel.invoke>[0],
	timeoutMs = LLM_CONFIG.timeoutMs,
) {
	return withTimeout(
		chatModel.invoke(messages),
		timeoutMs,
		() => new LLMTimeoutError(`LLM request timed out after ${timeoutMs}ms`),
	)
}
