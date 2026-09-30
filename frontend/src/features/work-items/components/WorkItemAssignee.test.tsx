import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { WorkItem } from '@/types/workItems';
import { WorkItemCard } from './WorkItemCard';
import { WorkItemTable } from './WorkItemTable';

const item: WorkItem = {
  id: 'item-1',
  version: 7,
  title: 'Review work item',
  description: null,
  status: 'Todo',
  priority: 'Medium',
  categoryId: null,
  categoryName: null,
  createdByUserId: 'creator-1',
  createdBy: { id: 'creator-1', displayName: 'Creator' },
  assigneeUserId: null,
  assignee: null,
  permissions: null,
  legacyAssigneeName: null,
  assigneeName: null,
  createdAtUtc: '2026-09-29T10:00:00Z',
  updatedAtUtc: '2026-09-29T10:00:00Z',
};

describe.each(['table', 'card'] as const)('%s assignment presentation', (surface) => {
  const renderItem = (assignment: Partial<WorkItem>) => {
    const result = { ...item, ...assignment };
    render(
      <MemoryRouter>
        {surface === 'table' ? (
          <WorkItemTable items={[result]} />
        ) : (
          <WorkItemCard item={result} />
        )}
      </MemoryRouter>
    );
  };

  it('shows the current user name ahead of legacy and compatibility text', () => {
    renderItem({
      assigneeUserId: 'assigned-user-1',
      assignee: { id: 'assigned-user-1', displayName: 'Current Member' },
      legacyAssigneeName: 'Former teammate',
      assigneeName: 'Compatibility text',
    });

    expect(screen.getByText('Current Member')).toBeTruthy();
    expect(screen.queryByText(/Former teammate/)).toBeNull();
    expect(screen.queryByText('Compatibility text')).toBeNull();
  });

  it('labels a legacy-only assignment as historical', () => {
    renderItem({
      createdByUserId: null,
      createdBy: null,
      legacyAssigneeName: 'Former teammate',
      assigneeName: 'Former teammate',
    });

    expect(screen.getByText('Historical assignment: Former teammate')).toBeTruthy();
    expect(screen.queryByText('Former teammate')).toBeNull();
  });

  it('keeps a missing current user summary distinct from historical assignment', () => {
    renderItem({
      assigneeUserId: 'unavailable-user-id',
      legacyAssigneeName: 'Former teammate',
      assigneeName: 'Former teammate',
    });

    expect(screen.getByText('Assigned user unavailable')).toBeTruthy();
    expect(screen.queryByText(/Former teammate/)).toBeNull();
    expect(screen.queryByText('unavailable-user-id')).toBeNull();
    expect(screen.queryByText('Unassigned')).toBeNull();
  });

  it('shows Unassigned when neither current nor historical assignment exists', () => {
    renderItem({ assigneeName: 'Compatibility text' });

    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.queryByText('Compatibility text')).toBeNull();
  });

  it('does not treat a summary without an assignment user ID as current identity', () => {
    renderItem({ assignee: { id: 'summary-only-user', displayName: 'Summary only' } });

    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.queryByText('Summary only')).toBeNull();
  });
});
