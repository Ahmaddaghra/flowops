import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/features/auth/useAuth';
import { usersApi } from '@/lib/api/users';
import { ApiError } from '@/types/api';
import type { UserSummary, WorkItem } from '@/types/workItems';
import { workItemMutationErrorMessage } from '../utils/mutationErrorMessage';
import { WorkItemAssignee } from './WorkItemAssignee';

interface WorkItemAssignmentProps {
  item: WorkItem;
  isMutating: boolean;
  onAssign: (assigneeUserId: string | null) => Promise<void>;
  onRefresh: () => void;
}

export function WorkItemAssignment({
  item,
  isMutating,
  onAssign,
  onRefresh,
}: WorkItemAssignmentProps) {
  const { user } = useAuth();
  const permissions = item.permissions;
  const canUseDirectory = Boolean(permissions?.canAssign && permissions.canAssignOthers);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [directory, setDirectory] = useState<UserSummary[] | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState(item.assigneeUserId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const busy = isMutating || isSaving;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setSelectedId(item.assigneeUserId ?? '');
  }, [item.assigneeUserId]);

  useEffect(() => {
    if (!pickerOpen || !canUseDirectory) return;
    let active = true;
    setDirectoryLoading(true);
    setDirectoryError(null);
    usersApi
      .list()
      .then((users) => {
        if (active) setDirectory(users);
      })
      .catch((failure: unknown) => {
        if (active)
          setDirectoryError(
            failure instanceof ApiError && failure.status === 403
              ? 'You do not have permission to view the user directory.'
              : 'Could not load the user directory. Please try again.'
          );
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pickerOpen, canUseDirectory, retry]);

  async function assign(assigneeUserId: string | null) {
    if (pending.current || isMutating || !permissions?.canAssign) return;
    pending.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await onAssign(assigneeUserId);
    } catch (failure: unknown) {
      if (mounted.current)
        setError({
          message: workItemMutationErrorMessage(
            failure,
            'Could not update the assignment.'
          ),
          conflict: failure instanceof ApiError && failure.status === 409,
        });
    } finally {
      pending.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }

  function saveSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedId ||
      selectedId === item.assigneeUserId ||
      !directory?.some((entry) => entry.id === selectedId)
    )
      return;
    void assign(selectedId);
  }

  const options = [
    { value: '', label: 'Select a user' },
    ...(directory ?? []).map((entry) => ({ value: entry.id, label: entry.displayName })),
  ];
  if (
    item.assigneeUserId &&
    !directory?.some((entry) => entry.id === item.assigneeUserId)
  ) {
    options.push({
      value: item.assigneeUserId,
      label: `${item.assignee?.displayName ?? 'Assigned user'} (current assignment)`,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-700">
          Assigned to:{' '}
          <WorkItemAssignee item={item} className="font-medium text-slate-900" />
        </p>
        {error && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-rose-700">
              {error.message}
            </p>
            {error.conflict && (
              <>
                <p className="text-xs text-slate-600">
                  Refresh to review the latest work item before retrying.
                </p>
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
                  Refresh work item
                </Button>
              </>
            )}
          </div>
        )}
        {isSaving && (
          <p role="status" className="text-xs text-slate-500">
            Saving assignment…
          </p>
        )}
        {canUseDirectory ? (
          <div className="space-y-3">
            {!pickerOpen ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setPickerOpen(true)}
              >
                Change assignment
              </Button>
            ) : (
              <div className="space-y-3">
                {directoryLoading ? (
                  <p role="status" className="text-xs text-slate-500">
                    Loading users…
                  </p>
                ) : directoryError ? (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-rose-700">
                      {directoryError}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Retry user directory
                    </Button>
                  </div>
                ) : directory?.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No active users are available for assignment.
                  </p>
                ) : directory ? (
                  <form
                    className="space-y-3"
                    onSubmit={saveSelection}
                    aria-label="Change assignment"
                  >
                    <Select
                      label="Assign to"
                      value={selectedId}
                      disabled={busy}
                      options={options}
                      onChange={(event) => setSelectedId(event.target.value)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        busy ||
                        !selectedId ||
                        selectedId === item.assigneeUserId ||
                        !directory.some((entry) => entry.id === selectedId)
                      }
                    >
                      Save assignment
                    </Button>
                  </form>
                ) : null}
              </div>
            )}
            {item.assigneeUserId && permissions?.canUnassign && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void assign(null)}
              >
                Unassign
              </Button>
            )}
          </div>
        ) : permissions?.canAssign ? (
          <div className="flex flex-wrap gap-2">
            {permissions.canSelfAssign && (
              <Button
                type="button"
                size="sm"
                disabled={busy || !user?.id}
                onClick={() => {
                  if (user?.id) void assign(user.id);
                }}
              >
                Assign to me
              </Button>
            )}
            {permissions.canUnassign && item.assigneeUserId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void assign(null)}
              >
                Unassign me
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Assignment changes are unavailable for this item.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
