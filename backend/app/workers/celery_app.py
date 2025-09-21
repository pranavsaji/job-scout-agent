import os
from celery import Celery

BROKER = os.getenv("REDIS_URL")
celery = Celery("job_scout", broker=BROKER, backend=BROKER)
celery.conf.task_routes = {"app.workers.tasks.*": {"queue": "default"}}