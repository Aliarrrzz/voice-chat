import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { Channel } from '../entities/Channel';
import { Message } from '../entities/Message';
import { VoiceSession } from '../entities/VoiceSession';
import * as dotenv from 'dotenv';
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  synchronize: process.env.NODE_ENV === 'development',
  logging: false,
  entities: [User, Channel, Message, VoiceSession],
});