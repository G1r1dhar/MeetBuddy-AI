import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { Request } from 'express';

interface AuditEntry {
  id?: string;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

interface AuditQuery {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  page?: number;
  limit?: number;
}

export class AuditTrailService {
  /**
   * Log an audit entry
   */
  async logAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    const auditEntry: AuditEntry = {
      ...entry,
      timestamp: new Date(),
    };

    try {
      // In a real implementation, you would store this in an audit_trail table
      // For now, we'll use structured logging
      logger.info('Audit Trail Entry', {
        userId: entry.userId,
        sessionId: entry.sessionId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        success: entry.success,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        oldValues: entry.oldValues,
        newValues: entry.newValues,
        metadata: entry.metadata,
        errorMessage: entry.errorMessage,
        timestamp: auditEntry.timestamp,
      });

      return auditEntry;
    } catch (error) {
      logger.error('Failed to log audit entry', {
        error: error instanceof Error ? error.message : 'Unknown error',
        entry: auditEntry,
      });
      throw error;
    }
  }

  /**
   * Log user authentication events
   */
  async logAuthenticationEvent(
    req: Request,
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_RESET' | 'REGISTER',
    userId?: string,
    success: boolean = true,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logAuditEntry({
      userId,
      sessionId: req.user?.sessionId,
      action,
      resource: 'authentication',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        endpoint: req.path,
        method: req.method,
        ...metadata,
      },
    });
  }

  /**
   * Log user management events
   */
  async logUserManagementEvent(
    req: Request,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW',
    targetUserId: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `USER_${action}`,
      resource: 'user',
      resourceId: targetUserId,
      oldValues,
      newValues,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        performedBy: req.user?.email,
        performedByRole: req.user?.role,
      },
    });
  }

  /**
   * Log meeting management events
   */
  async logMeetingEvent(
    req: Request,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'EXPORT' | 'START_CAPTURE' | 'STOP_CAPTURE',
    meetingId: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `MEETING_${action}`,
      resource: 'meeting',
      resourceId: meetingId,
      oldValues,
      newValues,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        userEmail: req.user?.email,
      },
    });
  }

  /**
   * Log admin actions
   */
  async logAdminAction(
    req: Request,
    action: string,
    resource: string,
    resourceId?: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `ADMIN_${action.toUpperCase()}`,
      resource,
      resourceId,
      oldValues,
      newValues,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        adminEmail: req.user?.email,
        adminName: req.user?.name,
        requestBody: req.method !== 'GET' ? req.body : undefined,
        requestParams: req.params,
        requestQuery: req.query,
      },
    });
  }

  /**
   * Log data access events
   */
  async logDataAccessEvent(
    req: Request,
    action: 'READ' | 'export' | 'download',
    resource: string,
    resourceId?: string,
    success: boolean = true,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `DATA_${action.toUpperCase()}`,
      resource,
      resourceId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        userEmail: req.user?.email,
        accessType: action,
        ...metadata,
      },
    });
  }

  /**
   * Log system configuration changes
   */
  async logSystemConfigurationEvent(
    req: Request,
    action: 'UPDATE' | 'VIEW',
    configSection: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `CONFIG_${action}`,
      resource: 'system_configuration',
      resourceId: configSection,
      oldValues,
      newValues,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        adminEmail: req.user?.email,
        configSection,
      },
    });
  }

  /**
   * Log file operations
   */
  async logFileOperation(
    req: Request,
    action: 'UPLOAD' | 'DOWNLOAD' | 'DELETE' | 'VIEW',
    fileName: string,
    fileSize?: number,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `FILE_${action}`,
      resource: 'file',
      resourceId: fileName,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        fileName,
        fileSize,
        userEmail: req.user?.email,
      },
    });
  }

  /**
   * Get audit trail entries
   */
  async getAuditTrail(query: AuditQuery): Promise<{
    entries: AuditEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const {
      userId,
      action,
      resource,
      startDate,
      endDate,
      success,
      page = 1,
      limit = 50,
    } = query;

    // In a real implementation, this would query the audit_trail table
    // For now, we'll return mock data
    const mockEntries: AuditEntry[] = [
      {
        id: 'audit_001',
        userId: 'user_123',
        action: 'USER_LOGIN',
        resource: 'authentication',
        ipAddress: '192.168.1.100',
        timestamp: new Date(Date.now() - 60000),
        success: true,
      },
      {
        id: 'audit_002',
        userId: 'admin_456',
        action: 'ADMIN_USER_CREATE',
        resource: 'user',
        resourceId: 'user_789',
        ipAddress: '192.168.1.50',
        timestamp: new Date(Date.now() - 120000),
        success: true,
        newValues: { email: 'newuser@example.com', role: 'USER' },
      },
      {
        id: 'audit_003',
        userId: 'user_123',
        action: 'MEETING_CREATE',
        resource: 'meeting',
        resourceId: 'meeting_001',
        ipAddress: '192.168.1.100',
        timestamp: new Date(Date.now() - 180000),
        success: true,
        newValues: { title: 'Team Standup', platform: 'google-meet' },
      },
    ];

    // Apply filters (in a real implementation, this would be done in the database query)
    let filteredEntries = mockEntries;

    if (userId) {
      filteredEntries = filteredEntries.filter(entry => entry.userId === userId);
    }

    if (action) {
      filteredEntries = filteredEntries.filter(entry => 
        entry.action.toLowerCase().includes(action.toLowerCase())
      );
    }

    if (resource) {
      filteredEntries = filteredEntries.filter(entry => entry.resource === resource);
    }

    if (success !== undefined) {
      filteredEntries = filteredEntries.filter(entry => entry.success === success);
    }

    if (startDate) {
      filteredEntries = filteredEntries.filter(entry => 
        entry.timestamp >= startDate
      );
    }

    if (endDate) {
      filteredEntries = filteredEntries.filter(entry => 
        entry.timestamp <= endDate
      );
    }

    // Pagination
    const total = filteredEntries.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedEntries = filteredEntries.slice(offset, offset + limit);

    return {
      entries: paginatedEntries,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalEntries: number;
    successfulActions: number;
    failedActions: number;
    topActions: Array<{ action: string; count: number }>;
    topUsers: Array<{ userId: string; count: number }>;
    topResources: Array<{ resource: string; count: number }>;
  }> {
    // In a real implementation, this would query the audit_trail table with aggregations
    // For now, we'll return mock statistics
    return {
      totalEntries: 1250,
      successfulActions: 1180,
      failedActions: 70,
      topActions: [
        { action: 'USER_LOGIN', count: 450 },
        { action: 'MEETING_VIEW', count: 320 },
        { action: 'MEETING_CREATE', count: 180 },
        { action: 'DATA_EXPORT', count: 120 },
        { action: 'USER_UPDATE', count: 80 },
      ],
      topUsers: [
        { userId: 'user_123', count: 250 },
        { userId: 'user_456', count: 180 },
        { userId: 'admin_789', count: 150 },
        { userId: 'user_012', count: 120 },
        { userId: 'user_345', count: 100 },
      ],
      topResources: [
        { resource: 'authentication', count: 500 },
        { resource: 'meeting', count: 400 },
        { resource: 'user', count: 200 },
        { resource: 'file', count: 100 },
        { resource: 'system_configuration', count: 50 },
      ],
    };
  }

  /**
   * Export audit trail to CSV
   */
  async exportAuditTrail(query: AuditQuery): Promise<string> {
    const { entries } = await this.getAuditTrail({ ...query, limit: 10000 });

    const csvHeaders = [
      'Timestamp',
      'User ID',
      'Action',
      'Resource',
      'Resource ID',
      'IP Address',
      'Success',
      'Error Message',
      'Old Values',
      'New Values',
    ];

    const csvRows = entries.map(entry => [
      entry.timestamp.toISOString(),
      entry.userId || '',
      entry.action,
      entry.resource,
      entry.resourceId || '',
      entry.ipAddress,
      entry.success.toString(),
      entry.errorMessage || '',
      entry.oldValues ? JSON.stringify(entry.oldValues) : '',
      entry.newValues ? JSON.stringify(entry.newValues) : '',
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => 
        row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csvContent;
  }
}

// Export singleton instance
export const auditTrailService = new AuditTrailService();