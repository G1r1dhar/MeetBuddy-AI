import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { createSession, destroySession, destroyAllUserSessions } from '../middleware/session';
import { userCache } from '../utils/cache';
import { logger, logSecurity } from '../utils/logger';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError
} from '../middleware/errorHandler';
import { validateEmail, validatePassword } from '../utils/validation';
import { Request } from 'express';

interface RegisterData {
  email: string;
  password: string;
  name: string;
}

interface LoginData {
  email: string;
  password: string;
  mfaToken?: string;
}

interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    subscription: string;
    avatarUrl?: string;
    createdAt: Date;
    lastLoginAt?: Date;
    mfaEnabled: boolean;
  };
  token: string;
  sessionId: string;
  requiresMfa?: boolean;
  tempToken?: string;
}

interface PasswordResetData {
  email: string;
}

interface PasswordResetConfirmData {
  token: string;
  newPassword: string;
}

interface MfaSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class AuthService {
  private static readonly BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
  private static readonly JWT_SECRET = process.env.JWT_SECRET;
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  private static readonly MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
  private static readonly LOCKOUT_DURATION = parseInt(process.env.LOCKOUT_DURATION || '900000'); // 15 minutes

  constructor() {
    if (!AuthService.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Check if account is locked
   */
  private async isAccountLocked(user: any): Promise<boolean> {
    if (!user.accountLockedUntil) return false;

    const now = new Date();
    if (now < user.accountLockedUntil) {
      return true;
    }

    // Unlock account if lockout period has passed
    await prisma.user.update({
      where: { id: user.id },
      data: {
        accountLockedUntil: null,
        failedLoginAttempts: 0,
      },
    });

    return false;
  }

  /**
   * Handle failed login attempt
   */
  private async handleFailedLogin(userId: string, req: Request): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, email: true },
    });

    if (!user) return;

    const attempts = user.failedLoginAttempts + 1;
    const updateData: any = { failedLoginAttempts: attempts };

    if (attempts >= AuthService.MAX_LOGIN_ATTEMPTS) {
      updateData.accountLockedUntil = new Date(Date.now() + AuthService.LOCKOUT_DURATION);

      logSecurity('Account locked due to failed login attempts', {
        userId,
        email: user.email,
        attempts,
        lockoutDuration: AuthService.LOCKOUT_DURATION,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * Reset failed login attempts on successful login
   */
  private async resetFailedAttempts(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        accountLockedUntil: null,
      },
    });
  }

  /**
   * Generate backup codes for MFA
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substr(2, 8).toUpperCase());
    }
    return codes;
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData, req: Request): Promise<AuthResult> {
    const { email, password, name } = data;

    // Validate input data
    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    if (!validatePassword(password)) {
      throw new ValidationError(
        'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
      );
    }

    if (!name || name.trim().length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      logSecurity('Registration attempt with existing email', {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, AuthService.BCRYPT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name: name.trim(),
        preferences: JSON.stringify({
          autoGenerateNotes: true,
          enableRealTimeTranscript: true,
          autoExportSummaries: false,
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: false,
          },
        }),
      },
    });

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
    });

    // Create session and generate token
    const { token, sessionId } = await createSession(
      user.id,
      user.email,
      user.name,
      user.role,
      req
    );

    // Cache user data
    await userCache.set(user.id, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscription: user.subscription,
      avatarUrl: user.avatarUrl,
      mfaEnabled: user.mfaEnabled,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
        avatarUrl: user.avatarUrl ?? undefined,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? undefined,
        mfaEnabled: user.mfaEnabled,
      },
      token,
      sessionId,
    };
  }

  /**
   * Login user with enhanced security
   */
  async login(data: LoginData, req: Request): Promise<AuthResult> {
    const { email, password, mfaToken } = data;

    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      logSecurity('Login attempt with non-existent email', {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if account is locked
    if (await this.isAccountLocked(user)) {
      logSecurity('Login attempt on locked account', {
        userId: user.id,
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new TooManyRequestsError('Account is temporarily locked due to too many failed login attempts');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id, req);
      logSecurity('Login attempt with invalid password', {
        userId: user.id,
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new AuthenticationError('Invalid email or password');
    }

    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaToken) {
        // Generate temporary token for MFA verification
        const tempToken = jwt.sign(
          { userId: user.id, type: 'mfa_pending' },
          AuthService.JWT_SECRET!,
          { expiresIn: '10m' }
        );

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            subscription: user.subscription,
            avatarUrl: user.avatarUrl ?? undefined,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt ?? undefined,
            mfaEnabled: user.mfaEnabled,
          },
          token: '',
          sessionId: '',
          requiresMfa: true,
          tempToken,
        };
      }

      // Verify MFA token
      const isValidMfa = speakeasy.totp.verify({
        secret: user.mfaSecret!,
        encoding: 'base32',
        token: mfaToken,
        window: 2, // Allow 2 time steps (60 seconds) of drift
      });

      if (!isValidMfa) {
        // Check if it's a backup code
        const backupCodes = JSON.parse(user.mfaBackupCodes) as string[];
        const isValidBackupCode = backupCodes.includes(mfaToken);

        if (!isValidBackupCode) {
          await this.handleFailedLogin(user.id, req);
          logSecurity('Login attempt with invalid MFA token', {
            userId: user.id,
            email,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
          throw new AuthenticationError('Invalid MFA token');
        }

        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter(code => code !== mfaToken);
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: JSON.stringify(updatedBackupCodes) },
        });

        logSecurity('Backup code used for login', {
          userId: user.id,
          email,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      }
    }

    // Reset failed attempts on successful login
    await this.resetFailedAttempts(user.id);

    // Update last login time
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      mfaUsed: user.mfaEnabled,
    });

    // Create session and generate token
    const { token, sessionId } = await createSession(
      user.id,
      user.email,
      user.name,
      user.role,
      req
    );

    // Cache user data
    await userCache.set(user.id, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscription: user.subscription,
      avatarUrl: user.avatarUrl,
      mfaEnabled: user.mfaEnabled,
    });

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        subscription: updatedUser.subscription,
        avatarUrl: updatedUser.avatarUrl ?? undefined,
        createdAt: updatedUser.createdAt,
        lastLoginAt: updatedUser.lastLoginAt ?? undefined,
        mfaEnabled: updatedUser.mfaEnabled,
      },
      token,
      sessionId,
    };
  }

  /**
   * Setup MFA for user
   */
  async setupMfa(userId: string): Promise<MfaSetupResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, mfaEnabled: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.mfaEnabled) {
      throw new ConflictError('MFA is already enabled for this user');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `MeetBuddy AI (${user.email})`,
      issuer: 'MeetBuddy AI',
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store secret and backup codes (but don't enable MFA yet)
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret.base32,
        mfaBackupCodes: JSON.stringify(backupCodes),
      },
    });

    logger.info('MFA setup initiated', {
      userId,
      email: user.email,
    });

    return {
      secret: secret.base32!,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Enable MFA after verification
   */
  async enableMfa(userId: string, token: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true, email: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.mfaEnabled) {
      throw new ConflictError('MFA is already enabled');
    }

    if (!user.mfaSecret) {
      throw new ValidationError('MFA setup not initiated. Please setup MFA first.');
    }

    // Verify the token
    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!isValid) {
      throw new AuthenticationError('Invalid MFA token');
    }

    // Enable MFA
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    // Invalidate user cache
    await userCache.invalidate(userId);

    logger.info('MFA enabled successfully', {
      userId,
      email: user.email,
    });

    logSecurity('MFA enabled', {
      userId,
      email: user.email,
    });
  }

  /**
   * Disable MFA
   */
  async disableMfa(userId: string, password: string, mfaToken: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.mfaEnabled) {
      throw new ValidationError('MFA is not enabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid password');
    }

    // Verify MFA token
    const isValidMfa = speakeasy.totp.verify({
      secret: user.mfaSecret!,
      encoding: 'base32',
      token: mfaToken,
      window: 2,
    });

    if (!isValidMfa) {
      throw new AuthenticationError('Invalid MFA token');
    }

    // Disable MFA
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: '[]',
      },
    });

    // Invalidate user cache
    await userCache.invalidate(userId);

    logger.info('MFA disabled', {
      userId,
      email: user.email,
    });

    logSecurity('MFA disabled', {
      userId,
      email: user.email,
    });
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<any[]> {
    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActivity: 'desc' },
    });

    return sessions.map(session => ({
      id: session.id,
      sessionId: session.sessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
      isCurrent: false, // This would need to be determined by comparing with current session
    }));
  }

  /**
   * Revoke specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.userSession.findFirst({
      where: {
        userId,
        sessionId,
        isActive: true,
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await prisma.userSession.update({
      where: { id: session.id },
      data: { isActive: false },
    });

    await destroySession(sessionId);

    logger.info('Session revoked', {
      userId,
      sessionId,
    });
  }

  /**
   * Revoke all sessions except current
   */
  async revokeAllSessions(userId: string, currentSessionId?: string): Promise<void> {
    const whereClause: any = {
      userId,
      isActive: true,
    };

    if (currentSessionId) {
      whereClause.sessionId = { not: currentSessionId };
    }

    const sessions = await prisma.userSession.findMany({
      where: whereClause,
      select: { sessionId: true },
    });

    // Mark sessions as inactive
    await prisma.userSession.updateMany({
      where: whereClause,
      data: { isActive: false },
    });

    // Destroy sessions from cache
    for (const session of sessions) {
      await destroySession(session.sessionId);
    }

    logger.info('All user sessions revoked', {
      userId,
      sessionCount: sessions.length,
      currentSessionId,
    });

    logSecurity('All sessions revoked', {
      userId,
      sessionCount: sessions.length,
    });
  }

  /**
   * Logout user
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    await this.revokeSession(userId, sessionId);
    await userCache.invalidate(userId);

    logger.info('User logged out successfully', {
      userId,
      sessionId,
    });
  }

  /**
   * Refresh JWT token
   */
  async refreshToken(oldToken: string, req: Request): Promise<{ token: string }> {
    try {
      // Verify the old token (even if expired)
      const decoded = jwt.verify(oldToken, AuthService.JWT_SECRET!, { ignoreExpiration: true }) as any;

      // Get user to ensure they still exist
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Create new session
      const { token } = await createSession(
        user.id,
        user.email,
        user.name,
        user.role,
        req
      );

      logger.info('Token refreshed successfully', {
        userId: user.id,
        ip: req.ip,
      });

      return { token };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(data: PasswordResetData, req: Request): Promise<void> {
    const { email } = data;

    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      logger.info('Password reset requested for non-existent email', { email });
      return;
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      AuthService.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    // In a real application, you would send this token via email
    // For now, we'll just log it (in production, use an email service)
    logger.info('Password reset token generated', {
      userId: user.id,
      email: user.email,
      resetToken, // Remove this in production
      ip: req.ip,
    });

    logSecurity('Password reset requested', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // TODO: Send email with reset token
    // await emailService.sendPasswordResetEmail(user.email, resetToken);
  }

  /**
   * Reset password with token
   */
  async resetPassword(data: PasswordResetConfirmData, req: Request): Promise<void> {
    const { token, newPassword } = data;

    if (!validatePassword(newPassword)) {
      throw new ValidationError(
        'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
      );
    }

    try {
      // Verify reset token
      const decoded = jwt.verify(token, AuthService.JWT_SECRET!) as any;

      if (decoded.type !== 'password_reset') {
        throw new AuthenticationError('Invalid reset token');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, AuthService.BCRYPT_ROUNDS);

      // Update password and reset failed attempts
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      // Revoke all user sessions (force re-login)
      await this.revokeAllSessions(user.id);
      await userCache.invalidate(user.id);

      logger.info('Password reset successfully', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
      });

      logSecurity('Password reset completed', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid or expired reset token');
      }
      throw error;
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, AuthService.JWT_SECRET!);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Get user by ID (with caching)
   */
  async getUserById(userId: string): Promise<any> {
    // Try cache first
    const cachedUser = await userCache.get(userId);
    if (cachedUser) {
      return cachedUser;
    }

    // Get from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: true,
        avatarUrl: true,
        preferences: true,
        createdAt: true,
        lastLoginAt: true,
        storageUsed: true,
        mfaEnabled: true,
        failedLoginAttempts: true,
        accountLockedUntil: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const userWithParsedPrefs = {
      ...user,
      preferences: user.preferences ? JSON.parse(user.preferences as string) : null,
    };

    // Cache user data
    await userCache.set(userId, userWithParsedPrefs);

    return userWithParsedPrefs;
  }

  /**
   * Change user password (authenticated)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    req: Request
  ): Promise<void> {
    if (!validatePassword(newPassword)) {
      throw new ValidationError(
        'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      logSecurity('Password change attempt with invalid current password', {
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, AuthService.BCRYPT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidate user cache
    await userCache.invalidate(userId);

    logger.info('Password changed successfully', {
      userId,
      email: user.email,
      ip: req.ip,
    });

    logSecurity('Password changed', {
      userId,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  }
}