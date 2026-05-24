import 'reflect-metadata';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import { AppDataSource } from './config/data-source';
import { Channel } from './entities/Channel';
import { Message } from './entities/Message';
import { VoiceSession } from './entities/VoiceSession';
import { User } from './entities/USer';
import authRouter from './auth';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/auth', authRouter);

// ---- helpers ----
const channels: Record<string, Map<string, { name: string; avatar: string }>> = {};

function getChannelUsers(ch: string) {
  if (!channels[ch]) return [];
  return Array.from(channels[ch].entries()).map(([id, info]) => ({ id, ...info }));
}

function broadcastChannelUsers(ch: string) {
  const users = getChannelUsers(ch);
  io.to(ch).emit('channel-users', users);
  io.emit('channel-count', { channel: ch, count: users.length });
  io.emit('channel-sidebar', { channel: ch, users });
}

// ---- seed default channels ----
async function seedChannels() {
  const repo = AppDataSource.getRepository(Channel);
  const defaults = [
    { name: 'general', type: 'voice' as const },
    { name: 'gaming',  type: 'voice' as const },
    { name: 'chill',   type: 'voice' as const },
    { name: 'lobby',   type: 'text'  as const },
  ];
  for (const d of defaults) {
    const exists = await repo.findOneBy({ name: d.name });
    if (!exists) await repo.save(repo.create(d));
  }
}

// ---- socket auth middleware ----
io.use((socket: any, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.userId = null;
    socket.username = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    socket.userId   = payload.id;
    socket.username = payload.username;
    next();
  } catch {
    return next(new Error('Invalid token'));
  }
});

// ---- socket ----
io.on('connection', (socket: any) => {
  console.log(`[+] connected: ${socket.id}`);
  let currentChannel: string | null = null;
  let userInfo = { name: 'Unknown', avatar: '👤' };
  let voiceSessionId: number | null = null;

  socket.on('set-info', async ({ name, avatar }: any) => {
    if (socket.userId) {
      const user = await AppDataSource.getRepository(User).findOneBy({ id: socket.userId });
      if (user) userInfo = { name: user.username, avatar: user.avatar };
      else userInfo = { name: name || 'Unknown', avatar: avatar || '👤' };
    } else {
      userInfo = { name: name || 'Unknown', avatar: avatar || '👤' };
    }
    const snapshot: Record<string, any[]> = {};
    Object.keys(channels).forEach(ch => { snapshot[ch] = getChannelUsers(ch); });
    socket.emit('init-channels', snapshot);
  });

  socket.on('join', async (channelName: string) => {
    if (currentChannel) await leaveChannel(socket, currentChannel);
    currentChannel = channelName;

    if (!channels[channelName]) channels[channelName] = new Map();
    channels[channelName].set(socket.id, userInfo);
    socket.join(channelName);
    socket.to(channelName).emit('user-joined', socket.id);
    broadcastChannelUsers(channelName);

    const ch = await AppDataSource.getRepository(Channel).findOneBy({ name: channelName });
    if (ch) {
      // ذخیره voice session
      const vs = AppDataSource.getRepository(VoiceSession).create({
        channel: ch,
        user: socket.userId ? { id: socket.userId } as User : undefined,
      });
      const saved = await AppDataSource.getRepository(VoiceSession).save(vs);
      voiceSessionId = saved.id;

      // لود تاریخچه chat (آخرین ۵۰ پیام با اطلاعات کاربر)
      const msgs = await AppDataSource.getRepository(Message).find({
        where: { channel: { id: ch.id } },
        relations: { user: true },
        order: { createdAt: 'ASC' },
        take: 50,
      });
      socket.emit('chat-history', msgs.map(m => ({
        displayName: m.user?.username || 'Unknown',
        avatar:      m.user?.avatar   || '👤',
        msg:         m.content,
        timestamp:   m.createdAt.getTime(),
      })));
    }
  });

  socket.on('chat', async ({ channel, msg, displayName, avatar }: any) => {
    if (!channel || !msg) return;
    const ch = await AppDataSource.getRepository(Channel).findOneBy({ name: channel });
    if (ch) {
      const message = AppDataSource.getRepository(Message).create({
        content: msg,
        channel: ch,
        user: socket.userId ? { id: socket.userId } as User : undefined,
      });
      await AppDataSource.getRepository(Message).save(message);
    }
    io.to(channel).emit('chat', {
      from: socket.id, displayName: displayName || userInfo.name,
      avatar: avatar || userInfo.avatar, msg, timestamp: Date.now()
    });
  });

  // بقیه eventها مثل قبل...
  socket.on('offer',  ({ to, offer }: any)     => socket.to(to).emit('offer',  { from: socket.id, offer }));
  socket.on('answer', ({ to, answer }: any)    => socket.to(to).emit('answer', { from: socket.id, answer }));
  socket.on('ice',    ({ to, candidate }: any) => socket.to(to).emit('ice',    { from: socket.id, candidate }));
  socket.on('mute-state',       (data: any) => socket.to(data.channel).emit('mute-state',       { userId: socket.id, ...data }));
  socket.on('speaking',         (data: any) => socket.to(data.channel).emit('speaking',         { userId: socket.id, ...data }));
  socket.on('screen-share-state',(data: any) => socket.to(data.channel).emit('screen-share-state',{ userId: socket.id, ...data }));
  socket.on('ping', (timestamp: number) => {socket.emit('pong', timestamp);});

  socket.on('leave',      (ch: string) => { leaveChannel(socket, ch); currentChannel = null; });
  socket.on('disconnect', ()           => { if (currentChannel) leaveChannel(socket, currentChannel); });

  async function leaveChannel(sock: any, channelName: string) {
    if (!channels[channelName]) return;
    channels[channelName].delete(sock.id);
    sock.leave(channelName);
    sock.to(channelName).emit('user-left', sock.id);
    broadcastChannelUsers(channelName);
    if (channels[channelName].size === 0) delete channels[channelName];

    if (voiceSessionId) {
      await AppDataSource.getRepository(VoiceSession).update(voiceSessionId, { leftAt: new Date() });
      voiceSessionId = null;
    }
  }
});

// ---- start ----
AppDataSource.initialize().then(async () => {
  console.log('✅ Database connected');
  await seedChannels();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}).catch(err => console.error('❌ DB Error:', err));