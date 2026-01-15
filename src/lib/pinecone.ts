import { Pinecone } from '@pinecone-database/pinecone'
import { env } from '@/config/env.js'

const pinecone = new Pinecone({
	apiKey: env.PINECONE_API_KEY,
})

export const pineconeIndex = pinecone.index(env.PINECONE_INDEX_NAME)

export const pineconeNamespace = pineconeIndex.namespace(
	env.PINECONE_INDEX_NAMESPACE,
)
