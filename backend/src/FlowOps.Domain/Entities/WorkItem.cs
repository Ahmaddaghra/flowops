using FlowOps.Domain.Enums;
using FlowOps.Domain.Exceptions;

namespace FlowOps.Domain.Entities;

public class WorkItem
{
    public const int MaxTitleLength = 200;
    public const int MaxDescriptionLength = 4000;
    public const int MaxAssigneeNameLength = 100;

    public Guid Id { get; private set; }
    public long Version { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public WorkItemStatus Status { get; private set; }
    public WorkItemPriority Priority { get; private set; }
    public Guid? CategoryId { get; private set; }
    public Category? Category { get; private set; }
    public string? AssigneeName { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private WorkItem() { }

    public WorkItem(
        string title,
        string? description = null,
        WorkItemPriority priority = WorkItemPriority.Medium,
        string? assigneeName = null,
        WorkItemStatus status = WorkItemStatus.Todo,
        Guid? categoryId = null,
        Guid? id = null,
        DateTime? createdAtUtc = null)
    {
        Id = id ?? Guid.NewGuid();
        Version = 1;
        Title = ValidateTitle(title);
        Description = ValidateDescription(description);
        Priority = ValidatePriority(priority);
        Status = ValidateStatus(status);
        AssigneeName = NormalizeAssignee(assigneeName);
        CategoryId = categoryId;

        var created = EnsureUtc(createdAtUtc ?? DateTime.UtcNow);
        CreatedAtUtc = created;
        UpdatedAtUtc = created;
    }

    public bool ChangeTitle(string title)
    {
        var normalized = ValidateTitle(title);
        if (Title == normalized) return false;
        Title = normalized;
        Touch();
        return true;
    }

    public bool ChangeDescription(string? description)
    {
        var normalized = ValidateDescription(description);
        if (Description == normalized) return false;
        Description = normalized;
        Touch();
        return true;
    }

    public bool ChangePriority(WorkItemPriority priority)
    {
        var validated = ValidatePriority(priority);
        if (Priority == validated) return false;
        Priority = validated;
        Touch();
        return true;
    }

    public bool ChangeCategory(Guid? categoryId)
    {
        if (CategoryId == categoryId) return false;
        CategoryId = categoryId;
        Category = null;
        Touch();
        return true;
    }

    public bool ChangeStatus(WorkItemStatus status)
    {
        var validated = ValidateStatus(status);
        if (!CanTransitionTo(validated))
        {
            throw new InvalidWorkItemTransitionException(Status, validated);
        }

        Status = validated;
        Touch();
        return true;
    }

    public bool Assign(string? assigneeName)
    {
        var normalized = NormalizeAssignee(assigneeName);
        if (AssigneeName == normalized) return false;
        AssigneeName = normalized;
        Touch();
        return true;
    }

    public bool CanTransitionTo(WorkItemStatus nextStatus)
    {
        if (!Enum.IsDefined(nextStatus)) return false;
        return Status switch
        {
            WorkItemStatus.Todo => nextStatus is WorkItemStatus.InProgress or WorkItemStatus.Blocked,
            WorkItemStatus.InProgress => nextStatus is WorkItemStatus.Blocked or WorkItemStatus.Done,
            WorkItemStatus.Blocked => nextStatus is WorkItemStatus.InProgress or WorkItemStatus.Todo,
            WorkItemStatus.Done => false,
            _ => false
        };
    }

    private void Touch()
    {
        var now = DateTime.UtcNow;
        UpdatedAtUtc = now > UpdatedAtUtc ? now : UpdatedAtUtc.AddTicks(1);
        Version++;
    }

    private static string ValidateTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Title is required and cannot be empty or whitespace.", nameof(title));

        var trimmed = title.Trim();
        if (trimmed.Length > MaxTitleLength)
            throw new ArgumentException($"Title cannot exceed {MaxTitleLength} characters.", nameof(title));
        return trimmed;
    }

    private static string? ValidateDescription(string? description)
    {
        if (description is not null && description.Length > MaxDescriptionLength)
            throw new ArgumentException($"Description cannot exceed {MaxDescriptionLength} characters.", nameof(description));
        return description;
    }

    private static WorkItemPriority ValidatePriority(WorkItemPriority priority)
    {
        if (!Enum.IsDefined(priority))
            throw new ArgumentException($"Invalid priority value: {priority}.", nameof(priority));
        return priority;
    }

    private static WorkItemStatus ValidateStatus(WorkItemStatus status)
    {
        if (!Enum.IsDefined(status))
            throw new ArgumentException($"Invalid status value: {status}.", nameof(status));
        return status;
    }

    private static string? NormalizeAssignee(string? assigneeName)
    {
        var trimmed = assigneeName?.Trim();
        if (trimmed is not null && trimmed.Length > MaxAssigneeNameLength)
            throw new ArgumentException($"Assignee name cannot exceed {MaxAssigneeNameLength} characters.", nameof(assigneeName));
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static DateTime EnsureUtc(DateTime value) => value.Kind == DateTimeKind.Utc
        ? value
        : DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
