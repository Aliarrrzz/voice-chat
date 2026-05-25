import { Server, Socket } from 'socket.io';
import { AppDataSource } from '../../config/data-source';
import { Channel } from '../../entities/Channel';
import { Message } from '../../entities/Message';
import { User }    from '../../entities/User';

export class ChatController {
  constructor(private io: Server) {}

  // ─── ارسال پیام ────────────────────────────────────────────
  async sendMessage(socket: any, data: {
    channel: string; msg: string; displayName: string; avatar: string;
  }) {
    const { channel, msg } = data;
    if (!channel || !msg?.trim()) return;

    // ذخیره در DB
    const ch = await AppDataSource.getRepository(Channel).findOneBy({ name: channel });
    if (ch) {
      const message = AppDataSource.getRepository(Message).create({
        content: msg.trim(),
        channel: ch,
        user: socket.userId ? { id: socket.userId } as User : undefined,
      });
      await AppDataSource.getRepository(Message).save(message);
    }

    // broadcast
    this.io.to(channel).emit('chat', {
      from:        socket.id,
      displayName: data.displayName || socket.userInfo?.name || 'Unknown',
      avatar:      data.avatar      || socket.userInfo?.avatar || '👤',
      msg:         msg.trim(),
      timestamp:   Date.now(),
    });
  }

  // ─── لود تاریخچه ───────────────────────────────────────────
  async loadHistory(socket: Socket, channelId: number) {
    const msgs = await AppDataSource.getRepository(Message).find({
      where:     { channel: { id: channelId } },
      relations: { user: true },   // explicit — دیگه eager نداریم
      order:     { createdAt: 'ASC' },
      take:      50,
    });

    socket.emit('chat-history', msgs.map(m => ({
      displayName: m.user?.username || 'Unknown',
      avatar:      m.user?.avatar   || '👤',
      msg:         m.content,
      timestamp:   m.createdAt.getTime(),
    })));
  }
}