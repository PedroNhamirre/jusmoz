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

The server defaults to port `8080`.

### API Endpoints

- **POST /chat**: Interacts with the AI assistant.
  - Body: `{ "question": "Qual é a pena para furto?" }`
- **POST /documents**: Uploads/indexes a new document (Requires `x-api-key`).
  - Body: `{ "url": "https://example.com/lei.pdf" }` or `{ "filePath": "/path/to/local/file.pdf" }`

API Documentation is available at `http://localhost:8080/docs`.

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
- `src/lib/`: External library clients (LangChain, Pinecone initialization).

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgements

- Pedro Nhamirre - *Project Author and Maintainer*
