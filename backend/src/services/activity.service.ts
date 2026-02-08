import { ActivityType } from '@prisma/client';
import prisma from '../lib/prisma';

/**
 * Service for logging and retrieving user activities
 */
export class ActivityService {
  /**
   * Log a new activity
   */
  async logActivity(
    userId: string,
    activityType: ActivityType,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await prisma.userActivity.create({
      data: {
        userId,
        activityType,
        description,
        metadata: metadata as any,
      },
    });
  }

  /**
   * Get recent activities for a user
   */
  async getRecentActivities(userId: string, limit: number = 10) {
    return prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get combined activity feed (activities + workflow generations)
   * This provides a unified view of all user actions
   */
  async getActivityFeed(userId: string, limit: number = 10) {
    // Get user activities
    const activities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get workflow generations (for backwards compatibility)
    const workflowGenerations = await prisma.workflowGeneration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        workflowDescription: true,
        status: true,
        createdAt: true,
        n8nWorkflowId: true,
      },
    });

    // Combine and sort by date
    const feed = [
      ...activities.map(a => ({
        id: a.id,
        type: 'activity' as const,
        activityType: a.activityType,
        description: a.description,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
      ...workflowGenerations.map(w => ({
        id: w.id,
        type: 'workflow' as const,
        activityType: w.status === 'success' ? 'workflow_created' as const : 'workflow_failed' as const,
        description: w.workflowDescription,
        metadata: { workflowId: w.n8nWorkflowId, status: w.status },
        createdAt: w.createdAt,
      })),
    ];

    // Sort by date descending and limit
    return feed
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Helper methods for common activities
  async logWorkflowCreated(userId: string, workflowId: string, description: string): Promise<void> {
    await this.logActivity(userId, 'workflow_created', description, { workflowId });
  }

  async logWorkflowFailed(userId: string, description: string, error: string): Promise<void> {
    await this.logActivity(userId, 'workflow_failed', description, { error });
  }

  async logInstanceAdded(userId: string, instanceName: string, instanceId: string): Promise<void> {
    await this.logActivity(userId, 'instance_added', `Added n8n instance: ${instanceName}`, { instanceId, instanceName });
  }

  async logInstanceUpdated(userId: string, instanceName: string, instanceId: string): Promise<void> {
    await this.logActivity(userId, 'instance_updated', `Updated n8n instance: ${instanceName}`, { instanceId, instanceName });
  }

  async logInstanceDeleted(userId: string, instanceName: string): Promise<void> {
    await this.logActivity(userId, 'instance_deleted', `Deleted n8n instance: ${instanceName}`, { instanceName });
  }

  async logProfileUpdated(userId: string, fields: string[]): Promise<void> {
    await this.logActivity(userId, 'profile_updated', `Updated profile: ${fields.join(', ')}`, { fields });
  }

  async logLogin(userId: string): Promise<void> {
    await this.logActivity(userId, 'login', 'Logged in', {});
  }
}

export const activityService = new ActivityService();
