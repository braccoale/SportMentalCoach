'use client';

import '@livekit/components-styles';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';

/**
 * LiveKit room client. Connects with a server-minted token and renders the
 * standard conference UI (camera/mic publish + remote participants).
 */
export function VideoRoom({
  serverUrl,
  token,
}: {
  serverUrl: string;
  token: string;
}) {
  return (
    <div
      data-lk-theme="default"
      style={{ height: '70vh' }}
      className="overflow-hidden rounded-lg border border-gray-200"
    >
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect
        video
        audio
        style={{ height: '100%' }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
