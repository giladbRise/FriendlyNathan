import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getDashboardStats,
  getAuditLog,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Dashboard stats
router.get('/stats', getDashboardStats);

// Audit log
router.get('/audit-log', getAuditLog);

// User management
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

export default router;
