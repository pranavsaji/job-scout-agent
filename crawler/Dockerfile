FROM python:3.11-slim
WORKDIR /crawler
COPY pyproject.toml /crawler/
RUN pip install --no-cache-dir -r <(python - <<'PY'
import tomllib;print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))
PY
) || true
COPY jobcrawler /crawler/jobcrawler
COPY scrapy.cfg /crawler/
CMD ["scrapy","list"]
