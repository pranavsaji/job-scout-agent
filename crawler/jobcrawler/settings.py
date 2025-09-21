import os
BOT_NAME = "jobcrawler"
SPIDER_MODULES = ["jobcrawler.spiders"]
NEWSPIDER_MODULE = "jobcrawler.spiders"
USER_AGENT = os.getenv("CRAWLER_USER_AGENT","JobScoutAgentBot/1.0")
ROBOTSTXT_OBEY = os.getenv("CRAWL_RESPECT_ROBOTS","true").lower() == "true"
CONCURRENT_REQUESTS = 8
DOWNLOAD_DELAY = 0.25
ITEM_PIPELINES = {"jobcrawler.pipelines.RestSink": 300}
