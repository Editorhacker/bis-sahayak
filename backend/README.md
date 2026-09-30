# BIS SAHAYAK Backend

Production-grade backend for BIS SAHAYAK - BIS Compliance Roadmap API.

## Tech Stack

- **Language**: TypeScript (Node 20+)
- **API**: Express + Zod validation
- **Database**: PostgreSQL 16 + pgvector
- **ORM**: Drizzle ORM
- **Auth**: JWT (access + refresh) with httpOnly cookies, Argon2id
- **LLM**: Provider interface (Gemini Flash primary, Groq fallback, Ollama offline)
- **Search**: Postgres FTS + pgvector + Reciprocal Rank Fusion
- **Security**: Helmet, CORS, Rate Limiting, Zod validation, Parameterized SQL
- **Logging**: Pino structured JSON

## Project Structure

```
server/src/
  config/           # Environment configuration
  modules/
    auth/           # Authentication (register, login, refresh, logout)
    users/          # User management
    businesses/     # Business profile CRUD
    products/       # Product management
    roadmap/        # Roadmap engine (rules, dependencies, BIS)
    requirements/   # Requirements CRUD + applicability
    standards/      # BIS standards search & recommendation
    labs/           # Testing labs search
    chat/           # Chat pipeline (analyzer, orchestrator, retrieval, validator)
    applications/   # Application tracker + prefill
    feedback/       # User feedback
    admin/          # Admin panel (sources, metrics)
  ai/
    llm.ts          # LLM provider interface + retry + JSON repair
    embeddings.ts   # Embedding provider
    retrieval.ts    # Hybrid search (FTS + vector + RRF)
    validator.ts    # Evidence validation + confidence computation
    prompts.ts      # System prompts
  middleware/       # Security, auth, validation, error handling, logging
  utils/            # Helpers, date utils, validation schemas
  db/               # Database schema & connection
  server.ts         # Express app entry point
scripts/            # Seed, benchmark, ingestion scripts
data/               # Seed CSVs, raw snapshots, sources.csv
```

## Security Features

- HTTPS-ready with Helmet headers
- CORS allowlist
- Rate limiting (per IP and per user)
- Zod validation on all inputs
- Parameterized SQL only (Drizzle ORM)
- Argon2id password hashing
- Secrets in environment variables only
- Prompt injection defense (delimited data blocks)
- Privacy: No PII sent to LLM providers
- Structured logging without sensitive values
- Compliance disclaimer on all responses

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16 with pgvector extension
- LLM API key (Gemini, Groq, or Ollama)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Generate database migrations
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

### Docker

```bash
# Start with Docker Compose
docker-compose up -d

# Run seed
docker-compose exec backend npm run db:seed
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Business Profiles
- `POST /api/v1/businesses` - Create business
- `GET /api/v1/businesses` - List businesses
- `GET /api/v1/businesses/:id` - Get business
- `PATCH /api/v1/businesses/:id` - Update business
- `DELETE /api/v1/businesses/:id` - Delete business
- `POST /api/v1/businesses/:id/confirm-profile` - Confirm profile

### Products
- `POST /api/v1/businesses/:id/products` - Create product
- `GET /api/v1/businesses/:id/products` - List products
- `GET /api/v1/businesses/:id/products/:pid` - Get product
- `PATCH /api/v1/businesses/:id/products/:pid` - Update product
- `DELETE /api/v1/businesses/:id/products/:pid` - Delete product

### Roadmap
- `POST /api/v1/businesses/:id/roadmap` - Generate roadmap
- `GET /api/v1/businesses/:id/roadmap` - Get roadmap
- `POST /api/v1/businesses/:id/roadmap/regenerate` - Regenerate preserving completed
- `PATCH /api/v1/roadmap/:roadmapId/steps/:stepId` - Update step status
- `GET /api/v1/roadmap/steps/:stepId/why` - Get step reason with sources

### Chat
- `POST /api/v1/chat/message` - Send message (SSE streaming)
- `GET /api/v1/chat/conversations` - List conversations
- `GET /api/v1/chat/conversations/:id` - Get conversation

### BIS Standards
- `GET /api/v1/standards/search?q=` - Search standards
- `POST /api/v1/standards/recommend` - Recommend from product description
- `GET /api/v1/standards/:standardNumber` - Get standard details

### Laboratories
- `GET /api/v1/laboratories?state=&city=&test=` - Search labs

### Applications
- `POST /api/v1/applications` - Create application
- `GET /api/v1/applications` - List applications
- `GET /api/v1/applications/:id` - Get application
- `PATCH /api/v1/applications/:id` - Update application
- `GET /api/v1/applications/:id/prefill` - Get prefilled form data

### Requirements
- `GET /api/v1/requirements` - List requirements
- `GET /api/v1/requirements/:id` - Get requirement detail
- `GET /api/v1/requirements/search?q=` - Search requirements

### Admin
- `POST /api/v1/admin/sources` - Upload source document
- `POST /api/v1/admin/ingest` - Ingest documents
- `GET /api/v1/admin/metrics` - Get benchmark metrics
- `GET /api/v1/admin/sources` - List sources

## Environment Variables

See `.env.example` for all required variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `JWT_REFRESH_SECRET` - Refresh token secret (min 32 chars)
- `COOKIE_SECRET` - Cookie signing secret (min 32 chars)
- `GEMINI_API_KEY` - Google Gemini API key
- `CORS_ORIGIN` - Frontend origin for CORS

## Database Schema

The schema includes tables for:
- Users, Businesses, Products
- Documents, Chunks (with vector embeddings)
- Standards, Requirements, Applicability Rules
- Fees, Tax Rules, Labs, Scheme Rules
- Roadmaps, Roadmap Steps, Citations
- Applications, Conversations, Messages, Feedback

## Scripts

- `npm run dev` - Start dev server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Drizzle Studio
- `npm run db:seed` - Seed database with initial data
- `npm run lint` - Run ESLint

## Evaluation

Run benchmark:
```bash
npm run db:seed
npx tsx server/scripts/benchmark.ts
```

Targets:
- Retrieval hit@3: ≥80%
- Citation correctness: ≥90%
- Unsupported answer rate: <5%
- Roadmap recall: ≥85%
- Refusal correctness: 100%

## License

MIT