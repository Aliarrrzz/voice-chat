import * as jwt from 'jsonwebtoken';
import { AppDataSource } from '../../config/data-source';
import { User } from '../../entities/User';

/**
 * Socket.io middleware — توکن JWT رو چک میکنه
 * اگه توکن نباشه guest mode، اگه باشه userId رو ست میکنه
 */
export function socketAuth(socket: any, next: (err?: Error) => void) {
  // مقادیر پیش‌فرض
  socket.userId        = null;
  socket.username      = null;
  socket.userInfo      = { name: 'Unknown', avatar: '👤' };
  socket.currentChannel = null;
  socket.voiceSessionId = null;

  const token = socket.handshake.auth?.token;
  if (!token) return next(); // guest

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    socket.userId   = payload.id;
    socket.username = payload.username;
    next();
  } catch {
    return next(new Error('Invalid token'));
  }
}

/**
 * بعد از connect اطلاعات کاربر رو از DB میخونه
 * اگه لاگین بود از DB، وگرنه همون guest name
 */
export async function resolveUserInfo(
  socket: any,
  fallback: { name: string; avatar: string }
) {
  if (socket.userId) {
    const user = await AppDataSource.getRepository(User).findOneBy({ id: socket.userId });
    if (user) {
      socket.userInfo = { name: user.username, avatar: user.avatar };
      return;
    }
  }
  socket.userInfo = { name: fallback.name || 'Unknown', avatar: fallback.avatar || '👤' };
}
