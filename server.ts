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
    await seedChannels();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () =>
      console.log(`🚀 Server running → http://localhost:${PORT}`)
    );
  })
  .catch(err => console.error('❌ DB Error:', err));