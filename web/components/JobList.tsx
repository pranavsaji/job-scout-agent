'use client';
import { useEffect, useState } from 'react';
import { client } from '../lib/api';

export default function JobList({ filter, onSelect }:{ filter:any, onSelect:(job:any)=>void }){
  const [jobs, setJobs] = useState<any[]>([]);
  useEffect(()=>{
    client.post('/jobs/search', filter).then(r=>setJobs(r.data));
  }, [JSON.stringify(filter)]);
  return (
    <div className="border-r h-full overflow-auto">
      {jobs.map(j=> (
        <div key={j.id} className="p-3 hover:bg-gray-50 cursor-pointer" onClick={()=>onSelect(j)}>
          <div className="font-medium">{j.title}</div>
          <div className="text-sm text-gray-600">{j.company} • {j.location || '—'} • {j.remote || ''}</div>
        </div>
      ))}
    </div>
  );
}