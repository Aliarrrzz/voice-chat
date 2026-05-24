import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Message } from './Message';
import { VoiceSession } from './VoiceSession';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ default: '👤' })
  avatar: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Message, msg => msg.user)
  messages: Message[];

  @OneToMany(() => VoiceSession, vs => vs.user)
  voiceSessions: VoiceSession[];
}