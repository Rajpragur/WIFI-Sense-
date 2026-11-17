import {useEffect, useState} from 'react';
import {api, json, signalColor, signalLabel} from './api';
import {Icon} from './icons';
import type {Reading, Probe, Speed} from './types';

type LiveResponse = {current: Reading; history: Reading[]};
function clock(timestamp: string) {return new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}
function timeLabel(timestamp: number) {return new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}
export function SignalTrace({samples}: {samples: Reading[]}) {
 const width = 900, height = 260, left = 38, right = 25, top = 20, bottom = 35;
 const last = samples.at(-1);
 const end = last ? new Date(last.timestamp).getTime() : Date.now();
 const start = end - 180000;
 const visibleSamples = samples.filter(sample => {const t=new Date(sample.timestamp).getTime(); return t >= start && t <= end});
 const x = (timestamp: string) => left + (new Date(timestamp).getTime() - start) / (end - start) * (width - left - right);
 const y = (rssi: number) => top + ((-25 - Math.max(-95, Math.min(-25, rssi))) / 70) * (height - top - bottom);
 // Stop the trace across long pauses or a change of network identity.
 const segments: Reading[][] = [];
 for (const sample of visibleSamples) {
   const previous = segments.at(-1)?.at(-1);
   if (!previous || new Date(sample.timestamp).getTime() - new Date(previous.timestamp).getTime() > 15000 || (sample.bssid && previous.bssid && sample.bssid !== previous.bssid) || (sample.ssid && previous.ssid && sample.ssid !== previous.ssid)) segments.push([]);
   segments.at(-1)!.push(sample);
 }
 return <div className="trace-wrapper"><svg className="trace" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={samples.length ? `Live Wi-Fi signal history. Latest reading ${last!.rssi} dBm. ${visibleSamples.length} real samples.` : 'Signal history will appear after the first Wi-Fi readings.'}>
  <defs><linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2686c8" stopOpacity=".12"/><stop offset="100%" stopColor="#2686c8" stopOpacity="0"/></linearGradient></defs>
  {[-30, -45, -60, -75, -90].map(value => <g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className={value === -75 ? 'threshold-grid' : 'chart-grid'}/><text x="0" y={y(value)+4} className="axis-label">{value}</text></g>)}
  {[0, 1, 2, 3].map(i => <text key={i} x={left + i*(width-left-right)/3} y={height-7} textAnchor={i===0 ? 'start' : i===3 ? 'end' : 'middle'} className="axis-label">{timeLabel(start + i*(end-start)/3)}</text>)}
  {segments.map((segment, index) => {const path = segment.map((p,i) => `${i===0?'M':'L'} ${x(p.timestamp)} ${y(p.rssi)}`).join(' ');return <g key={index}><path d={`${path} L ${x(segment.at(-1)!.timestamp)} ${height-bottom} L ${x(segment[0].timestamp)} ${height-bottom} Z`} fill="url(#trace-fill)"/><path d={path} fill="none" stroke="#287dae" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/></g>})}
  {last && <><circle cx={x(last.timestamp)} cy={y(last.rssi)} r="8" fill="#e7f2fa"/><circle cx={x(last.timestamp)} cy={y(last.rssi)} r="3.8" fill="#287dae" stroke="white" strokeWidth="1.7"/></>}
 </svg>{visibleSamples.length<2 && <div className="chart-waiting">{visibleSamples.length ? 'Collecting your next reading…' : 'Waiting for your Wi-Fi signal…'}</div>}</div>;
}

