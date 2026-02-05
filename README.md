# Jusmoz

## Overview

Jusmoz is a specialized legal AI assistant focused on Mozambican Law. It leverages Retrieval-Augmented Generation (RAG) to provide accurate, context-aware answers based on official legal documents. The system allows for the ingestion of PDF legislation (local or via URL), indexes them into a vector database, and serves a chat API where users can query legal matters in natural language.

> **Important Note**: Currently, the system's knowledge base consists exclusively of the **Lei do Trabalho (Lei n.º 13/2023 de 25 de Agosto)**, which revokes the previous Lei n.º 23/2007.

## Features

- **Legal Document Ingestion**: automatic processing, cleaning, and indexing of PDF documents (Bulletin of the Republic, Laws, etc.).
- **Context-Aware AI Chat**: uses LangChain and Groq to answer legal questions using strictly the context of indexed documents.
- **Vector Search**: fast semantic search using Pinecone to retrieve relevant legal provisions.
- **API Documentation**: interactive Swagger/Scalar documentation available at `/docs`.
- **Validation**: uses Zod for strict runtime environment and request payload validation.
- **Security Features**: prompt injection detection, PII masking, legal response validation, and HTTPS enforcement.
- **Rate Limiting**: configurable rate limits per endpoint to prevent abuse.
- **CORS Support**: configurable CORS with origins, methods, and headers.
- **Caching**: intelligent caching system for frequently asked questions.
- **Multi-language Support**: automatic language detection (Portuguese/English) with appropriate responses.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/PedroNhamirre/jusmoz.git
   cd jusmoz
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the project:

   ```bash
   pnpm build
   ```

## Usage

### Starting the Server

To run the server in development mode with hot-reloading:

```bash
pnpm dev
```

To run the built production version:

```bash
pnpm start
```

The server defaults to port `3000`.

### API Endpoints

#### Public Endpoints

- **GET /health**: Health check endpoint.
  - Response: `{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z", "uptime": 123.45 }`

- **POST /chat**: Interacts with the AI assistant about Mozambican Law.
  - Body: `{ "question": "Qual é o período de férias segundo a lei do trabalho?", "limit": 5, "conversationHistory": [] }`
  - Response: AI-generated answer with legal citations and sources
  - Rate limit: 10 requests per minute

#### Protected Endpoints (Requires `x-api-key` header)

- **POST /documents**: Upload and process a law document from URL.
  - Body: `{ "url": "https://example.com/lei.pdf" }`
  - Response: `{ "message": "Document uploaded and processed successfully", "chunks": 150 }`

- **POST /documents/upload**: Upload and process a law document from file.
  - Body: multipart/form-data with PDF file
  - Response: `{ "message": "Document uploaded and processed successfully", "chunks": 150 }`

- **GET /documents**: Retrieve legal context from Pinecone vector database.
  - Query: `?question=example&limit=5`
  - Response: Array of relevant document chunks with metadata

#### Documentation

Interactive API documentation is available at `http://localhost:3000/docs`.

## Technologies

- **Runtime**: Node.js, TypeScript
- **Framework**: Fastify
- **AI/ML Ops**: LangChain, Pinecone (Vector Database), Groq (LLM Inference)
- **Validation**: Zod
- **Documentation**: Scalar (Swagger)
- **Tooling**: Biome, pnpm

## Configuration

The application requires the following environment variables to be set in a `.env` file (see `src/config/env.ts`):

| Variable | Description |
|----------|-------------|
| `SERVER_PORT` | Port to run the server (default: 3000) |
| `GROQ_API_KEY` | API Key for Groq (LLM provider) |
| `ADMIN_API_KEY` | Secret key for protecting administrative routes |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX_NAME` | Pinecone index name |
| `PINECONE_INDEX_HOST` | Pinecone index URL (must start with https://) |
| `PINECONE_INDEX_NAMESPACE` | Optional namespace (default: `__default__`) |
| `CORS_ORIGIN` | Allowed origins for CORS (default: `http://localhost:3000`, comma-separated) |
| `CORS_METHODS` | Allowed HTTP methods (default: `POST,GET,OPTIONS`, comma-separated) |
| `CORS_ALLOWED_HEADERS` | Allowed headers (default: `Content-Type,x-api-key`, comma-separated) |

## Requirements

- Node.js (Latest LTS recommended)
- pnpm package manager
- A Pinecone account and index setup
- A Groq API key

## Repository Structure

- `src/server.ts`: Application entry point and server configuration.
- `src/config/`: Environment variables and Swagger configuration.
  - `env.ts`: Schema validation for env vars.
- `src/controller/`: Request handlers.
  - `chat-controller.ts`: Handles AI chat logic.
  - `document-controller.ts`: Handles document upload and indexing.
  - `schemas.ts`: Zod schemas for API request/response.
- `src/services/`: Business logic.
  - `process-pdf.ts`: PDF parsing, cleaning, and splitting logic.
  - `pinecone-service.ts`: Interaction with vector database.
- `src/lib/`: External library clients and utilities.
  - `langchain.ts`: LangChain and Groq LLM configuration.
  - `pinecone.ts`: Pinecone vector database initialization.
  - `cache.ts`: Caching implementation for improved performance.
  - `security.ts`: Security utilities (PII masking, injection detection, language detection).
  - `legal-validator.ts`: Legal response validation.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgements

- Pedro Nhamirre - *Project Author and Maintainer*
