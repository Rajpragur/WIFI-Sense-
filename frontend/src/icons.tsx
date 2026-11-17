import type {CSSProperties} from 'react';
const paths: Record<string, React.ReactNode> = {
 packet: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 13h4m-4 4h7"/></>,
 globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
 location: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
 route: <><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/></>,
 wifi: <><path d="M3 8.5a15 15 0 0 1 18 0M6.3 12a9.4 9.4 0 0 1 11.4 0M9.5 15.5a4 4 0 0 1 5 0"/><circle cx="12" cy="19" r=".6"/></>,
 activity: <path d="M2 12h4l3-7 5 14 3-7h5"/>,
 map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16m6-14v16"/></>,
 layers: <><path d="m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5"/></>,
 compare: <><path d="M5 4v16m14-16v16M2 8h6m8 8h6M9 12h6"/><circle cx="5" cy="8" r="2"/><circle cx="19" cy="16" r="2"/></>,
 arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
 refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/></>,
 pause: <><path d="M8 5v14m8-14v14"/></>,
 play: <path d="m8 4 12 8-12 8V4Z"/>,
 check: <path d="m5 12 4 4 10-10"/>,
 plus: <path d="M12 5v14M5 12h14"/>,
 close: <path d="m6 6 12 12M6 18 18 6"/>,
 download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
 computer: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
 info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/></>,
 signal: <><path d="M4 20v-3m5 3v-7m5 7V9m5 11V4"/></>,
 search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
 trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
 upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
 chevron: <path d="m8 5 7 7-7 7"/>,
};
export function Icon({name, size = 20, style}: {name: string; size?: number; style?: CSSProperties}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">{paths[name] ?? paths.wifi}</svg>;
}
