import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

export const swaggerOptions: FastifyDynamicSwaggerOptions = {
	openapi: {
		info: {
			title: 'JusMOZ API',
			version: '1.0.0',
			description: `
## Intelligent Legal Assistant for Mozambique
Welcome to the official JusMOZ API. This platform leverages Artificial Intelligence and vector search to interpret and answer questions regarding Mozambican legislation.

###  Core Features
* **Document Synchronization**: Upload and processing of official Mozambican Gazettes (Boletim da República) in PDF format.
* **Semantic Search**: Retrieval of legal context based on meaning and intent, going beyond simple keyword matching.
* **RAG Chat**: Generative AI that provides legal answers while explicitly citing official sources.
`,
			contact: {
				name: 'Pedro Nhamirre',
				email: 'pedrooliv62@gmail.com',
			},
		},
		components: {
			securitySchemes: {
				apiKey: {
					type: 'apiKey',
					name: 'x-api-key',
					in: 'header',
				},
			},
		},
	},
	transform: jsonSchemaTransform,
}
