import {useState} from 'react';
import type {Network} from './types';
import {signalColor} from './api';

/** A channel scatter plot: every point is an actual AP returned by a scan. */
export default function SpectrumGraph({networks}:{networks:Network[]}){
 const [chosen,setChosen]=useState('2.4 GHz');
 const valid=networks.filter(n=>typeof n.channel==='number'&&typeof n.rssi==='number'&&!!n.band);
 const bands=['2.4 GHz','5 GHz','6 GHz'].filter(band=>valid.some(n=>n.band===band));
 if(!bands.length)return <section className="surface spectrum-panel"><div className="packet-panel-head"><div><h2>Signal by channel</h2><p>No scanned networks have both channel and signal information.</p></div></div></section>;
 const band=bands.includes(chosen)?chosen:bands[0];
 const items=valid.filter(n=>n.band===band);
 const channels=[...new Set(items.map(n=>n.channel!))].sort((a,b)=>a-b);
 const width=Math.max(680,channels.length*80+90),height=250,left=48,right=24,top=18,bottom=40;
 const plotWidth=width-left-right,plotHeight=height-top-bottom;
 const y=(rssi:number)=>top+(Math.max(0,Math.min(120,-rssi))/120)*plotHeight;
 const x=(channel:number)=>left+(channels.indexOf(channel)+.5)*(plotWidth/channels.length);
 const occurrences=new Map<number,number>();
 return <section className="surface spectrum-panel" aria-label="Signal readings by Wi-Fi channel">
  <div className="packet-panel-head"><div><h2>Signal by channel</h2><p>Each point is an access point from your latest scan.</p></div><div className="spectrum-bands" aria-label="Frequency band">{bands.map(b=><button key={b} className={band===b?'active':''} aria-pressed={band===b} onClick={()=>setChosen(b)}>{b}</button>)}</div></div>
  <div className="spectrum-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${items.length} measured access points on ${band}. Higher points mean stronger signals.`} style={{minWidth:`${width}px`}}>
   {[-20,-40,-60,-80,-100,-120].map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="spectrum-grid"/><text x={left-8} y={y(value)+4} textAnchor="end" className="spectrum-axis">{value}</text></g>)}
   {channels.map(channel=><text key={channel} x={x(channel)} y={height-12} textAnchor="middle" className="spectrum-axis">{channel}</text>)}
   {items.map((n,index)=>{const channel=n.channel!,rssi=n.rssi!;const count=occurrences.get(channel)??0;occurrences.set(channel,count+1);const offset=count===0?0:((count%2?1:-1)*Math.ceil(count/2)*4);const bounded=Math.max(-14,Math.min(14,offset));return <circle key={`${n.bssid??n.ssid??'ap'}-${index}`} className="spectrum-point" cx={x(channel)+bounded} cy={y(rssi)} r="5.5" fill={signalColor(rssi)} stroke="white" strokeWidth="2" style={{animationDelay:`${Math.min(index*25,500)}ms`}}><title>{`${n.ssid||'Name unavailable'} · channel ${channel} · ${rssi} dBm`}</title></circle>})}
  </svg></div>
  <div className="spectrum-footer"><span>Received signal · dBm</span><span>Detected channels · points are offset slightly to avoid overlap</span><span>{items.length} measured access points</span></div>
 </section>;
}
