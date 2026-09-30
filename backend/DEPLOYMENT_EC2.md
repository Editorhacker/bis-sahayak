# 🚀 AWS EC2 Deployment Guide: BIS SAHAYAK Backend

This guide outlines the end-to-end steps to deploy and manage the **BIS SAHAYAK** backend microservices on an AWS EC2 instance.

---

## 🏗️ Architecture Overview

The backend consists of 4 containerized services managed by Docker Compose:

```
[ Client / Frontend ]
         │ (HTTP Port 3000 /api/v1)
         ▼
[ saarthi-backend (Node.js 20 Express) ]
   ├── (PostgreSQL / pgvector Port 5432) ──> [ saarthi-postgres ]
   └── (Internal HTTP Port 8000) ──────────> [ saarthi-ai (FastAPI Python 3.11) ]
                                                   ├── (pgvector Port 5432) ──> [ saarthi-postgres ]
                                                   └── (Ollama Port 11434) ───> [ saarthi-ollama (Llama 3.2 3B) ]
```

---

## 1. 🖥️ EC2 Instance Specifications

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Instance Type** | `t3.large` (2 vCPU, 8 GB RAM) | `t3.xlarge` (4 vCPU, 16 GB RAM) or `c6i.2xlarge` |
| **Storage (EBS)** | 30 GB gp3 | 50 GB gp3 |
| **Operating System**| Ubuntu 22.04 LTS | Ubuntu 22.04 / 24.04 LTS |

> **IMPORTANT**: Avoid `t2.micro` or `t3.medium`. Running Ollama (Llama 3.2 3B), pgvector PostgreSQL, and Node.js concurrently requires at least 6–8 GB of RAM. Insufficient memory will trigger Linux kernel OOM kills.

---

## 2. 🛡️ AWS Security Group Configuration

Configure the following inbound rules on your EC2 Security Group:

| Type | Port Range | Source | Description |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | Your IP / `0.0.0.0/0` | Administrative SSH Access |
| **Custom TCP** | `3000` | `0.0.0.0/0` | Express REST API (`/api/v1`) |
| **HTTP / HTTPS** | `80`, `443` | `0.0.0.0/0` | Optional: Nginx reverse proxy / SSL |

*Internal ports `5432` (Postgres), `8000` (FastAPI), and `11434` (Ollama) remain private within the Docker bridge network.*

---

## 3. ⚙️ Initial EC2 Instance Configuration

Connect to your EC2 instance:
```bash
ssh -i /path/to/your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

### 3.1. Configure 4GB Swap Space (OOM Prevention)
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.2. Install Docker & Docker Compose Plugin
```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable docker command without sudo
sudo usermod -aG docker $USER
newgrp docker
```

---

## 4. 📂 Repository Setup & Environment Configuration

### 4.1. Clone Codebase
```bash
sudo mkdir -p /opt/saarthi
sudo chown -R ubuntu:ubuntu /opt/saarthi
cd /opt/saarthi

# Clone repository
git clone <YOUR_GIT_REPOSITORY_URL> .
cd backend
```

### 4.2. Create Production Environment File (`.env`)
Create and edit `/opt/saarthi/backend/.env`:
```bash
nano .env
```

Paste the following production configuration:

```env
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=business_saarthi
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/business_saarthi

# JWT & Authentication Tokens (32+ characters)
JWT_SECRET=mdheNDh09CRS5SOiTXHaFamvKGGC2iewNosN5QmHfzO
JWT_REFRESH_SECRET=edDMp16G2BxdqApWFRr284Qp1yEJr3hXHuPLrMVraGt
COOKIE_SECRET=oPp8v4dX+2XordkJN5f7xuB45Sp/fzIaFR40s9pGeGo=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS (Allow your frontend domain and localhost testing)
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Internal AI Microservice Communication
AI_SERVICE_URL=http://ai_service:8000
AI_SERVICE_SECRET=luV0g197kuZiPshCsLzhPUVbtQQK7g8xCFoHp6CIRFB
AI_SERVICE_TIMEOUT_MS=120000

