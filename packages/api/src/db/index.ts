import mongoose from 'mongoose';
import { config } from '../config';
import pino from 'pino';

const logger = pino({ name: 'db' });

let mongooseConnection: mongoose.Connection | null = null;

export async function connectDatabase(): Promise<void> {
  try {
    mongoose.set('strictQuery', true);
    
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      mongooseConnection = mongoose.connection;
      logger.info('Using existing MongoDB connection');
      return;
    }
    
    await mongoose.connect(config.mongodb.uri);
    mongooseConnection = mongoose.connection;
    logger.info({ uri: config.mongodb.uri }, 'MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  mongooseConnection = null;
  logger.info('MongoDB disconnected');
}

export function getMongooseConnection(): mongoose.Connection | null {
  if (mongooseConnection) {
    return mongooseConnection;
  }
  if (mongoose.connection.readyState === 1) {
    mongooseConnection = mongoose.connection;
    return mongooseConnection;
  }
  return null;
}

export { mongoose };