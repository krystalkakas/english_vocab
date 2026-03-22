export interface Word {
  id?: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  translation: string;
  example: string;
  audioUrl?: string;
  userId: string;
  createdAt: any; // Firestore Timestamp
  lastReviewedAt?: any; // Firestore Timestamp
  masteryLevel: number;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  }
}
