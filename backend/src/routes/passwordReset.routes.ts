import { Router } from 'express';
import { requestPasswordReset, resetPassword } from '../controllers/passwordReset.controller';

const router = Router();

router.post('/request', requestPasswordReset);
router.post('/reset', resetPassword);

export default router;
