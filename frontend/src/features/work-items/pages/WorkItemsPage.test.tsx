import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';
import { PagedResult, WorkItem, WorkItemQuery } from '@/types/workItems';
import { categoriesApi, workItemsApi } from '@/lib/api/workItems';
import { WorkItemsPage } from './WorkItemsPage';

vi.mock('@/lib/api/workItems', () => ({
  categoriesApi: { list: vi.fn() },
  workItemsApi: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    changeStatus: vi.fn(),
    assign: vi.fn(),
    getActivity: vi.fn(),
    getHealth: vi.fn(),
  },
}));

const item: WorkItem = {
  id: 'item-1',
  title: 'Investigate customer login',
  description: 'Intermittent login failure',
  status: 'Todo',
  priority: 'High',
  categoryId: null,
  categoryName: null,
  assigneeName: 'Ahmad',
  createdAtUtc: '2026-09-29T10:00:00Z',
  updatedAtUtc: '2026-09-29T10:00:00Z',
};

const page = (items: WorkItem[] = []): PagedResult<WorkItem> => ({
  items,
  page: 1,
  pageSize: 20,
  totalItems: items.length,
  totalPages: items.length === 0 ? 0 : 1,
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="query-string">{location.search}</output>;
};

const renderPage = (initialEntry = '/work-items') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <WorkItemsPage />
    </MemoryRouter>
  );

describe('WorkItemsPage', () => {
  beforeEach(() => {
    vi.mocked(workItemsApi.list).mockResolvedValue(page());
    vi.mocked(categoriesApi.list).mockResolvedValue([]);
  });

  it('shows loading state while the API request is pending', () => {
    vi.mocked(workItemsApi.list).mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading work items' })).toBeTruthy();
  });

  it('shows a retryable API error', async () => {
    vi.mocked(workItemsApi.list).mockRejectedValue(
      new ApiError('Database unavailable', 503)
    );

    renderPage();

    expect(await screen.findByText('Database unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
  });

  it('shows the global empty state when there are no items', async () => {
    renderPage();

    expect(await screen.findByText('No work items yet')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Create work item' })).toHaveLength(2);
  });

  it('shows a filtered empty state for a query with no matches', async () => {
    renderPage('/work-items?status=Done');

    expect(await screen.findByText('No work items match these filters')).toBeTruthy();
    expect(screen.getByTestId('query-string').textContent).toContain('status=Done');
  });

  it('renders populated results', async () => {
    vi.mocked(workItemsApi.list).mockResolvedValue(page([item]));

    renderPage();

    expect(await screen.findAllByText(item.title)).toHaveLength(2);
    expect(screen.getAllByText('Ahmad')).toHaveLength(2);
  });

  it('debounces search, updates the URL, and sends the query to the API', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.list).mockImplementation(
      async (query: WorkItemQuery = {}) => ({
        ...page([item]),
        page: query.page ?? 1,
      })
    );
    renderPage();
    await screen.findAllByText(item.title);

    await user.type(screen.getByRole('textbox', { name: 'Search work items' }), 'login');

    await waitFor(() => {
      expect(workItemsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'login', page: 1 })
      );
      expect(screen.getByTestId('query-string').textContent).toContain('search=login');
    });
  });

  it('requests the next server page and records it in the URL', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.list).mockImplementation(
      async (query: WorkItemQuery = {}) => ({
        items: [item],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        totalItems: 21,
        totalPages: 21,
      })
    );
    renderPage('/work-items?pageSize=1');
    await screen.findAllByText(item.title);

    expect(
      (screen.getByRole('combobox', { name: 'Items per page' }) as HTMLSelectElement)
        .value
    ).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(workItemsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 1 })
      );
      expect(screen.getByTestId('query-string').textContent).toContain('page=2');
    });
  });
});