export default function LiveMonitor({onNavigate}:{onNavigate:(tab:'walk'|'survey'|'packet')=>void}) {
 const [data, setData] = useState<LiveResponse | null>(null);
 const [error, setError] = useState('');
 const [paused, setPaused] = useState(false);
 const [refresh, setRefresh] = useState(0);
 const [now, setNow] = useState(Date.now());
 useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 1000);return () => clearInterval(timer)}, []);
 useEffect(() => {
  if (paused) return;
  let disposed = false; let timer: ReturnType<typeof setTimeout>; let controller: AbortController;
  async function collect() {
   controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 12000);
   try {const response = await api<LiveResponse>('/live', {signal: controller.signal});if(!disposed){setData(response);setError('')}}
   catch(e){if(!disposed)setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'The collector did not respond. Check that Wi-Fi is enabled, then retry.')}
   finally {clearTimeout(timeout);if(!disposed)timer=setTimeout(collect,3000)}
  }
  collect();return () => {disposed=true;clearTimeout(timer);controller?.abort()};
 }, [paused, refresh]);
 const current = data?.current;
 const age = current ? Math.max(0, Math.floor((now - new Date(current.timestamp).getTime())/1000)) : null;
 const fresh = !error && age !== null && age < 15;
 const status = paused ? 'Monitoring paused' : fresh ? 'Reading live from this Mac' : error ? 'Collector unavailable' : 'Connecting to your Wi-Fi';
 const [activePane, setActivePane] = useState<'ping'|'throughput'>('ping');
 return <>
  <div className="page-heading"><div><p className="breadcrumb">Workspace <span>/</span> Live monitor</p><h1>Your connection,<br className="mobile-break"/> in real time.</h1><p className="page-intro">See how your Wi-Fi changes as you move through your space.</p></div><div className="monitor-device"><Icon name="computer" size={19}/><div>This Mac<small>Native Wi-Fi collector</small></div></div></div>
  <div className="connection-status"><div><span className={`status-dot ${paused?'paused':fresh?'connected':'waiting'}`}/>{status}</div><div className="monitor-controls"><span className="poll-label">Every 3 seconds</span><button className="icon-button" title="Refresh Wi-Fi reading" aria-label="Refresh Wi-Fi reading" onClick={()=>{setPaused(false);setRefresh(v=>v+1)}}><Icon name="refresh" size={17}/></button><button className="button quiet small" onClick={()=>setPaused(v=>!v)}><Icon name={paused?'play':'pause'} size={14}/>{paused?'Resume':'Pause'}</button></div></div>
  {error&&<div className="inline-error" role="alert"><Icon name="info" size={18}/><div><p>{error}</p><small>Enable Wi-Fi on this Mac. The local backend and native collector must both be running.</small></div><button className="button quiet small" onClick={()=>{setPaused(false);setRefresh(v=>v+1)}}>Retry</button></div>}
  <div className="live-layout">
   <section className="signal-panel surface"><div className="signal-panel-top"><div><h2>Signal strength</h2><div className="reading-value">{current?current.rssi:'—'}<span>dBm</span></div><div className="quality-line">{current?<><SignalBars value={current.rssi}/><span style={{color:signalColor(current.rssi)}}>{signalLabel(current.rssi)} signal</span></>:<span>Waiting for a reading</span>}</div></div><div className="signal-explanation"><Icon name="wifi" size={33}/><p>{current ? current.rssi>=-60 ? 'Strong received signal at this position. Signal alone does not measure speed.' : current.rssi>=-75 ? 'Fair received signal. Compare readings in other locations to find stronger coverage.' : 'Your signal is weak. Move closer to the access point and check again.' : 'Connect to Wi-Fi to start measuring your signal.'}</p>{current&&<small>{paused||!fresh?'Last observed':'Measured'} {clock(current.timestamp)}</small>}</div></div>
    <div className="signal-scale" aria-label={current?`Signal ${current.rssi} dBm, ${signalLabel(current.rssi)}. Strong is at least minus 60 dBm, fair is minus 60 to minus 75 dBm and weak is below minus 75 dBm.`:'Signal quality scale; waiting for a reading.'}>
      <div className="scale-heading"><span>Signal quality</span><span>Closer to zero is stronger</span></div>
      <div className="scale-track"><span/><span/><span/>{current&&<i className="scale-marker" style={{left:`${Math.max(0,Math.min(100,(current.rssi+100)/70*100))}%`}}/>}</div>
      <div className="scale-labels"><span>Weak</span><span>Fair</span><span>Strong</span></div>
    </div>
    <div className="trace-title"><span>Signal over time</span><span>Last 3 minutes</span></div>
    <SignalTrace samples={data?.history??[]}/>
    <div className="chart-caption"><span><i className="trace-key"/>Received signal strength</span><span><i className="threshold-key"/>Weak below −75 dBm</span><span>Higher is stronger</span></div>
   </section>
   <aside className="connection-panel surface"><div className="panel-title"><h2>Connection details</h2><Icon name="signal" size={18}/></div><div className="network-name"><span className="network-disc"><Icon name="wifi" size={22}/></span><div><p>{current?.ssid||'Connected Wi-Fi'}</p><small>{current?.ssid?'Current network':current?'Network name hidden by macOS':'Awaiting collector'}</small></div></div>
    <dl className="connection-facts"><Fact name="Interface" value={current?.interface}/><Fact name="Frequency band" value={current?.band}/><Fact name="Channel" value={current?.channel}/><Fact name="Noise floor" value={current?.noise_dbm != null?`${current.noise_dbm} dBm`:undefined}/><Fact name="Signal-to-noise" value={current?.snr_db != null?`${current.snr_db} dB`:undefined}/><Fact name="Tx link rate" value={current?.transmit_mbps != null?`${current.transmit_mbps.toLocaleString()} Mbps`:undefined}/></dl>
    <p className="subtle-note">Tx link rate is the radio connection rate. Use a throughput test to measure transferred data.</p>
    {current&&!current.ssid&&<details className="permission-help"><summary>Why is the name hidden?</summary><p>macOS can restrict SSID and BSSID access through Location Services. Open Nearby networks and use “Open Wi-Fi collector” to allow access. Signal strength and channel can still work without names.</p></details>}
   </aside>
  </div>
  <section className="survey-guide" aria-label="Explore your network">
    <div className="guide-intro"><span className="guide-label">Explore your network</span><h2>From a signal to a story.</h2><p>Gather readings, map your space, and see the packets behind the numbers.</p></div>
    <div className="guide-actions">
      <button onClick={()=>onNavigate('survey')}><span className="guide-icon"><Icon name="map" size={20}/></span><span><strong>Map indoor coverage</strong><small>Place readings on a floor plan</small></span><Icon name="arrow" size={16}/></button>
      <button onClick={()=>onNavigate('walk')}><span className="guide-icon"><Icon name="route" size={20}/></span><span><strong>Start a walking survey</strong><small>Record locations as you move</small></span><Icon name="arrow" size={16}/></button>
      <button onClick={()=>onNavigate('packet')}><span className="guide-icon"><Icon name="packet" size={20}/></span><span><strong>Follow an ICMP probe</strong><small>Inspect real request and reply results</small></span><Icon name="arrow" size={16}/></button>
    </div>
  </section>
  <section className="diagnostics surface"><div className="diagnostics-heading"><div><h2>Test your connection</h2><p>Check network delay or measure throughput to a server.</p></div><div className="segmented" aria-label="Network test type"><button className={activePane==='ping'?'selected':''} onClick={()=>setActivePane('ping')}>Latency & loss</button><button className={activePane==='throughput'?'selected':''} onClick={()=>setActivePane('throughput')}>Throughput</button></div></div>{activePane==='ping'?<PingPanel/>:<ThroughputPanel/>}</section>
  <div className="local-footnote"><Icon name="computer" size={15}/><span>Real measurements from this Mac. Readings are stored locally.</span><span className="last-read">{current?`Last sample ${age}s ago`:'No samples collected yet'}</span></div>
 </>;
}
function Fact({name,value}:{name:string;value?:string|number}) {return <div><dt>{name}</dt><dd>{value??'Unavailable'}</dd></div>}
export function SignalBars({value}:{value:number}) {const level=value>=-50?4:value>=-65?3:value>=-75?2:1;return <span className="signal-bars" aria-hidden="true">{[1,2,3,4].map((v)=><i key={v} style={{height:3+v*3,background:v<=level?signalColor(value):'#dce5e9'}}/>)}</span>}
export function PingPanel() {
 const [target,setTarget]=useState('1.1.1.1'),[result,setResult]=useState<Probe|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(){setBusy(true);setError('');setResult(null);try{setResult(await api<Probe>('/ping',json({target,count:4})))}catch(e){setError(e instanceof Error?e.message:'The test failed.')}finally{setBusy(false)}}
 return <div className="test-body"><form className="test-form" onSubmit={e=>{e.preventDefault();run()}}><div className="input-wrap"><label htmlFor="ping-target">Ping target</label><input id="ping-target" required value={target} onChange={e=>{setTarget(e.target.value);setResult(null)}} placeholder="IP address or hostname" disabled={busy}/></div><button className="button primary" disabled={busy||!target}>{busy?<><span className="spinner"/>Testing…</>:<>Run ping test<Icon name="arrow" size={17}/></>}</button></form>{error&&<p className="field-error" role="alert">{error}</p>}{result?<div className="test-results"><Result label="Round-trip delay" value={result.latency_ms} unit="ms"/><Result label="RTT variation" value={result.jitter_ms} unit="ms"/><Result label="Packet loss" value={result.loss_percent} unit="%"/><div className="probe-count">{result.received} / {result.sent}<small>probes received</small></div></div>:<p className="test-hint">Sends four ICMP probes. Results include your Wi-Fi and the path to the target.</p>}</div>;
}
export function ThroughputPanel(){
 const [target,setTarget]=useState(''),[result,setResult]=useState<Speed|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(){setBusy(true);setError('');setResult(null);try{setResult(await api<Speed>('/throughput',json({target,duration:3})))}catch(e){setError(e instanceof Error?e.message:'The throughput test failed.')}finally{setBusy(false)}}
 return <div className="test-body"><form className="test-form" onSubmit={e=>{e.preventDefault();run()}}><div className="input-wrap"><label htmlFor="speed-target">iPerf3 server</label><input id="speed-target" value={target} required onChange={e=>{setTarget(e.target.value);setResult(null)}} placeholder="Server IP address or hostname" disabled={busy}/></div><button className="button primary" disabled={busy||!target}>{busy?<><span className="spinner"/>Testing…</>:<>Run throughput test<Icon name="arrow" size={17}/></>}</button></form>{error&&<p className="field-error" role="alert">{error}</p>}{result&&<div className="test-results"><Result label="Download" value={result.download_mbps} unit="Mbps"/><Result label="Upload" value={result.upload_mbps} unit="Mbps"/></div>}<p className="test-hint">Use a second device running <code>iperf3 -s</code> on your network. This test transfers data in both directions for 3 seconds each.</p></div>;
}
function Result({label,value,unit}:{label:string;value:number|null;unit:string}){return <div className="test-result"><span>{label}</span><p>{value??'—'}<small>{unit}</small></p></div>}
