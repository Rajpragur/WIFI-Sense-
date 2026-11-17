import {useEffect,useRef,useState} from 'react';
import {download} from './api';
import {Icon} from './icons';

type Hop={hop:number;address:string|null;hostname:string|null;rtt_ms:number|null;status:'response'|'no_response';reached:boolean;note:string|null};
type Event={type:'start'|'hop'|'hostname'|'complete'|'error';target?:string;address?:string;max_hops?:number;hop?:number;hostname?:string;rtt_ms?:number|null;status?:'response'|'no_response';reached?:boolean;note?:string|null;message?:string;hops?:number};
type Phase='idle'|'tracing'|'complete'|'stopped'|'error';
const EXAMPLE_DOMAINS=[{name:'Google',host:'google.com'},{name:'YouTube',host:'youtube.com'},{name:'GitHub',host:'github.com'},{name:'Wikipedia',host:'wikipedia.org'}];
function destinationHost(value:string):string {
 const input=value.trim();
 if(!input || /\s/.test(input))throw Error('Enter a domain, website URL, or IPv4 address.');
 try {
  const parsed=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input)?input:`https://${input}`);
  if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password||parsed.hostname.startsWith('['))throw Error('Invalid');
  return parsed.hostname.replace(/\.$/,'');
 } catch {throw Error('Enter a valid domain, HTTP(S) website URL, or IPv4 address.');}
}

