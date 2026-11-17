import {useEffect,useMemo,useRef,useState} from 'react';
import {api,download,json} from './api';
import {Icon} from './icons';

type Probe = {address:string;started_at:string;status:'reply'|'no_reply';rtt_ms:number|null;rtt_relation?:string;ttl:number|null;reply_bytes:number|null;icmp_sequence:number|null;responder?:string;note?:string};
type Result = Probe & {index:number};
type Phase = 'idle'|'resolving'|'sending'|'reply'|'timeout'|'complete'|'error';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const formatTime=(value:string)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
function summary(results:Result[]){const replies=results.filter(p=>p.status==='reply');const rtts=replies.map(p=>p.rtt_ms).filter((v):v is number=>v!=null);return {sent:results.length,received:replies.length,loss:results.length?100*(results.length-replies.length)/results.length:null,mean:rtts.length?rtts.reduce((a,b)=>a+b,0)/rtts.length:null,jitter:rtts.length>1?rtts.slice(1).reduce((s,v,i)=>s+Math.abs(v-rtts[i]),0)/(rtts.length-1):null}}

export default function PacketLab({onTrace}:{onTrace:()=>void}){
 const [target,setTarget]=useState('1.1.1.1'),[count,setCount]=useState(6),[running,setRunning]=useState(false),[phase,setPhase]=useState<Phase>('idle'),[phaseIndex,setPhaseIndex]=useState(0),[results,setResults]=useState<Result[]>([]),[resolved,setResolved]=useState(''),[runTarget,setRunTarget]=useState(''),[error,setError]=useState(''),[selected,setSelected]=useState<number|null>(null),[stopping,setStopping]=useState(false);
 const stop=useRef(false),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;stop.current=true},[]);
 const stats=useMemo(()=>summary(results),[results]);
 const selectedProbe=results.find(p=>p.index===selected)??results.at(-1);
 const percent=stats.loss==null?0:stats.loss;
 async function start(){
  stop.current=false;setRunning(true);setStopping(false);setResults([]);setResolved('');setRunTarget(target);setSelected(null);setError('');setPhase('resolving');
  try{
   const answer=await api<{target:string;address:string}>('/packet-lab/resolve',json({target}));if(!alive.current)return;
   setResolved(answer.address);
   for(let i=1;i<=count;i++){
    if(stop.current)break;
    setPhaseIndex(i);setPhase('sending');
    const probe=await api<Probe>('/packet-lab/probe',json({address:answer.address}));if(!alive.current)return;
    setResults(previous=>[...previous,{...probe,index:i}]);setSelected(i);setPhase(probe.status==='reply'?'reply':'timeout');
    if(!stop.current)await wait(850);
    if(!alive.current)return;
   }
   setPhase('complete');
  }catch(e){if(alive.current){setError(e instanceof Error?e.message:'The probe failed.');setPhase('error')}}
  finally{if(alive.current){setRunning(false);setStopping(false)}}
 }
 return <>
  <div className="page-heading packet-heading"><div><p className="breadcrumb">Workspace <span>/</span> Packet lab</p><h1>Follow a packet.</h1><p className="page-intro">Watch ICMP requests and replies, then inspect the measurements behind each exchange.</p></div><button className="button secondary" onClick={onTrace}><Icon name="route" size={17}/>Explore network route</button></div>
  <form className="packet-controls surface" onSubmit={e=>{e.preventDefault();start()}}><div className="packet-control-copy"><span className="packet-control-icon"><Icon name="packet" size={20}/></span><div><h2>ICMP echo test</h2><p>Send a short series of probes to an IPv4 destination.</p></div></div><label className="packet-target">Target address<input aria-label="Target address" value={target} onChange={e=>setTarget(e.target.value)} disabled={running} required placeholder="IP address or hostname"/></label><label className="packet-count">Probes<select aria-label="Number of probes" value={count} disabled={running} onChange={e=>setCount(Number(e.target.value))}>{[4,6,8,10].map(n=><option key={n} value={n}>{n}</option>)}</select></label>{running?<button type="button" className="button secondary packet-run-button" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true)}}>{stopping?'Finishing probe…':'Stop after this probe'}</button>:<button className="button primary packet-run-button" disabled={!target.trim()}><Icon name="play" size={15}/>Send probes</button>}</form>
  {error&&<div className="inline-error packet-error" role="alert"><Icon name="info" size={17}/><p>{error}</p></div>}
  <div className="packet-grid"><section className="surface packet-journey"><div className="packet-panel-head"><div><h2>Packet journey</h2><p>A conceptual view of a real echo exchange.</p></div><span className="packet-phase">{phase==='idle'?'Ready':phase==='resolving'?'Resolving address':phase==='sending'?`Probe ${phaseIndex} in progress`:phase==='reply'?'Echo reply received':phase==='timeout'?'No reply received':phase==='error'?'Test stopped':'Test complete'}</span></div>
   <div className="journey-stage" aria-label="Conceptual diagram of an ICMP request from your Mac to the target and its echo reply"><div className="journey-node"><span className="journey-icon"><Icon name="computer" size={26}/></span><strong>Your Mac</strong><small>ICMP source</small></div><div className="journey-path"><div className="path-line outgoing"><span>Echo request <small>type 8</small></span><i/></div><div className="path-line incoming"><i/><span>Echo reply <small>type 0</small></span></div><div className={`packet-dot ${phase==='sending'?'travelling-out':phase==='reply'?'travelling-in':''}`} aria-hidden="true"><Icon name="packet" size={15}/></div></div><div className="journey-node destination"><span className="journey-icon"><Icon name="globe" size={27}/></span><strong>Destination</strong><small>{resolved||'Your target'}</small></div></div>
   <div className="journey-bottom"><span><i className="pulse-blue"/> {phase==='sending'?`Waiting for probe ${phaseIndex}…`:phase==='timeout'?'No reply before the deadline':phase==='reply'?`Reply for probe ${phaseIndex}`:phase==='resolving'?'Looking up IPv4 address':phase==='complete'?`${stats.received} of ${stats.sent} probes received`:phase==='error'?'See the error above':'Choose a target and send probes'}</span><span>Illustrative animation • timing not to scale</span></div>
   <div className="packet-stats"><div><span>Sent</span><p>{stats.sent}<small>probes</small></p></div><div><span>Received</span><p>{stats.received}<small>replies</small></p></div><div><span>No reply</span><p>{stats.loss==null?'—':percent.toFixed(0)}<small>%</small></p></div><div><span>Average RTT</span><p>{stats.mean==null?'—':stats.mean.toFixed(1)}<small>ms</small></p></div></div>
  </section><aside className="surface packet-inspector"><div className="packet-panel-head"><div><h2>Inspect a reply</h2><p>{selectedProbe?`Probe ${selectedProbe.index} of ${stats.sent} recorded`:'Select a recorded probe below.'}</p></div><Icon name="layers" size={19}/></div>{selectedProbe?<><div className={`packet-result-badge ${selectedProbe.status}`}><i/>{selectedProbe.status==='reply'?'Echo reply':'No reply'}</div><dl className="packet-fields"><div><dt>Protocol</dt><dd>ICMP over IPv4</dd></div><div><dt>Destination</dt><dd>{selectedProbe.address}</dd></div><div><dt>Result</dt><dd>{selectedProbe.status==='reply'?'Reply received':'No reply in time'}</dd></div><div><dt>Round-trip time</dt><dd>{selectedProbe.rtt_ms==null?'—':`${selectedProbe.rtt_relation==='<'?'<':''}${selectedProbe.rtt_ms} ms`}</dd></div><div><dt>Reply TTL</dt><dd>{selectedProbe.ttl??'—'}</dd></div><div><dt>Reply size</dt><dd>{selectedProbe.reply_bytes==null?'—':`${selectedProbe.reply_bytes} bytes`}</dd></div><div><dt>ICMP sequence</dt><dd>{selectedProbe.icmp_sequence??'—'}</dd></div></dl><p className="packet-inspector-note">{selectedProbe.status==='reply'?'TTL and reply size come from the system ping output. Each probe is a separate ping process, so its ICMP sequence may repeat.':'An unanswered probe may reflect packet loss, filtering, rate limits or an unreachable destination.'}</p></>:<div className="packet-inspector-empty"><Icon name="packet" size={28}/><p>Packet details appear here after the first probe.</p></div>}</aside></div>
  {results.length>0&&<LatencyChart results={results} selected={selectedProbe?.index??null} onSelect={setSelected}/>}
  <section className="surface packet-log"><div className="packet-panel-head"><div><h2>Probe timeline <span className="heading-count">{stats.sent}</span></h2><p>Each row represents one actual system ping.</p></div>{results.length>0&&<button className="button quiet small" onClick={()=>download({target:runTarget,address:resolved,results,summary:stats,notes:'ICMP echo via system ping. No reply does not establish a cause. Animation is illustrative.'},'wifisense-packet-test.json')}><Icon name="download" size={15}/>Export results</button>}</div>{results.length?<div className="packet-timeline"><div className="timeline-heading"><span>Probe</span><span>Time sent</span><span>Result</span><span>RTT</span><span>Reply TTL</span></div>{results.map(p=><button key={p.index} className={`timeline-row ${selectedProbe?.index===p.index?'selected':''}`} onClick={()=>setSelected(p.index)}><span className="timeline-number">{String(p.index).padStart(2,'0')}</span><span>{formatTime(p.started_at)}</span><span><i className={`timeline-dot ${p.status}`}/>{p.status==='reply'?'Reply received':'No reply'}</span><span>{p.rtt_ms==null?'—':`${p.rtt_relation==='<'?'<':''}${p.rtt_ms} ms`}</span><span>{p.ttl??'—'}</span></button>)}</div>:<div className="packet-empty"><span className="empty-packet-icon"><Icon name="packet" size={23}/></span><div><p>Your packet timeline will appear here.</p><small>Start a test to see individual request and reply results.</small></div></div>}</section>
  <section className="surface network-notes"><div><span className="network-note-number">01</span><h3>Network layer</h3><p>IPv4 routes each echo request toward the destination. The diagram does not identify intermediate routers.</p></div><div><span className="network-note-number">02</span><h3>ICMP echo</h3><p>Type 8 is an echo request; type 0 is the corresponding reply. A host may filter or rate-limit ICMP.</p></div><div><span className="network-note-number">03</span><h3>Round-trip time</h3><p>RTT includes the journey there and back. RTT variation is {stats.jitter==null?'available after two replies':`${stats.jitter.toFixed(2)} ms for this run`}.</p></div></section>
  <p className="packet-footnote">This tool observes the system ping output, not a packet capture. A missing reply does not prove where or why a packet was lost.</p>
 </>;
}

