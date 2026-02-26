/**
 * Notification Service
 * 
 * Handles sending notifications via various channels (email, webhook, Slack)
 * for alerts and system events
 */

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import { googleIntegrationService } from './googleIntegrationService';

export interface NotificationChannel {
  type: 'email' | 'webhook' | 'slack' | 'gmail' | 'google_chat';
  config: Record<string, any>;
  enabled: boolean;
}

export interface NotificationMessage {
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private static instance: NotificationService;
  private emailTransporter?: nodemailer.Transporter;
  private channels: Map<string, NotificationChannel> = new Map();

  constructor() {
    this.initializeEmailTransporter();
    this.initializeDefaultChannels();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter(): void {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // Verify connection
      this.emailTransporter.verify((error) => {
        if (error) {
          logger.warn('Email transporter verification failed', { error });
        } else {
          logger.info('Email transporter ready');
        }
      });
    } else {
      logger.warn('Email configuration missing, email notifications disabled');
    }
  }

  /**
   * Initialize default notification channels
   */
  private initializeDefaultChannels(): void {
    // Admin email channel
    if (process.env.ADMIN_EMAIL) {
      this.channels.set('admin_email', {
        type: 'email',
        config: {
          recipients: [process.env.ADMIN_EMAIL],
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
        },
        enabled: true,
      });
    }

    // Security email channel
    if (process.env.SECURITY_EMAIL) {
      this.channels.set('security_email', {
        type: 'email',
        config: {
          recipients: [process.env.SECURITY_EMAIL],
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
        },
        enabled: true,
      });
    }

    // Webhook channel for external monitoring
    if (process.env.WEBHOOK_URL) {
      this.channels.set('monitoring_webhook', {
        type: 'webhook',
        config: {
          url: process.env.WEBHOOK_URL,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': process.env.WEBHOOK_AUTH_HEADER || '',
          },
        },
        enabled: true,
      });
    }

