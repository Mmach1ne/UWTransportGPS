import { RequestHandler } from 'express';

// Import middleware with require to avoid ESM issues
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

export const corsMiddleware: RequestHandler = cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
});

export const helmetMiddleware: RequestHandler = helmet({
  contentSecurityPolicy: false
});

export const compressionMiddleware: RequestHandler = compression();

export const morganMiddleware: RequestHandler = morgan('combined');