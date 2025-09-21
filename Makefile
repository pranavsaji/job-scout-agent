.PHONY: up down logs test lint fmt migrate
up:
	docker compose --env-file .env up -d --build
	docker compose logs -f backend

down:
	docker compose down -v

logs:
	docker compose logs -f

migrate:
	cd backend && alembic revision --autogenerate -m \"auto\" && alembic upgrade head

fmt:
	cd backend && ruff check --fix . && black .

lint:
	cd backend && ruff check .

test:
	cd backend && pytest -q