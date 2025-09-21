'use client';
import { useState } from 'react';
import { client } from '../lib/api';

export default function FitPanel({ job, resume }:{ job:any, resume:string }){
  const [fit, setFit] = useState<any>(null);
  const [keywords, setKeywords] = useState<string>('');

  async function analyze() {
    const r = await client.post('/analyze', {
      job_title: job.title,
      company: job.company,
      jd_markdown: job.description_md ?? '',
      resume_markdown: resume,
      role_keywords: keywords ? keywords.split(',').map(s=>s.trim()) : []
    });
    setFit(r.data);
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-2 items-center">
        <input className="border p-2 flex-1" placeholder="Emphasize keywords (comma-separated)" value={keywords} onChange={e=>setKeywords(e.target.value)} />
        <button onClick={analyze} className="border p-2">Analyze fit</button>
      </div>
      {fit && (
        <div className="space-y-2">
          <div className="text-lg font-semibold">Fit score: {fit.fit_score}</div>
          <div>
            <div className="font-medium">Strengths</div>
            <ul className="list-disc ml-6">{fit.strengths.map((s:string,i:number)=>(<li key={i}>{s}</li>))}</ul>
          </div>
          <div>
            <div className="font-medium">Gaps</div>
            <ul className="list-disc ml-6">{fit.gaps.map((s:string,i:number)=>(<li key={i}>{s}</li>))}</ul>
          </div>
        </div>
      )}
    </div>
  );
}