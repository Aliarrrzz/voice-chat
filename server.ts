import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import express    from 'express';
import http       from 'http';
import path       from 'path';
import { Server } from 'socket.io';

import { AppDataSource } from './config/data-source';
import { seedChannels }  from './src/seeders/channelSeeder';
import { SocketService } from './src/services/SocketService';
import { VoiceSession }  from './entities/VoiceSession';
import authRoutes        from './src/routes/authRoutes';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ── middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🟠 Fix: favicon 404 رو suppress کن
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// ── REST routes ──────────────────────────────────────────────
app.use('/auth', authRoutes);

// ── socket ───────────────────────────────────────────────────
new SocketService(io).init();

// ── start ────────────────────────────────────────────────────
AppDataSource.initialize()
  .then(async () => {
    console.log('✅ Database connected');
    // بستن session های باز که سرور crash کرده بود
    await AppDataSource.getRepository(VoiceSession)
      .createQueryBuilder()
      .update()
      .set({ leftAt: new Date() })
      .where('leftAt IS NULL')
      .execute();
    console.log('✅ Orphan voice sessions cleaned up');
    await seedChannels();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () =>
      console.log(`🚀 Server running → http://localhost:${PORT}`)
    );
  })
  .catch(err => console.error('❌ DB Error:', err));