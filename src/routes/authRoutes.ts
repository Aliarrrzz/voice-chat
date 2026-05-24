import { Router, Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt    from 'jsonwebtoken';
import { AppDataSource } from '../../config/data-source';
import { User }          from '../../entities/User';

const router  = Router();
const getRepo = () => AppDataSource.getRepository(User);

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { username, password, avatar } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = getRepo().create({ username, password: hash, avatar: avatar || '👤' });
    await getRepo().save(user);

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar } });
  } catch (err: any) {
    if (err.code === '23505')
      return res.status(400).json({ error: 'این نام کاربری قبلاً ثبت شده' });
    return res.status(500).json({ error: 'خطای سرور' });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });

  try {
    const user = await getRepo().findOneBy({ username });
    if (!user) return res.status(400).json({ error: 'کاربر پیدا نشد' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'رمز اشتباه است' });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar } });
  } catch {
    return res.status(500).json({ error: 'خطای سرور' });
  }
});

export default router;
