import { Entity, PrimaryGeneratedColumn, CreateDateColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';
import { Channel } from './Channel';

@Entity()
export class VoiceSession {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  joinedAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  leftAt: Date | null;

  @ManyToOne(() => User, user => user.voiceSessions, { onDelete: 'SET NULL', nullable: true })
  user: User;

  @ManyToOne(() => Channel, channel => channel.voiceSessions, { onDelete: 'CASCADE' })
  channel: Channel;
}