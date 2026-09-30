import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { workItemsApi } from '@/lib/api/workItems';
import { formatDate } from '@/lib/utils';
import { ApiError } from '@/types/api';
import { WorkItemComment } from '@/types/workItems';

interface WorkItemCommentsProps {
  workItemId: string;
  onCommentAdded: () => void;
}

const orderComments = (comments: WorkItemComment[]): WorkItemComment[] =>
  Array.from(new Map(comments.map((comment) => [comment.id, comment])).values()).sort(
    (first, second) => {
      const milliseconds =
        Date.parse(first.createdAtUtc) - Date.parse(second.createdAtUtc);
      if (milliseconds !== 0) return milliseconds;
      // Preserve PostgreSQL/.NET precision before using ID to break timestamp ties.
      const firstFraction = (first.createdAtUtc.match(/\.(\d+)/)?.[1] ?? '').padEnd(
        7,
        '0'
      );
      const secondFraction = (second.createdAtUtc.match(/\.(\d+)/)?.[1] ?? '').padEnd(
        7,
        '0'
      );
      if (firstFraction !== secondFraction)
        return firstFraction < secondFraction ? -1 : 1;
      return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
    }
  );

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiError) {
    const bodyErrors = Object.entries(error.problemDetails?.errors ?? {}).find(
      ([field]) => field.toLowerCase() === 'body'
    )?.[1];
    return bodyErrors?.[0] ?? error.problemDetails?.detail ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
};

export const WorkItemComments: React.FC<WorkItemCommentsProps> = ({
  workItemId,
  onCommentAdded,
}) => {
  const fieldId = useId();
  const headingId = `${fieldId}-heading`;
  const textareaId = `${fieldId}-body`;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const mounted = useRef(false);
  const listRequestSequence = useRef(0);
  const pendingSubmit = useRef(false);
  const addedComments = useRef<WorkItemComment[]>([]);
  const [comments, setComments] = useState<WorkItemComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useLayoutEffect(() => {
    mounted.current = true;
    const requestSequence = listRequestSequence;
    return () => {
      mounted.current = false;
      requestSequence.current++;
    };
  }, []);

  const loadComments = useCallback(async () => {
    const requestSequence = ++listRequestSequence.current;
    setIsLoading(true);
    setListError(null);
    try {
      const result = await workItemsApi.getComments(workItemId);
      if (mounted.current && requestSequence === listRequestSequence.current)
        setComments(orderComments([...result, ...addedComments.current]));
    } catch (error: unknown) {
      if (mounted.current && requestSequence === listRequestSequence.current)
        setListError(errorMessage(error, 'Could not load comments.'));
    } finally {
      if (mounted.current && requestSequence === listRequestSequence.current)
        setIsLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingSubmit.current) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setSubmitError('Comment is required.');
      return;
    }
    if (trimmedBody.length > 2000) {
      setSubmitError('Comment cannot exceed 2000 characters.');
      return;
    }
    pendingSubmit.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const comment = await workItemsApi.addComment(workItemId, { body: trimmedBody });
      if (mounted.current) {
        addedComments.current.push(comment);
        setComments((current) => orderComments([...current, comment]));
        setBody('');
        onCommentAdded();
      }
    } catch (error: unknown) {
      if (mounted.current)
        setSubmitError(errorMessage(error, 'Could not add the comment.'));
    } finally {
      pendingSubmit.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="min-w-0">
      <CardHeader>
        <CardTitle id={headingId}>Comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && (
          <p className="text-sm text-slate-500" role="status">
            Loading comments…
          </p>
        )}
        {!isLoading && listError && (
          <div className="space-y-3 rounded-md border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm text-rose-800" role="alert">
              {listError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadComments()}
            >
              Retry comments
            </Button>
          </div>
        )}
        {!isLoading && !listError && comments.length === 0 && (
          <p className="text-sm text-slate-500">No comments yet.</p>
        )}
        {comments.length > 0 && (
          <ol className="space-y-4" aria-label="Work item comments, oldest first">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="min-w-0 border-b border-slate-100 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="break-words text-sm font-medium text-slate-900">
                    {comment.author.displayName}
                  </p>
                  <time
                    dateTime={comment.createdAtUtc}
                    className="text-xs text-slate-500"
                  >
                    {formatDate(comment.createdAtUtc)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {comment.body}
                </p>
              </li>
            ))}
          </ol>
        )}
        <form
          className="space-y-3 border-t border-slate-100 pt-4"
          onSubmit={submitComment}
          noValidate
        >
          <div className="space-y-1.5">
            <label
              htmlFor={textareaId}
              className="block text-sm font-medium text-slate-700"
            >
              Add a comment
            </label>
            <textarea
              id={textareaId}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setSubmitError(null);
              }}
              required
              maxLength={2000}
              rows={4}
              disabled={isSubmitting}
              aria-invalid={Boolean(submitError)}
              aria-describedby={[hintId, submitError ? errorId : null]
                .filter(Boolean)
                .join(' ')}
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-600 disabled:opacity-50"
            />
            <p id={hintId} className="text-xs text-slate-500">
              Plain text, up to 2000 characters.
            </p>
            {submitError && (
              <p id={errorId} className="text-sm text-rose-700" role="alert">
                {submitError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {isSubmitting && (
              <p className="text-xs text-slate-500" role="status">
                Adding comment…
              </p>
            )}
            <Button type="submit" isLoading={isSubmitting}>
              Add comment
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
