import { connectDatabase, disconnectDatabase } from '../db';
import { config } from '../config';

async function main(): Promise<void> {
  console.log('Connecting to database...');
  await connectDatabase();
  console.log('Database connected. Models registered.');
  console.log('Run migrations manually if needed (mongoose auto-creates collections).');
  await disconnectDatabase();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});