# Ollama Configuration
OLLAMA_BASE_URL=http://ollama:11434
LLM_MODEL=llama3.2:3b
EMBEDDING_MODEL=nomic-embed-text
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=2048
LLM_TIMEOUT=120
```

---

## 5. 🐳 Build & Launch Docker Services

### 5.1. Build and Start All Containers
```bash
cd /opt/saarthi/backend
docker compose up -d --build
```

### 5.2. Monitor Model Download on First Launch
On the initial launch, `saarthi-ai` waits for `saarthi-ollama` to pull `llama3.2:3b` (~2.0 GB) and `nomic-embed-text` (~270 MB). Monitor progress:
```bash
docker compose logs -f ai_service
```

Look for the success messages:
```text
Model 'llama3.2:3b' ready ✓
Model 'nomic-embed-text' ready ✓
Application startup complete.
```

---

## 6. 🗄️ Database Initialization & Seeding

> **CRITICAL**: Do not run `npm run db:push` or `npm run db:seed` inside the production container. Run schema and seed scripts directly via PostgreSQL:

```bash
cd /opt/saarthi/backend

# Step 1: Initialize Database Schema (Tables, Enums, pgvector, Indexes)
docker compose exec -T postgres psql -U postgres -d business_saarthi < init-schema.sql

# Step 2: Seed Baseline Compliance Standards, Documents, Chunks, and Admin User
docker compose exec -T postgres psql -U postgres -d business_saarthi < seed.sql
```

### 6.1. Verify Database Data
```bash
docker compose exec postgres psql -U postgres -d business_saarthi -c \
  "SELECT count(*) AS total_standards FROM standards; SELECT count(*) AS total_chunks FROM chunks;"
```
Expected output:
```text
 total_standards 
-----------------
               5

 total_chunks 
--------------
           23
```

---

## 7. 🧪 Health Checks & Verification

### 7.1. Check Backend Express API
```bash
curl -i http://localhost:3000/health
```
*Expected response: HTTP 200 with status `healthy`.*

### 7.2. Check Python AI Service
```bash
curl -i http://localhost:8000/health
```
*Expected response: HTTP 200 with status `healthy`.*

### 7.3. Test Authentication API
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin_test@example.com","password":"Password123!","name":"Admin Test"}'
```

---

## 8. 🌐 Connect Frontend Application

In your frontend project (`frontend/.env`):
```env
VITE_API_URL=http://<YOUR_EC2_PUBLIC_IP>:3000/api/v1
```

Build or run the frontend:
```bash
cd /path/to/frontend
npm run build # or npm run dev
```

---

## 9. 🛠️ Day-to-Day Maintenance & Deployment Workflow

### 9.1. Deploying Code Updates
When code updates are pushed to GitHub:
```bash
cd /opt/saarthi/backend

# 1. Pull code updates
git pull origin main

# 2. Rebuild application containers
docker compose build backend ai_service

# 3. Restart application containers with zero downtime to database and models
docker compose up -d backend ai_service
```

### 9.2. Monitoring & Logs
```bash
# Check container statuses
docker compose ps

# Live backend logs
docker compose logs backend -f --tail=50

# Live AI service logs
docker compose logs ai_service -f --tail=50

# Live PostgreSQL logs
docker compose logs postgres -f --tail=50
```

### 9.3. Resetting Database (Optional)
If test records need to be cleared:
```bash
docker compose exec postgres psql -U postgres -d business_saarthi -c \
  "TRUNCATE businesses, products, conversations, messages CASCADE;"
```

---

## 10. ⚠️ Common Issues & Troubleshooting

| Issue Encountered | Root Cause | Solution |
| :--- | :--- | :--- |
| **`404 Not Found on /auth/register`** | Express routes are mounted under `/api/v1` | Ensure API calls use `/api/v1/auth/register`. |
| **`drizzle-kit: not found`** | Dev dependencies are excluded in container runtime | Initialize schema using `init-schema.sql` and `seed.sql`. |
| **`400 Bad Request on /businesses`** | Empty strings passed for enum fields | Handled in updated `validationSchemas.ts` and `ChatPage.tsx`. Pull latest code. |
| **AI Request Timeout (> 120s)** | CPU-based LLM inference latency under heavy load | Ensure `AI_SERVICE_TIMEOUT_MS=120000` is set in `.env`. |
| **Container Killed / Exit Code 137** | Out of Memory (OOM) | Ensure EC2 instance is at least `t3.large` and 4GB swap space is enabled. |
