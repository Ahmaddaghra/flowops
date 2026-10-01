import { ApiError } from '@/types/api';

export function workItemMutationErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : fallback;
  }

  if (error.status === 403) {
    return (
      error.problemDetails?.detail ??
      'You do not have permission to change this work item.'
    );
  }

  if (error.status === 409) {
    const detail = error.problemDetails?.detail ?? error.message;
    switch (error.problemDetails?.title) {
      case 'Work Item Concurrency Conflict':
        return detail || 'This work item changed elsewhere. Refresh it and try again.';
      case 'Invalid Work Item Transition':
        return detail
          ? `This status change is not allowed: ${detail}`
          : 'This status change is not allowed. Refresh the item and choose an allowed status.';
      default:
        return (
          detail ||
          'This change conflicts with the latest work item state. Refresh it and try again.'
        );
    }
  }

  return error.problemDetails?.detail ?? error.message ?? fallback;
}
