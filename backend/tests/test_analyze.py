from app.services.analyzer import analyze_fit


def test_schema_smoke(monkeypatch):
    # monkeypatch chat() to avoid calling Groq in CI
    from app.services import llm_groq
    def fake_chat(*args, **kwargs):
        return '{"fit_score":87,"strengths":["Python"],"gaps":["Kubernetes"],"ats_keywords":{"hit":["Python"],"partial":[],"miss":[]},"rationale":"ok"}'
    monkeypatch.setattr(llm_groq, "chat", fake_chat)

    out = analyze_fit("AI Eng", "Acme", "LLM work", "Python ML", [])
    assert 0 <= out["fit_score"] <= 100
