import { fastifyCors } from '@fastify/cors'
import { fastifySwagger } from '@fastify/swagger'
import ScalarApiReference from '@scalar/fastify-api-reference'
import { fastify } from 'fastify'
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { env } from '@/config/env.js'
import { swaggerOptions } from '@/config/swagger.js'
import { registerRoutes } from '@/controller/index.js'

const app = fastify({
	logger: true,
}).withTypeProvider<ZodTypeProvider>()

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.register(fastifyCors, { origin: true })
app.register(fastifySwagger, swaggerOptions)

app.register(ScalarApiReference, {
	routePrefix: '/docs',
	configuration: {
		theme: 'fastify',
		hideDownloadButton: true,
		layout: 'modern',
		defaultHttpClient: {
			targetKey: 'js',
			clientKey: 'fetch',
		},
		isLoading: true,
		metaData: {
			title: 'Docs | JUSMOZ',
			description: 'My page description',
		},
		authentication: {
			preferredSecurityScheme: 'apiKey',
		},
	},
})
app.register(registerRoutes)

app.addHook('preHandler', async (request, reply) => {
	if (request.url.startsWith('/docs')) return
	if (request.url.startsWith('/chat')) return

	const apiKey = request.headers['x-api-key']
	if (apiKey !== env.ADMIN_API_KEY) {
		return reply.status(401).send({ error: 'Unauthorized' })
	}
})

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
for (const signal of signals) {
	process.on(signal, async () => {
		app.log.info(`Received ${signal}, shutting down...`)
		await app.close()
		process.exit(0)
	})
}

app.listen(
	{
		port: Number(env.SERVER_PORT),
		host: '0.0.0.0',
	},
	(err, address) => {
		if (err) {
			app.log.error(err)
			process.exit(1)
		}
		console.log(`Server listening at ${address}`)
	},
)