function LatencyChart({results,selected,onSelect}:{results:Result[];selected:number|null;onSelect:(n:number)=>void}){
 const values=results.map(p=>p.rtt_ms).filter((v):v is number=>v!=null);
 const max=values.length?Math.max(...values):0;
 return <section className="surface latency-chart" aria-label="Observed round-trip time by probe">
  <div className="packet-panel-head"><div><h2>Round-trip time by probe</h2><p>Each bar uses the RTT reported by your system ping.</p></div><span className="latency-range">{values.length?`Highest ${max.toFixed(2)} ms`:'No replies yet'}</span></div>
  <div className="latency-plot" role="group" aria-label="Select a probe to inspect its details">{results.map(probe=>{
   const height=probe.rtt_ms==null?0:Math.max(5,max===0?5:probe.rtt_ms/max*100);
   return <button key={probe.index} className={`latency-bar-item ${selected===probe.index?'selected':''}`} onClick={()=>onSelect(probe.index)} aria-pressed={selected===probe.index} aria-label={`Probe ${probe.index}: ${probe.rtt_ms==null?'no reply':`${probe.rtt_relation==='<'?'less than ':''}${probe.rtt_ms} milliseconds`}`}>
    <span className="latency-value">{probe.rtt_ms==null?'—':`${probe.rtt_relation==='<'?'<':''}${probe.rtt_ms.toFixed(probe.rtt_ms<1?2:1)}`}</span><span className="latency-column">{probe.rtt_ms==null?<span className="latency-missing"/>:<span className="latency-bar" style={{height:`${height}%`}}/>}</span><span className="latency-index">{probe.index}</span>
   </button>})}</div>
  <div className="latency-caption"><span>Probe number</span><span>— indicates no reply</span></div>
 </section>
}
