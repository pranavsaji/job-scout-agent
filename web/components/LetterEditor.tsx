'use client';
import { useState } from 'react';
import { client } from '../lib/api';
import ReactMarkdown from 'react-markdown';

export default function LetterEditor({ job, resume }:{ job:any, resume:string }){
  const [tone, setTone] = useState('professional');
  const [variant, setVariant] = useState('standard');
  const [md, setMd] = useState('');

  async function generate(){
    const r = await client.post('/cover-letter', {
      job_title: job.title,
      company: job.company,
      jd_markdown: job.description_md ?? '',
      resume_markdown: resume,
      tone, variant
    });
    setMd(r.data.letter_markdown);
  }

  return (
    <div className="p-3 grid grid-cols-2 gap-3 h-full">
      <div className="space-y-2">
        <div className="flex gap-2">
          <select className="border p-2" value={tone} onChange={e=>setTone(e.target.value)}>
            <option>professional</option><option>warm</option><option>concise</option><option>energetic</option>
          </select>
          <select className="border p-2" value={variant} onChange={e=>setVariant(e.target.value)}>
            <option>short</option><option>standard</option><option>long</option>
          </select>
          <button className="border p-2" onClick={generate}>Generate</button>
        </div>
        <textarea className="border p-2 w-full h-[60vh]" value={md} onChange={e=>setMd(e.target.value)} />
      </div>
      <div className="prose max-w-none border p-3 overflow-auto">
        <ReactMarkdown>{md}</ReactMarkdown>
      </div>
    </div>
  );
}