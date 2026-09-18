import 'server-only';
import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';
import type { AudioRecordingConfig } from '../../ai-session-notes/recording-config';

export type StartRoomCompositeEgressInput = { roomName: string; objectKey: string };
export type StartRoomCompositeEgressResult = { egressId: string };

/**
 * Confine testabile verso LiveKit — stesso ruolo di `LiveKitSessionControl`
 * nella pipeline delle prenotazioni, ma per l'egress room-composite: un solo
 * file audio misto per sessione, non un file per partecipante. L'Academy
 * non ha bisogno di separare le voci, quindi non serve track egress.
 */
export interface AcademyLiveKitControl {
  startRoomCompositeEgress(input: StartRoomCompositeEgressInput): Promise<StartRoomCompositeEgressResult>;
  stopEgress(egressId: string): Promise<void>;
}

export class ProductionAcademyLiveKitControl implements AcademyLiveKitControl {
  private readonly egress: EgressClient;

  constructor(private readonly config: AudioRecordingConfig) {
    this.egress = new EgressClient(config.livekitHost, config.livekitApiKey, config.livekitApiSecret);
  }

  async startRoomCompositeEgress(input: StartRoomCompositeEgressInput): Promise<StartRoomCompositeEgressResult> {
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: input.objectKey,
      disableManifest: true,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: this.config.s3AccessKey,
          secret: this.config.s3SecretKey,
          region: this.config.s3Region,
          endpoint: this.config.s3Endpoint,
          bucket: this.config.bucket,
          forcePathStyle: true,
        }),
      },
    });
    const result = await this.egress.startRoomCompositeEgress(input.roomName, output, { audioOnly: true });
    return { egressId: result.egressId };
  }

  async stopEgress(egressId: string): Promise<void> {
    await this.egress.stopEgress(egressId);
  }
}

export class InMemoryAcademyLiveKitControl implements AcademyLiveKitControl {
  readonly starts: StartRoomCompositeEgressInput[] = [];
  readonly stops: string[] = [];
  constructor(private readonly failStart = false) {}

  async startRoomCompositeEgress(input: StartRoomCompositeEgressInput): Promise<StartRoomCompositeEgressResult> {
    if (this.failStart) throw new Error('EGRESS_START_FAILED');
    this.starts.push(input);
    return { egressId: `test-egress-${this.starts.length}` };
  }

  async stopEgress(egressId: string): Promise<void> {
    if (!this.stops.includes(egressId)) this.stops.push(egressId);
  }
}
