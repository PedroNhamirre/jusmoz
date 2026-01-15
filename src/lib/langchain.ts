import { ChatGroq } from '@langchain/groq'
import { PineconeEmbeddings, PineconeStore } from '@langchain/pinecone'
import { env } from '@/config/env.js'
import { pineconeIndex } from './pinecone.js'

export const pineconeEmbeddings = new PineconeEmbeddings({
	model: 'multilingual-e5-large',
	apiKey: env.PINECONE_API_KEY,
})

export const chatModel = new ChatGroq({
	apiKey: env.GROQ_API_KEY,
	model: 'llama-3.3-70b-versatile',
	temperature: 0,
})

export async function getVectorStore() {
	return await PineconeStore.fromExistingIndex(pineconeEmbeddings, {
		pineconeIndex: pineconeIndex,
		namespace: env.PINECONE_INDEX_NAMESPACE,
		textKey: 'text',
	})
}
