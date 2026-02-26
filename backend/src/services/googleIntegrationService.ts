import { Platform } from "../lib/types";
import { google } from 'googleapis';
import { PlatformService } from './platformService';
import { logger } from '../utils/logger';

export class GoogleIntegrationService {
    private platformService: PlatformService;

    constructor() {
        this.platformService = new PlatformService();
    }

    /**
     * Initialize an authenticated Google API client for a specific user
     */
    private async getAuthenticatedClient(userId: string) {
        // Ensures token is valid, refreshing it if necessary
        const accessToken = await this.platformService.ensureValidToken(userId, Platform.GOOGLE_MEET);

        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({ access_token: accessToken });

        return auth;
    }

    /**
     * Send a meeting summary via Gmail
     */
    async sendSummaryEmail(userId: string, toEmail: string, subject: string, htmlContent: string): Promise<boolean> {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const gmail = google.gmail({ version: 'v1', auth });

            // Build the raw RFC 2822 email string
            const str = [
                `To: ${toEmail}`,
                'Content-Type: text/html; charset=utf-8',
                'MIME-Version: 1.0',
                `Subject: ${subject}`,
                '',
                htmlContent
            ].join('\n');

            const encodedEmail = Buffer.from(str)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const res = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedEmail
                }
            });

            logger.info('Sent summary email via Gmail API', { userId, messageId: res.data.id });
            return true;
        } catch (error) {
            logger.error('Failed to send email via Google Integration', { userId, error });
            return false;
        }
    }

    /**
     * Save action items to Google Tasks (Reminders)
     */
    async createActionItemTasks(userId: string, meetingTitle: string, tasks: Array<{ title: string, notes?: string, due?: string }>): Promise<boolean> {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const tasksApi = google.tasks({ version: 'v1', auth });

            // Create a task list specifically for this meeting's action items
            const taskListRes = await tasksApi.tasklists.insert({
                requestBody: { title: `Action Items: ${meetingTitle}` }
            });
            const taskListId = taskListRes.data.id;

            if (!taskListId) throw new Error("Could not create task list");

            // Insert each task
            for (const t of tasks) {
                await tasksApi.tasks.insert({
                    tasklist: taskListId,
                    requestBody: {
                        title: t.title,
                        notes: t.notes,
                        due: t.due ? new Date(t.due).toISOString() : undefined
                    }
                });
            }

            logger.info('Created Google Tasks for action items', { userId, taskCount: tasks.length });
            return true;
        } catch (error) {
            logger.error('Failed to create tasks via Google Integration', { userId, error });
            return false;
        }
    }

    /**
     * Send a notification to Google Chat (Spaces)
     */
    async sendChatNotification(userId: string, spaceName: string, text: string): Promise<boolean> {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const chat = google.chat({ version: 'v1', auth });

            await chat.spaces.messages.create({
                parent: spaceName, // Format: spaces/{spaceId}
                requestBody: {
                    text: text
                }
            });

            logger.info('Sent Google Chat notification', { userId, spaceName });
            return true;
        } catch (error) {
            logger.error('Failed to send Google Chat message', { userId, error });
            return false;
        }
    }

    /**
     * Fetch upcoming meeting details from Google Calendar
     */
    async fetchUpcomingMeetings(userId: string, maxResults: number = 10) {
        try {
            const auth = await this.getAuthenticatedClient(userId);
            const calendar = google.calendar({ version: 'v3', auth });

            const res = await calendar.events.list({
                calendarId: 'primary',
                timeMin: new Date().toISOString(),
                maxResults: maxResults,
                singleEvents: true,
                orderBy: 'startTime',
            });

            return res.data.items || [];
        } catch (error) {
            logger.error('Failed to fetch calendar events via Google Integration', { userId, error });
            return [];
        }
    }
}

export const googleIntegrationService = new GoogleIntegrationService();
