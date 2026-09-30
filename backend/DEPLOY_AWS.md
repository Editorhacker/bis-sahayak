# AWS EC2 Deployment Guide — BIS SAHAYAK

## Architecture on EC2

```
EC2 Instance (t3.xlarge or c5.2xlarge recommended for CPU)
│
├── Docker Network: saarthi_net
│   ├── postgres      :5432  (pgvector/pgvector:pg16)
│   ├── ollama        :11434 (Llama 3.2 3B weights cached in volume)
│   ├── ai_service    :8000  (Python FastAPI – RAG + LLM)
│   └── backend       :3000  (TypeScript Express – business logic)
│
└── Host Ports Exposed: 3000 (backend), optionally 8000 (ai debug)
```

## 1. EC2 Instance Requirements

| Use case | Instance | vCPU | RAM | Storage |
|---|---|---|---|---|
| **Minimum (CPU-only)** | `t3.xlarge` | 4 | 16 GB | 30 GB gp3 |
| **Recommended (CPU-only)** | `c5.2xlarge` | 8 | 16 GB | 30 GB gp3 |
| **GPU (faster inference)** | `g4dn.xlarge` | 4 | 16 GB | T4 16 GB |

> **Why 16 GB RAM?**
> Llama 3.2 3B in Q4_K_M quantisation uses ~2.2 GB model + 1–2 GB KV cache.
> PostgreSQL + Python + Node together need ~3 GB. 8 GB is tight; 16 GB is comfortable.

## 2. EC2 Setup (Ubuntu 22.04)

```bash
# 1. Update system
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker

# 3. Install Docker Compose v2
sudo apt-get install -y docker-compose-plugin
docker compose version   # should print v2.x

# 4. Open Security Group ports
# Inbound: 22 (SSH), 3000 (API), 80/443 (if behind ALB)
# NEVER open 8000 (ai_service) or 11434 (ollama) to the internet
```

## 3. Deploy

```bash
# On EC2
git clone <your-repo> /opt/saarthi
cd /opt/saarthi/backend

# Copy and fill in secrets
cp .env.example .env.production
nano .env.production
# Set: JWT_SECRET, JWT_REFRESH_SECRET, COOKIE_SECRET,
#      AI_SERVICE_SECRET (32+ random chars),
#      CORS_ORIGIN (your frontend domain)

# Build and start (first boot pulls Llama 3.2 ~2 GB – takes 5-10 min)
docker compose --env-file .env.production up -d --build

# Watch model download progress
docker logs saarthi-ai -f
```

## 4. First-Boot Sequence

The startup order is enforced by healthchecks:

```
postgres (healthy) → ollama (healthy) → ai_service (pulls models, healthy) → backend (starts)
```

On the **very first boot**, `ai_service` will pull:
1. `llama3.2:3b` (~2.0 GB)
2. `nomic-embed-text` (~274 MB)

These are cached in the `ollama_data` Docker volume. Subsequent restarts/redeploys are instant.

## 5. GPU Setup (Optional, g4dn.xlarge)

```bash
# Install NVIDIA container toolkit
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Then uncomment the GPU block in `docker-compose.yml`:

```yaml
  ollama:
    ...
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

With GPU, Llama 3.2 3B runs in ~0.3s/token vs ~2–4s/token on CPU.

## 6. Useful Commands

```bash
# Check all services
docker compose ps

# View logs
docker logs saarthi-ai    -f   # Python AI service
docker logs saarthi-backend -f # TypeScript backend

# Test AI service health
curl http://localhost:8000/health

# Test backend health
curl http://localhost:3000/health

# List Ollama models
docker exec saarthi-ollama ollama list

# Run DB migrations (after deploy)
docker exec saarthi-backend node dist/scripts/migrate.js
# OR from host:
docker compose exec backend npm run db:push

# Seed data
docker compose exec backend npm run db:seed
```

## 7. .env.production Template

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

DATABASE_URL=postgresql://postgres:CHANGE_PASSWORD@postgres:5432/business_saarthi

JWT_SECRET=GENERATE_64_CHAR_RANDOM_STRING
JWT_REFRESH_SECRET=GENERATE_ANOTHER_64_CHAR_RANDOM_STRING
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
COOKIE_SECRET=GENERATE_64_CHAR_RANDOM_STRING

CORS_ORIGIN=https://your-frontend-domain.com

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

AI_SERVICE_URL=http://ai_service:8000
AI_SERVICE_SECRET=GENERATE_32_CHAR_RANDOM_STRING
AI_SERVICE_TIMEOUT_MS=120000

LOG_LEVEL=info
```

Generate secrets:
```bash
openssl rand -hex 32
```

## 8. Why This Architecture Works Perfectly

| Concern | Solution |
|---|---|
| **TS ↔ Python conflict** | Zero conflict. They're separate containers on the same Docker network, communicating via HTTP |
| **Model isolation** | Ollama runs in its own container; Python calls it; TypeScript never touches it |
| **Startup ordering** | Docker Compose healthchecks guarantee: DB → Ollama → AI → Backend |
| **Model persistence** | `ollama_data` volume means ~2 GB download only happens once |
| **Security** | Internal services not exposed to internet; shared secret prevents unauthorized calls |
| **Scaling** | ai_service and backend can be scaled independently with `--scale` |
