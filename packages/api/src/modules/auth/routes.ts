import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../../db/models';
import { config } from '../../config';
import { asyncHandler, AppError } from '../../middleware/errorHandler';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await User.findOne({ email: data.email });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await User.create({ email: data.email, passwordHash });

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );

  res.status(201).json({
    user: { id: user._id.toString(), email: user.email },
    token,
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);

  const user = await User.findOne({ email: data.email });
  if (!user) {
    throw new AppError(401, 'Invalid credentials');
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'Invalid credentials');
  }

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );

  res.json({
    user: { id: user._id.toString(), email: user.email },
    token,
  });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing token');
  }

  const token = authHeader.slice(7);
  const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };

  const user = await User.findById(decoded.userId).select('_id email').lean();
  if (!user) {
    throw new AppError(401, 'User not found');
  }

  res.json({ user: { id: user._id.toString(), email: user.email } });
}));

export { router as authRouter };