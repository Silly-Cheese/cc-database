import type { Timestamp } from 'firebase/firestore';

export type StaffStatus = 'ACTIVE' | 'LEAVE_OF_ABSENCE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED' | 'FORMER_STAFF';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface StaffProfile {
  id: string;
  displayName: string;
  robloxUsername: string;
  robloxUserId: string;
  discordUsername: string;
  discordId: string;
  rankId: string;
  departmentId: string;
  teamId?: string;
  status: StaffStatus;
  joinedAt?: Timestamp;
  quotaPoints?: number;
  quotaTarget?: number;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Rank {
  id: string;
  name: string;
  abbreviation: string;
  tier: string;
  order: number;
  limit?: number;
  quotaTarget?: number;
  description?: string;
}

export interface Department {
  id: string;
  name: string;
  abbreviation: string;
  description?: string;
  active: boolean;
}

export interface PersonnelAction {
  id: string;
  staffProfileId: string;
  staffName: string;
  type: 'PROMOTION' | 'DEMOTION' | 'TRANSFER' | 'RESIGNATION' | 'TERMINATION' | 'STATUS_CHANGE';
  fromValue?: string;
  toValue?: string;
  reason: string;
  status: ReviewStatus;
  requestedBy: string;
  approvedBy?: string;
  effectiveAt?: Timestamp;
  createdAt?: Timestamp;
}

export interface QuotaSubmission {
  id: string;
  staffProfileId: string;
  staffName: string;
  activityType: string;
  points: number;
  description: string;
  evidenceUrl?: string;
  status: ReviewStatus;
  submittedBy: string;
  reviewedBy?: string;
  createdAt?: Timestamp;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'NORMAL' | 'IMPORTANT' | 'URGENT';
  audience: string;
  published: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  expiresAt?: Timestamp;
}
