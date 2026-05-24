import { AppDataSource } from '../../config/data-source';
import { Channel }       from '../../entities/Channel';

const DEFAULTS: { name: string; type: 'voice' | 'text' }[] = [
  { name: 'general', type: 'voice' },
  { name: 'gaming',  type: 'voice' },
  { name: 'chill',   type: 'voice' },
  { name: 'lobby',   type: 'text'  },
];

export async function seedChannels() {
  const repo = AppDataSource.getRepository(Channel);
  for (const d of DEFAULTS) {
    const exists = await repo.findOneBy({ name: d.name });
    if (!exists) await repo.save(repo.create(d));
  }
  console.log('✅ Channels seeded');
}