export default function RouteExplorer(){
 const [target,setTarget]=useState('google.com'),[maxHops,setMaxHops]=useState(16),[phase,setPhase]=useState<Phase>('idle'),[error,setError]=useState(''),[hops,setHops]=useState<Hop[]>([]),[address,setAddress]=useState(''),[traceTarget,setTraceTarget]=useState(''),[traceMaxHops,setTraceMaxHops]=useState(16),[reached,setReached]=useState(false),[selected,setSelected]=useState<number|null>(null);
 const controller=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>()=>{mounted.current=false;controller.current?.abort()},[]);
 const running=phase==='tracing';const activeHop=hops.find(h=>h.hop===selected)??hops.at(-1);const observed=hops.filter(h=>h.status==='response').length;
 async function start(){
  let destination:string;try{destination=destinationHost(target)}catch(e){setError(e instanceof Error?e.message:'Enter a valid destination.');return}
  const abort=new AbortController();controller.current=abort;setHops([]);setAddress('');setTraceTarget(destination);setTraceMaxHops(maxHops);setReached(false);setSelected(null);setError('');setPhase('tracing');let sawComplete=false;
  try{
   const response=await fetch('/api/route-trace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:destination,max_hops:maxHops}),signal:abort.signal});
   if(!response.ok){let message=`Trace failed (${response.status}).`;try{const data=await response.json();message=typeof data.detail==='string'?data.detail:Array.isArray(data.detail)?data.detail.map((x:{msg:string})=>x.msg).join('. '):message}catch{}throw Error(message)}
   if(!response.body)throw Error('Your browser cannot read the route stream.');
   const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';
   const handle=(event:Event)=>{
    if(!mounted.current||abort.signal.aborted)return;
    if(event.type==='start')setAddress(event.address??'');
    if(event.type==='hop'&&event.hop!=null){const item:Hop={hop:event.hop,address:event.address??null,hostname:null,rtt_ms:event.rtt_ms??null,status:event.status??'no_response',reached:!!event.reached,note:event.note??null};setHops(prev=>[...prev,item]);setSelected(item.hop)}
    if(event.type==='hostname'&&event.hop!=null)setHops(prev=>prev.map(h=>h.hop===event.hop&&h.address===event.address?{...h,hostname:event.hostname??null}:h));
    if(event.type==='complete'){sawComplete=true;setReached(!!event.reached);setPhase('complete')}
    if(event.type==='error'){sawComplete=true;setError(event.message??'The route trace failed.');setPhase('error')}
   };
   while(true){const {done,value}=await reader.read();pending+=decoder.decode(value,{stream:!done});let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);if(line.trim())handle(JSON.parse(line))}if(done)break}
   if(!sawComplete&&mounted.current&&!abort.signal.aborted)throw Error('The trace ended unexpectedly. Try again.');
  }catch(e){if(!mounted.current)return;if(abort.signal.aborted){setPhase('stopped')}else{setError(e instanceof Error?e.message:'The route trace failed.');setPhase('error')}}
  finally{if(controller.current===abort)controller.current=null}
 }
 function stop(){controller.current?.abort();setPhase('stopped')}
 return <>
 <div className="page-heading route-heading"><div><p className="breadcrumb">Workspace <span>/</span> Route explorer</p><h1>See the path unfold.</h1><p className="page-intro">Trace the responding network hops between this Mac and a destination.</p></div><div className="route-protocol"><Icon name="route" size={17}/><span>IPv4 traceroute<small>ICMP probes</small></span></div></div>
 <form className="route-controls surface" onSubmit={e=>{e.preventDefault();start()}}><div className="route-control-intro"><span className="route-icon-box"><Icon name="globe" size={19}/></span><div><h2>Trace a destination</h2><p>Enter a domain, website URL or IPv4 address.</p></div></div><label>Destination domain<input aria-label="Route destination" value={target} onChange={e=>setTarget(e.target.value)} placeholder="e.g. google.com" required disabled={running}/></label><label className="route-hop-select">Max hops<select aria-label="Maximum hops" value={maxHops} onChange={e=>setMaxHops(Number(e.target.value))} disabled={running}>{[8,12,16,20,30].map(n=><option key={n} value={n}>{n}</option>)}</select></label>{running?<button className="button secondary route-start" type="button" onClick={stop}><Icon name="close" size={15}/>Stop trace</button>:<button className="button primary route-start" disabled={!target.trim()}><Icon name="play" size={15}/>Trace route</button>}</form>
 <div className="domain-examples"><span>Try a destination</span>{EXAMPLE_DOMAINS.map(site=><button type="button" key={site.host} className={target.trim().toLowerCase()===site.host?'chosen':''} disabled={running} onClick={()=>{setTarget(site.host);setError('')}} aria-label={`Use ${site.host}`}>{site.name}<small>{site.host}</small></button>)}<span className="domain-hint">Or enter any domain above</span></div>
 {error&&<div className="inline-error" role="alert"><Icon name="info" size={17}/><p>{error}</p></div>}
 <div className="route-grid"><section className="surface route-map"><div className="route-section-heading"><div><h2>Network path</h2><p>One response per hop, revealed as it arrives.</p></div><span className={`route-state ${running?'in-progress':''}`}><i/>{running?'Tracing':phase==='complete'?(reached?'Destination reached':'Trace finished'):phase==='stopped'?'Stopped':phase==='error'?'Could not trace':'Ready'}</span></div>
 <div className="route-path">{traceTarget&&<div className="route-destination-summary"><span>Tracing to</span><strong>{traceTarget}</strong>{address&&address!==traceTarget&&<small>{address}</small>}</div>}<div className="route-start-node"><span className="route-device"><Icon name="computer" size={22}/></span><div><strong>This Mac</strong><small>Trace origin</small></div></div>
 {hops.length?<div className="route-hop-list">{hops.map((hop,i)=><button key={hop.hop} className={`route-hop ${hop.status==='no_response'?'unanswered':''} ${activeHop?.hop===hop.hop?'selected':''}`} onClick={()=>setSelected(hop.hop)} aria-pressed={activeHop?.hop===hop.hop}>
  <span className="route-hop-number">{String(hop.hop).padStart(2,'0')}</span><span className="route-hop-main"><strong>{hop.status==='no_response'?'No response':hop.reached?traceTarget:hop.hostname||hop.address}</strong><small>{hop.status==='no_response'?'The probe timed out':hop.reached?`${hop.address} · Destination responded`:hop.hostname?hop.address:hop.note?`Router returned ${hop.note}`:'Responding address'}</small></span><span className="route-hop-rtt">{hop.rtt_ms==null?'—':<>{hop.rtt_ms.toFixed(1)} <small>ms</small></>}</span>{hop.reached&&<span className="route-reached">Reached</span>}<Icon name="chevron" size={15}/>
 </button>)}</div>:<div className="route-empty">{running?<><span className="spinner"/><p>Waiting for the first hop…</p></>:<><Icon name="route" size={24}/><p>Your route will appear here.</p><small>Enter a destination to reveal the network path.</small></>}</div>}
 {running&&hops.length>0&&<div className="route-waiting"><span className="spinner"/>Waiting for the next response…</div>}
 {traceTarget&&<div className="route-destination-node"><span className="route-destination-icon"><Icon name="globe" size={20}/></span><div><span>Destination</span><strong>{traceTarget}</strong><small>{address?(address===traceTarget?'IPv4 address':`Resolved to ${address}`):running?'Resolving domain…':'Address unavailable'}</small></div><span className={`destination-state ${reached?'reached':''}`}>{reached?'Reached':running?'Tracing':'Not confirmed'}</span></div>}
 {phase==='complete'&&!reached&&<div className="route-not-reached"><Icon name="info" size={16}/><span>The destination did not respond within {traceMaxHops} hops. Routers may filter probes or the path may extend beyond the limit.</span></div>}
 </div><div className="route-map-footer"><span><i/> A response from a probe</span><span>Times are round-trip, not per-hop travel time.</span></div></section>
 <aside className="surface route-detail"><div className="route-section-heading"><div><h2>Hop details</h2><p>{activeHop?`Selected hop ${activeHop.hop}`:'Select a hop to inspect it.'}</p></div><Icon name="layers" size={18}/></div>{activeHop?<><div className={`route-detail-badge ${activeHop.status==='no_response'?'missing':''}`}><i/>{activeHop.status==='no_response'?'No response':activeHop.reached?'Destination reached':'Router responded'}</div><dl><div><dt>Hop number</dt><dd>{activeHop.hop}</dd></div><div><dt>IPv4 address</dt><dd>{activeHop.address??'Unavailable'}</dd></div><div><dt>Reverse DNS name</dt><dd>{activeHop.hostname??(activeHop.address?'Unavailable':'—')}</dd></div><div><dt>Round-trip time</dt><dd>{activeHop.rtt_ms==null?'—':`${activeHop.rtt_ms} ms`}</dd></div><div><dt>Target domain</dt><dd>{traceTarget||'—'}</dd></div><div><dt>Destination</dt><dd>{activeHop.reached?'Responded':'Not confirmed'}</dd></div></dl><p className="route-detail-note">{activeHop.status==='no_response'?'A missing response does not mean the next router is unreachable. Some networks do not answer traceroute probes.':'Reverse DNS is an optional label for the responding address. It is not a record of websites visited.'}</p></>:<div className="route-detail-empty"><Icon name="location" size={26}/><p>Details appear as responses arrive.</p></div>}</aside></div>
 {hops.length>0&&<HopTiming hops={hops} selected={activeHop?.hop??null} onSelect={setSelected}/>}
 <section className="surface route-education"><div><Icon name="layers" size={20}/><h3>Different probes, different limits</h3><p>Traceroute sends multiple probes with increasing IP time-to-live values. Each hop shown is an observed response, not a single packet’s complete journey.</p></div><div><Icon name="info" size={20}/><h3>Why are some hops missing?</h3><p>Routers can filter, ignore or rate-limit probes. Routes can change, and a reverse-DNS name may be unavailable or describe a provider.</p></div><div><Icon name="activity" size={20}/><h3>What does the time mean?</h3><p>Each time is the round-trip delay to that responding hop. It includes the path back and should not be added across hops.</p></div></section>
 <div className="route-bottom"><span>One ICMP probe per hop; IPv4 only. Private addresses are not sent for public reverse-DNS lookup.</span>{hops.length>0&&<button className="button quiet small" onClick={()=>download({target:traceTarget,address,max_hops:traceMaxHops,reached,phase,hops,notes:'IPv4 ICMP traceroute; one probe per hop. PTR names are reverse DNS labels, not browsing history. Missing responses do not prove a break.'},'wifisense-route-trace.json')}><Icon name="download" size={15}/>Export trace</button>}</div>
 <div className="sr-only" aria-live="polite">{running?`Tracing. ${hops.length} hops checked, ${observed} responses.`:phase==='complete'?`Trace complete. ${observed} responses.`:''}</div>
 </>;
}