    // Slack channel
    if (process.env.SLACK_WEBHOOK_URL) {
      this.channels.set('slack_alerts', {
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#alerts',
          username: 'MeetBuddy AI Monitor',
          iconEmoji: ':warning:',
        },
        enabled: true,
      });
    }
  }

  /**
   * Send notification to specified channels
   */
  async sendNotification(
    message: NotificationMessage,
    channelIds?: string[]
  ): Promise<{ success: boolean; results: Record<string, boolean> }> {
    const results: Record<string, boolean> = {};
    let overallSuccess = true;

    // Determine which channels to use
    const targetChannels = channelIds
      ? channelIds.map(id => this.channels.get(id)).filter(Boolean) as NotificationChannel[]
      : Array.from(this.channels.values()).filter(channel => channel.enabled);

    // Send to each channel
    for (const channel of targetChannels) {
      try {
        let success = false;

        switch (channel.type) {
          case 'email':
            success = await this.sendEmailNotification(message, channel.config);
            break;
          case 'gmail':
            if (channel.config.userId && channel.config.toEmail) {
              const htmlContent = `<h1>${message.title}</h1><p>${message.message}</p>`;
              success = await googleIntegrationService.sendSummaryEmail(
                channel.config.userId,
                channel.config.toEmail,
                `[${message.severity.toUpperCase()}] ${message.title}`,
                htmlContent
              );
            }
            break;
          case 'google_chat':
            if (channel.config.userId && channel.config.spaceName) {
              success = await googleIntegrationService.sendChatNotification(
                channel.config.userId,
                channel.config.spaceName,
                `[${message.severity.toUpperCase()}] *${message.title}*\n${message.message}`
              );
            }
            break;
          case 'webhook':
            success = await this.sendWebhookNotification(message, channel.config);
            break;
          case 'slack':
            success = await this.sendSlackNotification(message, channel.config);
            break;
        }

        results[channel.type] = success;
        if (!success) overallSuccess = false;

      } catch (error) {
        logger.error('Failed to send notification', {
          error,
          channelType: channel.type,
          message: message.title
        });
        results[channel.type] = false;
        overallSuccess = false;
      }
    }

    return { success: overallSuccess, results };
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    message: NotificationMessage,
    config: any
  ): Promise<boolean> {
    if (!this.emailTransporter) {
      logger.warn('Email transporter not configured');
      return false;
    }

    const severityEmoji = {
      low: '🔵',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${this.getSeverityColor(message.severity)}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">
            ${severityEmoji[message.severity]} ${message.title}
          </h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">
            Severity: ${message.severity.toUpperCase()} | ${message.timestamp.toISOString()}
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-top: none;">
          <h2 style="color: #495057; margin-top: 0;">Message</h2>
          <p style="color: #6c757d; line-height: 1.6;">${message.message}</p>
          
          ${message.metadata ? `
            <h3 style="color: #495057;">Additional Details</h3>
            <pre style="background: #e9ecef; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px;">
${JSON.stringify(message.metadata, null, 2)}
            </pre>
          ` : ''}
        </div>
        
        <div style="background: #e9ecef; padding: 15px; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="margin: 0; color: #6c757d; font-size: 12px;">
            MeetBuddy AI Monitoring System | ${new Date().toISOString()}
          </p>
        </div>
      </div>
    `;

    try {
      await this.emailTransporter.sendMail({
        from: config.from,
        to: config.recipients.join(', '),
        subject: `[${message.severity.toUpperCase()}] ${message.title}`,
        html: htmlContent,
        text: `${message.title}\n\nSeverity: ${message.severity}\nTime: ${message.timestamp}\n\n${message.message}${message.metadata ? '\n\nDetails:\n' + JSON.stringify(message.metadata, null, 2) : ''
          }`,
      });

      logger.info('Email notification sent successfully', {
        recipients: config.recipients,
        title: message.title,
        severity: message.severity,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email notification', { error });
      return false;
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    message: NotificationMessage,
    config: any
  ): Promise<boolean> {
    try {
      const payload = {
        title: message.title,
        message: message.message,
        severity: message.severity,
        timestamp: message.timestamp.toISOString(),
        metadata: message.metadata,
        source: 'meetbuddy-ai-backend',
        environment: process.env.NODE_ENV || 'development',
      };

      const response = await fetch(config.url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        logger.info('Webhook notification sent successfully', {
          url: config.url,
          title: message.title,
          severity: message.severity,
          status: response.status,
        });
        return true;
      } else {
        logger.warn('Webhook notification failed', {
          url: config.url,
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }
    } catch (error) {
      logger.error('Failed to send webhook notification', { error });
      return false;
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    message: NotificationMessage,
    config: any
  ): Promise<boolean> {
    try {
      const severityColor = {
        low: '#36a64f',      // Green
        medium: '#ffb347',   // Orange
        high: '#ff6b47',     // Red-orange
        critical: '#ff0000', // Red
      };

      const payload = {
        channel: config.channel,
        username: config.username,
        icon_emoji: config.iconEmoji,
        attachments: [
          {
            color: severityColor[message.severity],
            title: message.title,
            text: message.message,
            fields: [
              {
                title: 'Severity',
                value: message.severity.toUpperCase(),
                short: true,
              },
              {
                title: 'Time',
                value: message.timestamp.toISOString(),
                short: true,
              },
              {
                title: 'Environment',
                value: process.env.NODE_ENV || 'development',
                short: true,
              },
            ],
            footer: 'MeetBuddy AI Monitoring',
            ts: Math.floor(message.timestamp.getTime() / 1000),
          },
        ],
      };

      // Add metadata as additional fields if present
      if (message.metadata) {
        payload.attachments?.[0]?.fields.push({
          title: 'Details',
          value: '```' + JSON.stringify(message.metadata, null, 2) + '```',
          short: false,
        });
      }

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        logger.info('Slack notification sent successfully', {
          channel: config.channel,
          title: message.title,
          severity: message.severity,
        });
        return true;
      } else {
        logger.warn('Slack notification failed', {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }
    } catch (error) {
      logger.error('Failed to send Slack notification', { error });
      return false;
    }
  }

  /**
   * Get severity color for styling
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'low': return '#28a745';
      case 'medium': return '#ffc107';
      case 'high': return '#fd7e14';
      case 'critical': return '#dc3545';
      default: return '#6c757d';
    }
  }

  /**
   * Add or update notification channel
   */
  addChannel(id: string, channel: NotificationChannel): void {
    this.channels.set(id, channel);
    logger.info('Notification channel added/updated', { id, type: channel.type });
  }

  /**
   * Remove notification channel
   */
  removeChannel(id: string): boolean {
    const removed = this.channels.delete(id);
    if (removed) {
      logger.info('Notification channel removed', { id });
    }
    return removed;
  }

  /**
   * Get all channels
   */
  getChannels(): Record<string, NotificationChannel> {
    return Object.fromEntries(this.channels.entries());
  }

  /**
   * Test notification channel
   */
  async testChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const testMessage: NotificationMessage = {
      title: 'Test Notification',
      message: 'This is a test notification to verify the channel configuration.',
      severity: 'low',
      timestamp: new Date(),
      metadata: {
        test: true,
        channelId,
        channelType: channel.type,
      },
    };

    const result = await this.sendNotification(testMessage, [channelId]);
    return result.success;
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();