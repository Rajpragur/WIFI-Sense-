import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Icon} from './icons';
import LiveMonitor from './LiveMonitor';
import Home from './Home';
import SurveyWorkspace from './SurveyWorkspace';
import NearbyNetworks from './NearbyNetworks';
import WalkingHeatmap from './WalkingHeatmap';
import PacketLab from './PacketLab';
import RouteExplorer from './RouteExplorer';
import './style.css';
import './home.css';
import './theme.css';
import './editorial.css';
type Tab='home'|'live'|'walk'|'survey'|'networks'|'compare'|'packet'|'trace';
const links:{id:Tab;name:string;icon:string}[]=[{id:'home',name:'Home',icon:'home'},{id:'live',name:'Live monitor',icon:'activity'},{id:'packet',name:'Packet lab',icon:'packet'},{id:'trace',name:'Route explorer',icon:'route'},{id:'walk',name:'Walking heatmap',icon:'route'},{id:'survey',name:'Coverage survey',icon:'map'},{id:'networks',name:'Nearby networks',icon:'wifi'},{id:'compare',name:'Compare surveys',icon:'compare'}];
function App(){
 const initialTab=()=>{const value=location.hash.slice(1);return (['home','live','walk','survey','networks','compare','packet','trace'].includes(value)?value:'home') as Tab};
 const [tab,setTab]=useState<Tab>(initialTab);
 const [dark,setDark]=useState(()=>document.documentElement.dataset.theme==='dark');
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('wifisense-theme',dark?'dark':'light')}catch{}},[dark]);
 useEffect(()=>{const change=()=>setTab(initialTab());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[]);
 function navigate(value:Tab){setTab(value);location.hash=value}
 const [walking,setWalking]=useState(false);
 return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><a href="#" className="brand" aria-label="Wi-FiSense home" onClick={e=>{e.preventDefault();navigate('home')}}><span className="brand-mark"><Icon name="wifi" size={24}/></span><span>wi-fi<span className="brand-light">sense</span><small>Wireless, understood.</small></span></a><button className="theme-toggle" type="button" aria-label="Dark mode" aria-pressed={dark} onClick={()=>setDark(value=>!value)}><Icon name={dark?'sun':'moon'} size={18}/><span>{dark?'Light mode':'Dark mode'}</span><i aria-hidden="true"/></button><div className="nav-label">Your workspace</div><nav aria-label="Main navigation">{links.map(link=><button key={link.id} className={`nav-item ${tab===link.id?'active':''}`} aria-current={tab===link.id?'page':undefined} onClick={()=>navigate(link.id)}><Icon name={link.icon} size={19}/><span>{link.name}</span>{link.id==='walk'&&walking?<span className="walk-recording-badge" aria-hidden="true" title="Walking survey recording"/>:tab===link.id&&<i/>}</button>)}</nav><div className="sidebar-bottom"><div className="local-symbol"><Icon name="computer" size={19}/></div><p>On your device<small>Your surveys stay here.</small></p><a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer" title="Open local API documentation"><Icon name="chevron" size={15}/><span className="sr-only">API documentation</span></a></div></aside><main id="main-content" className="main-content"><div hidden={tab!=='walk'}><WalkingHeatmap onRecordingChange={setWalking} dark={dark}/></div>{tab==='home'?<Home onNavigate={navigate}/>:tab==='live'?<LiveMonitor onNavigate={navigate}/>:tab==='walk'?null:tab==='packet'?<PacketLab onTrace={()=>navigate('trace')}/>:tab==='trace'?<RouteExplorer/>:tab==='networks'?<NearbyNetworks/>:<SurveyWorkspace mode={tab}/>}<footer><span>Wi-FiSense</span><span>A closer look at your wireless world.</span></footer></main></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
