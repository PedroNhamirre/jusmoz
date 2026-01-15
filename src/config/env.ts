import { z } from 'zod'

const envSchema = z.object({
	SERVER_PORT: z.coerce.number().default(3000),
	GROQ_API_KEY: z.string().min(1, 'Groq API Key is required'),
	ADMIN_API_KEY: z.string().min(1, 'security key is required'),

	PINECONE_API_KEY: z.string().min(1, 'Pinecone API Key is required'),
	PINECONE_INDEX_NAME: z.string().min(1, 'Pinecone Index Name is required'),
	PINECONE_INDEX_HOST: z
		.url('Pinecone Index Host must be a valid URL')
		.refine((val) => val.startsWith('https://'), {
			message: 'Pinecone Index Host must use HTTPS',
		}),
	PINECONE_INDEX_NAMESPACE: z.string().default('__default__'),
})

const _env = envSchema.safeParse(process.env)

if (_env.success === false) {
	console.error('Invalid environment variables:\n', z.treeifyError(_env.error))
	throw new Error('Application failed to start due to invalid configuration.')
}

export const env = _env.data
