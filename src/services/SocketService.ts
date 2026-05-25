import { Server } from 'socket.io';
import { VoiceController }              from '../controllers/VoiceController';
import { ChatController }               from '../controllers/ChatController';
import { socketAuth, resolveUserInfo }  from '../middlewares/socketAuth';
import { AppDataSource }                from '../../config/data-source';
import { Channel }                      from '../../entities/Channel';

export class SocketService {
  private voice: VoiceController;
  private chat:  ChatController;

  constructor(private io: Server) {
    this.voice = new VoiceController(io);
    this.chat  = new ChatController(io);
  }

  init() {
    // ── auth middleware ──────────────────────────────────────
    this.io.use(socketAuth);

    this.io.on('connection', async (socket: any) => {
      console.log(`[+] connected: ${socket.id}`);

      // ── set-info ─────────────────────────────────────────
      socket.on('set-info', async ({ name, avatar }: any) => {
        await resolveUserInfo(socket, { name, avatar });
        socket.emit('init-channels', this.voice.getSnapshot());
      });

      // ── join / leave ──────────────────────────────────────
      socket.on('join', async (channelName: string) => {
        await this.voice.joinChannel(socket, channelName);
        const ch = await AppDataSource.getRepository(Channel)
          .findOneBy({ name: channelName });
        if (ch) await this.chat.loadHistory(socket, ch.id);
      });

      socket.on('leave', async (channelName: string) => {
        await this.voice.leaveChannel(socket, channelName);
      });

      // ── WebRTC relay ──────────────────────────────────────
      socket.on('offer',  (d: any) => this.voice.relayOffer(socket, d));
      socket.on('answer', (d: any) => this.voice.relayAnswer(socket, d));
      socket.on('ice',    (d: any) => this.voice.relayIce(socket, d));

      // ── voice state ───────────────────────────────────────
      socket.on('mute-state',         (d: any) => this.voice.muteState(socket, d));
      socket.on('speaking',           (d: any) => this.voice.speaking(socket, d));
      socket.on('screen-share-state', (d: any) => this.voice.screenShareState(socket, d));
      socket.on('video-state',        (d: any) => this.voice.videoState(socket, d));

      // ── chat ──────────────────────────────────────────────
      socket.on('chat', (d: any) => this.chat.sendMessage(socket, d));

      // ── ping ──────────────────────────────────────────────
      socket.on('ping', (ts: number) => socket.emit('pong', ts));

      // ── disconnect ────────────────────────────────────────
      socket.on('disconnect', () => this.voice.handleDisconnect(socket));
    });
  }
}