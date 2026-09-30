import type { UserSummary } from '@/types/workItems';
import { apiClient } from './client';

export const usersApi = {
  list: async (): Promise<UserSummary[]> => apiClient<UserSummary[]>('/users'),
};
