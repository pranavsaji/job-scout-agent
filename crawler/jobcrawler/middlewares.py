import base64
import json
import logging
from scrapy import signals
from scrapy.exceptions import NotConfigured
from scrapy.http import Request

class ROT13Middleware:
    def __init__(self, enabled=False):
        self.enabled = enabled

    @classmethod
    def from_crawler(cls, crawler):
        enabled = crawler.settings.getbool("ROT13_MIDDLEWARE_ENABLED", False)
        if not enabled:
            raise NotConfigured
        return cls(enabled)

    def process_request(self, request: Request, spider):
        # Example: add a ROT13 encoded header to requests
        if self.enabled:
            headers = request.headers or {}
            header = headers.get(b"X-Rot13", b"")
            if header:
                decoded = base64.b64decode(header).decode()
                rotated = decoded[::13]
                headers[b"X-Rot13"] = rotated.encode()
        return
