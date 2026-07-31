import 'server-only';
import { DirectFileOutput, EgressClient, RoomServiceClient, S3Upload, TrackSource, TrackType } from 'livekit-server-sdk';
import type { AudioRecordingConfig } from './recording-config';

export type LiveKitTrackSnapshot = { sid: string; type: 'audio' | 'video'; source: string };
export type LiveKitParticipantSnapshot = { identity: string; tracks: LiveKitTrackSnapshot[] };
export type StartTrackEgressInput = { roomName: string; trackSid: string; objectKey: string };
export type StartTrackEgressResult = { egressId: string };
export interface LiveKitSessionControl { listParticipants(roomName: string): Promise<LiveKitParticipantSnapshot[]>; startTrackEgress(input: StartTrackEgressInput): Promise<StartTrackEgressResult>; stopEgress(egressId: string): Promise<void>; }

export class ProductionLiveKitSessionControl implements LiveKitSessionControl {
  private readonly room: RoomServiceClient; private readonly egress: EgressClient;
  constructor(private readonly config: AudioRecordingConfig) { this.room = new RoomServiceClient(config.livekitHost,config.livekitApiKey,config.livekitApiSecret); this.egress = new EgressClient(config.livekitHost,config.livekitApiKey,config.livekitApiSecret); }
  async listParticipants(roomName: string): Promise<LiveKitParticipantSnapshot[]> { const rows=await this.room.listParticipants(roomName); return rows.map(p=>({identity:p.identity,tracks:p.tracks.map(t=>({sid:t.sid,type:(t.type===TrackType.AUDIO?'audio':'video') as 'audio'|'video',source:t.source===TrackSource.MICROPHONE?'microphone':String(t.source)}))})); }
  async startTrackEgress(input: StartTrackEgressInput) { const output=new DirectFileOutput({filepath:input.objectKey,disableManifest:true,output:{case:'s3',value:new S3Upload({accessKey:this.config.s3AccessKey,secret:this.config.s3SecretKey,region:this.config.s3Region,endpoint:this.config.s3Endpoint,bucket:this.config.bucket,forcePathStyle:true})}}); const result=await this.egress.startTrackEgress(input.roomName,output,input.trackSid); return {egressId:result.egressId}; }
  async stopEgress(egressId: string): Promise<void> { await this.egress.stopEgress(egressId); }
}
export class InMemoryLiveKitSessionControl implements LiveKitSessionControl { readonly starts: StartTrackEgressInput[]=[]; readonly stops:string[]=[]; constructor(private readonly rooms=new Map<string,LiveKitParticipantSnapshot[]>(),private readonly failStart=false,private readonly failStop=false){} async listParticipants(roomName:string){return this.rooms.get(roomName)??[];} async startTrackEgress(input:StartTrackEgressInput){if(this.failStart)throw new Error('EGRESS_START_FAILED');this.starts.push(input);return {egressId:`test-egress-${this.starts.length}`};} async stopEgress(id:string){if(this.failStop)throw new Error('EGRESS_STOP_FAILED');if(!this.stops.includes(id))this.stops.push(id);} }
