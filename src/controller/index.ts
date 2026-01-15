import type { FastifyInstance } from 'fastify'
import { chatWithAI } from '@/controller/chat-controller.js'
import {
	retrieveDocument,
	upsertDocument,
} from '@/controller/document-controller.js'

export async function registerRoutes(app: FastifyInstance) {
	await app.register(upsertDocument)
	await app.register(retrieveDocument)
	await app.register(chatWithAI)
}
