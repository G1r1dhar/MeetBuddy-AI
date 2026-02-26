import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

/**
 * Service to automatically complete meetings when their scheduled time has passed
 */
export class MeetingAutoCompleteService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

  /**
   * Start the auto-complete service
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('MeetingAutoCompleteService is already running');
      return;
    }

    logger.info('Starting MeetingAutoCompleteService');
    
    // Run immediately on start
    this.autoCompleteMeetings();
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.autoCompleteMeetings();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop the auto-complete service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('MeetingAutoCompleteService stopped');
    }
  }

  /**
   * Auto-complete meetings that have passed their scheduled time
   */
  private async autoCompleteMeetings(): Promise<void> {
    try {
      const now = new Date();
      
      // Find all scheduled meetings that should have started
      // (scheduled time + 2 hours buffer has passed)
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      const expiredMeetings = await prisma.meeting.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledTime: {
            lt: twoHoursAgo
          }
        },
        select: {
          id: true,
          title: true,
          scheduledTime: true,
          userId: true
        }
      });

      if (expiredMeetings.length === 0) {
        logger.debug('No expired meetings to auto-complete');
        return;
      }

      logger.info(`Found ${expiredMeetings.length} expired meetings to auto-complete`);

      // Update all expired meetings to COMPLETED status
      const result = await prisma.meeting.updateMany({
        where: {
          id: {
            in: expiredMeetings.map(m => m.id)
          }
        },
        data: {
          status: 'COMPLETED',
          endTime: now
        }
      });

      logger.info(`Auto-completed ${result.count} meetings`, {
        meetingIds: expiredMeetings.map(m => m.id),
        titles: expiredMeetings.map(m => m.title)
      });

      // Log each completed meeting
      for (const meeting of expiredMeetings) {
        logger.info('Meeting auto-completed', {
          meetingId: meeting.id,
          title: meeting.title,
          scheduledTime: meeting.scheduledTime,
          userId: meeting.userId
        });
      }

    } catch (error) {
      logger.error('Error auto-completing meetings', { error });
    }
  }

  /**
   * Manually trigger auto-completion (useful for testing)
   */
  async triggerAutoComplete(): Promise<number> {
    await this.autoCompleteMeetings();
    
    // Return count of completed meetings
    const result = await prisma.meeting.count({
      where: {
        status: 'COMPLETED',
        updatedAt: {
          gte: new Date(Date.now() - 60 * 1000) // Updated in last minute
        }
      }
    });
    
    return result;
  }
}

// Export singleton instance
export const meetingAutoCompleteService = new MeetingAutoCompleteService();
