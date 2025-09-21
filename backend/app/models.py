import uuid
from sqlalchemy import Column, String, Text, JSON, Integer, TIMESTAMP, ForeignKey, Numeric, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class Job(Base):
    __tablename__ = "jobs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String, nullable=False)
    company = Column(String, nullable=False)
    title = Column(String, nullable=False)
    location = Column(String)
    remote = Column(String)
    employment_type = Column(String)
    level = Column(String)
    posted_at = Column(TIMESTAMP, nullable=False)
    apply_url = Column(Text, nullable=False)
    canonical_url = Column(Text)
    currency = Column(String)
    salary_min = Column(Numeric)
    salary_max = Column(Numeric)
    salary_period = Column(String)
    description_md = Column(Text, nullable=False)
    description_raw = Column(Text)
    hash_sim = Column(String, nullable=False)
    meta = Column(JSON)

    analyses = relationship("JobAnalysis", back_populates="job", cascade="all, delete-orphan")
    letters = relationship("CoverLetter", back_populates="job", cascade="all, delete-orphan")

class JobAnalysis(Base):
    __tablename__ = "job_analyses"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"))
    resume_version = Column(String)
    fit_score = Column(Integer)
    strengths = Column(JSON)
    gaps = Column(JSON)
    ats_keywords = Column(JSON)
    rationale = Column(Text)
    created_at = Column(TIMESTAMP)

    job = relationship("Job", back_populates="analyses")

class CoverLetter(Base):
    __tablename__ = "cover_letters"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"))
    resume_version = Column(String)
    variant = Column(String)
    tone = Column(String)
    letter_md = Column(Text)
    created_at = Column(TIMESTAMP)
    user_edited = Column(Boolean, default=False)

    job = relationship("Job", back_populates="letters")