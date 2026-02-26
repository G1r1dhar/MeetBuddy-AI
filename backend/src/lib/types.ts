// Platform types and enums for MeetBuddy AI

export enum Platform {
  GOOGLE_MEET = 'GOOGLE_MEET',
  MICROSOFT_TEAMS = 'MICROSOFT_TEAMS',
  ZOOM = 'ZOOM',
  WEBEX = 'WEBEX',
  DISCORD = 'DISCORD',
  SKYPE = 'SKYPE'
}

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum Subscription {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE'
}

export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  RECORDING = 'RECORDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum IntegrationStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

// Type guards
export const isPlatform = (value: string): value is Platform => {
  return Object.values(Platform).includes(value as Platform);
};

export const isRole = (value: string): value is Role => {
  return Object.values(Role).includes(value as Role);
};

export const isSubscription = (value: string): value is Subscription => {
  return Object.values(Subscription).includes(value as Subscription);
};

export const isMeetingStatus = (value: string): value is MeetingStatus => {
  return Object.values(MeetingStatus).includes(value as MeetingStatus);
};

export const isIntegrationStatus = (value: string): value is IntegrationStatus => {
  return Object.values(IntegrationStatus).includes(value as IntegrationStatus);
};