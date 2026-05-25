import { Server, Socket } from 'socket.io';
import { AppDataSource } from '../../config/data-source';
import { Channel }       from '../../entities/Channel';
import { VoiceSession }  from '../../entities/VoiceSession';
import { User }          from '../../entities/User';

// in-memory: channelName => Map<socketId, {name,avatar}>
const channels: Record<string, Map<string, { name: string; avatar: string }>> = {};

export class VoiceController {
  constructor(private io: Server) {}

  // ─── helpers ───────────────────────────────────────────────
  getChannelUsers(ch: string) {
    if (!channels[ch]) return [];
    return Array.from(channels[ch].entries()).map(([id, info]) => ({ id, ...info }));
  }

  getSnapshot() {
    const snap: Record<string, any[]> = {};
    Object.keys(channels).forEach(ch => (snap[ch] = this.getChannelUsers(ch)));
    return snap;
  }

  private broadcast(ch: string) {
    const users = this.getChannelUsers(ch);
    this.io.to(ch).emit('channel-users', users);
    this.io.emit('channel-count',   { channel: ch, count: users.length });
    this.io.emit('channel-sidebar', { channel: ch, users });
  }

  // ─── join ──────────────────────────────────────────────────
  async joinChannel(socket: any, channelName: string) {
    // اگه قبلاً تو کانالی بود، برو بیرون
    if (socket.currentChannel) {
      await this.leaveChannel(socket, socket.currentChannel);
    }
    socket.currentChannel = channelName;

    if (!channels[channelName]) channels[channelName] = new Map();
    channels[channelName].set(socket.id, socket.userInfo);
    socket.join(channelName);
    socket.to(channelName).emit('user-joined', socket.id);
    this.broadcast(channelName);

    // ذخیره voice session در DB
    const ch = await AppDataSource.getRepository(Channel).findOneBy({ name: channelName });
    if (ch) {
      const vs = AppDataSource.getRepository(VoiceSession).create({
        channel: ch,
        user: socket.userId ? { id: socket.userId } as User : undefined,
      });
      const saved = await AppDataSource.getRepository(VoiceSession).save(vs);
      socket.voiceSessionId = saved.id;
    }
  }

  // ─── leave ─────────────────────────────────────────────────
  async leaveChannel(socket: any, channelName: string) {
    if (!channels[channelName]) return;
    channels[channelName].delete(socket.id);
    socket.leave(channelName);
    socket.to(channelName).emit('user-left', socket.id);
    this.broadcast(channelName);
    if (channels[channelName].size === 0) delete channels[channelName];

    // آپدیت leftAt در DB
    if (socket.voiceSessionId) {
      await AppDataSource.getRepository(VoiceSession)
        .update(socket.voiceSessionId, { leftAt: new Date() });
      socket.voiceSessionId = null;
    }
    socket.currentChannel = null;
  }

  // ─── WebRTC relay ──────────────────────────────────────────
  relayOffer(socket: Socket, data: { to: string; offer: any }) {
    socket.to(data.to).emit('offer', { from: socket.id, offer: data.offer });
  }

  relayAnswer(socket: Socket, data: { to: string; answer: any }) {
    socket.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
  }

  relayIce(socket: Socket, data: { to: string; candidate: any }) {
    socket.to(data.to).emit('ice', { from: socket.id, candidate: data.candidate });
  }

  // ─── voice state ───────────────────────────────────────────
  muteState(socket: Socket, data: any) {
    socket.to(data.channel).emit('mute-state', { userId: socket.id, ...data });
  }

  speaking(socket: Socket, data: any) {
    socket.to(data.channel).emit('speaking', { userId: socket.id, ...data });
  }

  screenShareState(socket: Socket, data: any) {
    socket.to(data.channel).emit('screen-share-state', { userId: socket.id, ...data });
  }

  // 🔴 Fix: video-state که قبلاً missing بود
  videoState(socket: Socket, data: any) {
    socket.to(data.channel).emit('video-state', { userId: socket.id, videoEnabled: data.videoEnabled });
  }

  // ─── disconnect ────────────────────────────────────────────
  async handleDisconnect(socket: any) {
    console.log(`[-] disconnected: ${socket.id}`);
    if (socket.currentChannel) {
      await this.leaveChannel(socket, socket.currentChannel);
    }
  }
}