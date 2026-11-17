export type Reading = {
  rssi: number; interface: string; ssid?: string; bssid?: string;
  band?: string; channel?: number; noise_dbm?: number; snr_db?: number;
  transmit_mbps?: number; timestamp: string; location_authorization?: 'authorized'|'denied'|'restricted'|'not_determined'|'unknown'; collector?: string;
};
export type Network = {ssid?: string; bssid?: string; rssi?: number; channel?: number; band?: string};
export type Probe = {target: string; latency_ms: number | null; jitter_ms: number | null; loss_percent: number; sent: number; received: number};
export type Speed = {target: string; upload_mbps: number; download_mbps: number; duration: number};
export type Point = {
 id: string; x: number; y: number; rssi: number; label: string; source: string; created_at: string;
 ssid?: string; channel?: number; latency_ms?: number; jitter_ms?: number; loss_percent?: number;
 upload_mbps?: number; download_mbps?: number; ping_target?: string; throughput_target?: string;
};
export type SurveySummary = {id: string; name: string; created_at: string};
export type Survey = SurveySummary & {floorplan?: string; measurements: Point[]; networks: Network[]};
export type Analysis = {grid: {x: number; y: number; rssi: number | null; distance: number | null}[]; weak_percent: number | null; mapped_percent: number | null; mae: number | null; candidate: {x: number; y: number; rssi: number} | null; channel_scores: {channel: number; score: number}[]; recommended_channel: number | null};
export type ChannelAnalysis = {scores: {channel: number; score: number}[]; recommended_channel: number | null};
export type WalkPoint = Reading & {id:string; x_m:number; y_m:number; latitude:number|null; longitude:number|null; accuracy_m:number|null; position_source:string};
export type WalkMap = {bounds:{min_x:number;max_x:number;min_y:number;max_y:number};columns:number;rows:number;cells:{x:number;y:number;rssi:number}[];radius_m:number;route_distance_m:number;sampled_area_m2:number};
export type Walk = {id:string;name:string;mode:'location'|'floorplan';created_at:string;floorplan?:string; width_m:number;height_m:number;origin_lat:number|null;origin_lon:number|null;samples:WalkPoint[];map:WalkMap};