function HopTiming({hops,selected,onSelect}:{hops:Hop[];selected:number|null;onSelect:(hop:number)=>void}){
 const values=hops.map(h=>h.rtt_ms).filter((n):n is number=>n!=null);
 const highest=values.length?Math.max(...values):0;
 return <section className="surface hop-timing" aria-label="Measured round-trip delay to responding hops"><div className="packet-panel-head"><div><h2>Response time by hop</h2><p>Measured round-trip time to each responding address, not hop-to-hop delay.</p></div><span className="latency-range">{values.length?`Highest ${highest.toFixed(1)} ms`:'No responses yet'}</span></div>
 <div className="hop-timing-scroll"><div className="hop-timing-bars">{hops.map(h=><button key={h.hop} className={`hop-timing-item ${selected===h.hop?'selected':''}`} onClick={()=>onSelect(h.hop)} aria-pressed={selected===h.hop} aria-label={`Hop ${h.hop}: ${h.rtt_ms==null?'no response':`${h.rtt_ms} milliseconds`}`}><span>{h.rtt_ms==null?'—':`${h.rtt_ms.toFixed(1)}`}</span><span className="hop-timing-column">{h.rtt_ms==null?<i className="hop-missing"/>:<i className="hop-bar" style={{height:`${Math.max(4,highest===0?4:h.rtt_ms/highest*100)}%`}}/>}</span><small>{h.hop}</small></button>)}</div></div><div className="latency-caption"><span>Hop number</span><span>— indicates no response</span></div></section>
}
