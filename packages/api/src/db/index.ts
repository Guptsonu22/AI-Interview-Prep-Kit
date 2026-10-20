import mongoose from 'mongoose';
import { config } from '../config';
import pino from 'pino';

const logger = pino({ name: 'db' });

let mongooseConnection: mongoose.Connection | null = null;

export async function connectDatabase(): Promise<void> {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongodb.uri);
    mongooseConnection = mongoose.connection;
    logger.info({ uri: config.mongodb.uri }, 'MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  mongooseConnection = null;
  logger.info('MongoDB disconnected');
}

export function getMongooseConnection(): mongoose.Connection | null {
  return mongooseConnection;
}

export { mongoose };