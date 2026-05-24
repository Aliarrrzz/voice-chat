import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Message } from './Message';
import { VoiceSession } from './VoiceSession';

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ default: 'voice' })
  type: 'voice' | 'text';

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Message, msg => msg.channel)
  messages: Message[];

  @OneToMany(() => VoiceSession, vs => vs.channel)
  voiceSessions: VoiceSession[];
}