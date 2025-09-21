from app.services.llm_groq import GroqLLM
llm = GroqLLM()

async def draft_letter(job_title: str, company: str, resume_md: str, job_desc: str, variant: str = "standard") -> str:
    style = {
        "short": "Concise and punchy (120-180 words).",
        "standard": "Professional, warm, 200-300 words.",
        "long": "Detailed and thorough, up to 450 words.",
    }.get(variant, "Professional, warm, 200-300 words.")

    messages = [
        {"role": "system", "content": "You are an expert tech recruiter and writing coach."},
        {"role": "user", "content":
            f"Write a cover letter.\n\nCompany: {company}\nRole: {job_title}\n\n"
            f"Resume (markdown):\n{resume_md}\n\nJob description:\n{job_desc}\n\n"
            f"Style: {style}\nReturn only the letter."
        },
    ]
    return await llm.chat(messages, temperature=0.3)
