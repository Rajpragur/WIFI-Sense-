import {useEffect, useState} from 'react';
import {api, signalLabel} from './api';
import {Icon} from './icons';
import type {Reading, SurveySummary} from './types';

type Destination = 'live'|'walk'|'survey'|'networks'|'compare'|'packet'|'trace';
type WalkSummary = {id:string;name:string;mode:'location'|'floorplan';created_at:string};
type LiveResponse = {current:Reading;history:Reading[]};
const tools: {id:Destination;icon:string;title:string;description:string;index:string}[] = [
 {id:'walk',icon:'route',title:'Walking heatmap',description:'Build a map as you move',index:'01'},
 {id:'survey',icon:'map',title:'Coverage survey',description:'Measure your floor plan',index:'02'},
 {id:'networks',icon:'wifi',title:'Nearby networks',description:'Explore the air around you',index:'03'},
 {id:'trace',icon:'globe',title:'Route explorer',description:'Trace the path to a domain',index:'04'},
 {id:'packet',icon:'packet',title:'Packet lab',description:'Inspect an ICMP exchange',index:'05'},
 {id:'compare',icon:'compare',title:'Compare surveys',description:'Review changes over time',index:'06'},
];
function formattedDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});}
export default function Home({onNavigate}:{onNavigate:(tab:Destination)=>void}){
 const [live,setLive]=useState<LiveResponse|null>(null),[liveError,setLiveError]=useState('');
 const [surveys,setSurveys]=useState<SurveySummary[]|null>(null),[walks,setWalks]=useState<WalkSummary[]|null>(null);
 useEffect(()=>{
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
  async function read(){controller=new AbortController();try{const value=await api<LiveResponse>('/live',{signal:controller.signal});if(!cancelled){setLive(value);setLiveError('')}}catch(error){if(!cancelled){setLive(null);setLiveError(error instanceof Error?error.message:'Unable to read Wi-Fi.')}}finally{if(!cancelled)timer=setTimeout(read,5000)}}
  read();api<SurveySummary[]>('/surveys').then(value=>{if(!cancelled)setSurveys(value)}).catch(()=>{});api<WalkSummary[]>('/walks').then(value=>{if(!cancelled)setWalks(value)}).catch(()=>{});
  return()=>{cancelled=true;clearTimeout(timer);controller?.abort()};
 },[]);
 const current=live?.current;
 const latest=[...(surveys??[]).map(s=>({...s,kind:'Coverage survey'})),...(walks??[]).map(w=>({...w,kind:'Walking survey'}))].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
 return <div className="observatory">
  <div className="obs-strip"><span>Wi-FiSense <span className="obs-slash">/</span> Network observatory</span><span><i className={current?'obs-live':''}/>{current?'Collector connected':liveError?'Collector unavailable':'Connecting'}</span></div>
  <section className="obs-hero" aria-labelledby="home-title">
   <div className="obs-intro"><div className="obs-eyebrow"><span>Wireless, understood</span><span>Local / real time</span></div><h1 id="home-title">See your<br/>network<span className="obs-period">.</span></h1><p>Measure your signal, map your space, and follow the path your packets take.</p><div className="obs-actions"><button className="obs-action-primary" onClick={()=>onNavigate('live')}>Open live monitor <Icon name="arrow" size={18}/></button><button onClick={()=>onNavigate('walk')}>Start mapping <Icon name="arrow" size={18}/></button></div><div className="obs-intro-footer"><span>Built for observation</span><span>↓ Explore the workspace</span></div></div>
   <div className="obs-instrument" aria-label={current?`Current signal ${current.rssi} dBm, ${signalLabel(current.rssi)}.`:liveError?'Live Wi-Fi signal unavailable.':'Waiting for live Wi-Fi signal.'}><div className="obs-instrument-header"><span>Signal at this device</span><span>{current?'Live reading':'Waiting for signal'}</span></div><div className="obs-reticle"><div className="obs-ring ring-outer"/><div className="obs-ring ring-middle"/><div className="obs-ring ring-inner"/><div className="obs-crosshair obs-horizontal"/><div className="obs-crosshair obs-vertical"/><div className="obs-meter"><span>{current?current.rssi:'—'}</span><small>dBm</small><p>{current?`${signalLabel(current.rssi)} signal`:liveError?'Unavailable':'Connecting'}</p></div></div><div className="obs-instrument-footer"><span>Received signal strength</span><span>{current?new Date(current.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'No measurement'}</span></div></div>
  </section>
  {liveError&&<div className="obs-error" role="status"><Icon name="info" size={17}/><span>{liveError} Open Live monitor to troubleshoot.</span></div>}
  <section className="obs-data" aria-label="Your network at a glance"><div><span>Connected network</span><strong>{current?.ssid||(current?'Name unavailable':'Waiting for connection')}</strong></div><div><span>Frequency / channel</span><strong>{current?(current.band||current.channel!=null?[current.band,current.channel!=null?`Ch ${current.channel}`:null].filter(Boolean).join(' / '):'Unavailable'):'—'}</strong></div><div><span>Saved surveys</span><strong>{surveys&&walks?`${surveys.length+walks.length}`:'—'}</strong></div><button onClick={()=>onNavigate('live')} aria-label="View live connection details"><Icon name="arrow" size={20}/></button></section>
  <div className="obs-section-title"><div><span>Tools / workspace</span><h2>Explore your network</h2></div><p>Six ways to understand your connection.</p></div>
  <section className="obs-tools" aria-label="Network tools">{tools.map(tool=><button className="obs-tool" key={tool.id} onClick={()=>onNavigate(tool.id)}><span className="obs-tool-top"><span>{tool.index} / {tool.title}</span><Icon name="arrow" size={18}/></span><span className="obs-tool-icon"><Icon name={tool.icon} size={31}/></span><span className="obs-tool-bottom"><strong>{tool.title}</strong><small>{tool.description}</small></span></button>)}</section>
  <section className="obs-feature"><div className="obs-feature-photo"><span role="img" aria-label="Stock photograph of network cables"/><span role="img" aria-label="Stock photograph of a city at night"/></div><div className="obs-feature-copy"><span>Network paths / Route explorer</span><h2>Where does your<br/>connection go?</h2><p>Trace responding routers on the way to a domain and explore each hop.</p><button onClick={()=>onNavigate('trace')}>Explore a route <Icon name="arrow" size={18}/></button></div></section>
  <section className="obs-recent"><div><span>Your latest survey</span><h2>{latest?latest.name:'Your first map starts here.'}</h2><p>{latest?`${latest.kind} / ${formattedDate(latest.created_at)}`:surveys&&walks?'Collect readings to start building your map.':'Survey information is currently unavailable.'}</p></div><button onClick={()=>onNavigate(latest?.kind==='Walking survey'?'walk':'survey')}>{latest?'View surveys':'Create a survey'} <Icon name="arrow" size={18}/></button></section>
 </div>;
}
