import Joi from 'joi';

/**
 * Email validation using regex
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Password validation - at least 8 characters with uppercase, lowercase, number, and special character
 */
export const validatePassword = (password: string): boolean => {
  return password.length >= 6;
};

/**
 * Joi schemas for request validation
 */
export const authSchemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required',
    }),
    name: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 100 characters',
      'any.required': 'Name is required',
    }),
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
    mfaToken: Joi.string().length(6).pattern(/^\d+$/).messages({
      'string.length': 'MFA token must be 6 digits',
      'string.pattern.base': 'MFA token must contain only numbers',
    }),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  }),

  resetPassword: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Reset token is required',
    }),
    newPassword: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'New password is required',
    }),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Current password is required',
    }),
    newPassword: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'New password is required',
    }),
  }),

  refreshToken: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Token is required',
    }),
  }),
};

export const userSchemas = {
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(100).messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 100 characters',
    }),
    avatarUrl: Joi.string().uri().allow('').messages({
      'string.uri': 'Avatar URL must be a valid URL',
    }),
  }),

  updatePreferences: Joi.object({
    autoGenerateNotes: Joi.boolean(),
    enableRealTimeTranscript: Joi.boolean(),
    autoExportSummaries: Joi.boolean(),
    notifications: Joi.object({
      meetingReminders: Joi.boolean(),
      summaryReady: Joi.boolean(),
      adminMessages: Joi.boolean(),
    }),
  }),
};

export const meetingSchemas = {
  create: Joi.object({
    title: Joi.string().min(1).max(200).required().messages({
      'string.min': 'Meeting title is required',
      'string.max': 'Meeting title must not exceed 200 characters',
      'any.required': 'Meeting title is required',
    }),
    description: Joi.string().max(1000).allow('').messages({
      'string.max': 'Description must not exceed 1000 characters',
    }),
    platform: Joi.string().valid(
      'GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE'
    ).required().messages({
      'any.only': 'Platform must be one of: Google Meet, Zoom, Microsoft Teams, Webex, Discord, Skype',
      'any.required': 'Platform is required',
    }),
    meetingUrl: Joi.string().uri().messages({
      'string.uri': 'Meeting URL must be a valid URL',
    }),
    scheduledTime: Joi.date().iso().required().messages({
      'date.format': 'Scheduled time must be a valid ISO date',
      'any.required': 'Scheduled time is required',
    }),
    participants: Joi.array().items(Joi.string().email()).default([]).messages({
      'array.base': 'Participants must be an array of email addresses',
      'string.email': 'Each participant must have a valid email address',
    }),
  }),

  update: Joi.object({
    title: Joi.string().min(1).max(200).messages({
      'string.min': 'Meeting title cannot be empty',
      'string.max': 'Meeting title must not exceed 200 characters',
    }),
    description: Joi.string().max(1000).allow('').messages({
      'string.max': 'Description must not exceed 1000 characters',
    }),
    scheduledTime: Joi.date().iso().messages({
      'date.format': 'Scheduled time must be a valid ISO date',
    }),
    participants: Joi.array().items(Joi.string().email()).messages({
      'array.base': 'Participants must be an array of email addresses',
      'string.email': 'Each participant must have a valid email address',
    }),
  }),

  query: Joi.object({
    page: Joi.number().integer().min(1).default(1).messages({
      'number.base': 'Page must be a number',
      'number.integer': 'Page must be an integer',
      'number.min': 'Page must be at least 1',
    }),
    limit: Joi.number().integer().min(1).max(100).default(20).messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be an integer',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 100',
    }),
    status: Joi.string().valid('SCHEDULED', 'RECORDING', 'COMPLETED', 'CANCELLED').messages({
      'any.only': 'Status must be one of: SCHEDULED, RECORDING, COMPLETED, CANCELLED',
    }),
    platform: Joi.string().valid(
      'GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE'
    ).messages({
      'any.only': 'Platform must be one of: Google Meet, Zoom, Microsoft Teams, Webex, Discord, Skype',
    }),
    search: Joi.string().max(100).messages({
      'string.max': 'Search query must not exceed 100 characters',
    }),
    startDate: Joi.date().iso().messages({
      'date.format': 'Start date must be a valid ISO date',
    }),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).messages({
      'date.format': 'End date must be a valid ISO date',
      'date.min': 'End date must be after start date',
    }),
  }),
};

export const transcriptSchemas = {
  create: Joi.object({
    meetingId: Joi.string().required().messages({
      'any.required': 'Meeting ID is required',
    }),
    speaker: Joi.string().min(1).max(100).required().messages({
      'string.min': 'Speaker name is required',
      'string.max': 'Speaker name must not exceed 100 characters',
      'any.required': 'Speaker is required',
    }),
    text: Joi.string().min(1).max(1000).required().messages({
      'string.min': 'Transcript text is required',
      'string.max': 'Transcript text must not exceed 1000 characters',
      'any.required': 'Transcript text is required',
    }),
    timestamp: Joi.date().iso().required().messages({
      'date.format': 'Timestamp must be a valid ISO date',
      'any.required': 'Timestamp is required',
    }),
    confidence: Joi.number().min(0).max(1).default(0.9).messages({
      'number.base': 'Confidence must be a number',
      'number.min': 'Confidence must be at least 0',
      'number.max': 'Confidence must not exceed 1',
    }),
    isFinal: Joi.boolean().default(false),
  }),

  update: Joi.object({
    speaker: Joi.string().min(1).max(100).messages({
      'string.min': 'Speaker name cannot be empty',
      'string.max': 'Speaker name must not exceed 100 characters',
    }),
    text: Joi.string().min(1).max(1000).messages({
      'string.min': 'Transcript text cannot be empty',
      'string.max': 'Transcript text must not exceed 1000 characters',
    }),
    confidence: Joi.number().min(0).max(1).messages({
      'number.base': 'Confidence must be a number',
      'number.min': 'Confidence must be at least 0',
      'number.max': 'Confidence must not exceed 1',
    }),
    isFinal: Joi.boolean(),
  }),
};

/**
 * Validation middleware factory
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          details: errorMessage,
          statusCode: 400,
        },
      });
    }

    req.body = value;
    next();
  };
};

/**
 * Query validation middleware factory
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        error: {
          message: 'Query validation failed',
          details: errorMessage,
          statusCode: 400,
        },
      });
    }

    req.query = value;
    next();
  };
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Validate UUID format
 */
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};