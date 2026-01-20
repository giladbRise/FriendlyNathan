import { Router } from 'express';
import { register, login, getCurrentUser, changePassword, updateProfile, refreshToken } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getCurrentUser);
router.post('/change-password', authenticate, changePassword);
router.put('/profile', authenticate, updateProfile);
router.post('/refresh', authenticate, refreshToken);

export default router;
