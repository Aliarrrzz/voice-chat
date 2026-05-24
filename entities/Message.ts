import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from './USer';
import { Channel } from './Channel';

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, user => user.messages, { onDelete: 'SET NULL', nullable: true, eager: true })
  user: User;

  @ManyToOne(() => Channel, channel => channel.messages, { onDelete: 'CASCADE' })
  channel: Channel;
}