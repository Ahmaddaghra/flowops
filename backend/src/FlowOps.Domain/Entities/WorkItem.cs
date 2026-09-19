using System;
using FlowOps.Domain.Enums;

namespace FlowOps.Domain.Entities;

public class WorkItem
{
    public const int MaxTitleLength = 200;
    public const int MaxDescriptionLength = 4000;
    public const int MaxAssigneeNameLength = 100;

    public Guid Id { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public WorkItemStatus Status { get; private set; }
    public WorkItemPriority Priority { get; private set; }
    public string? AssigneeName { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    // Parameterless constructor for EF Core
    private WorkItem() { }

    public WorkItem(
        string title,
        string? description = null,
        WorkItemPriority priority = WorkItemPriority.Medium,
        string? assigneeName = null,
        WorkItemStatus status = WorkItemStatus.Todo,
        Guid? id = null,
        DateTime? createdAtUtc = null)
    {
        Id = id ?? Guid.NewGuid();
        SetTitle(title);
        SetDescription(description);
        SetPriority(priority);
        SetAssigneeName(assigneeName);
        SetStatus(status);

        var now = DateTime.UtcNow;
        CreatedAtUtc = EnsureUtc(createdAtUtc ?? now);
        UpdatedAtUtc = CreatedAtUtc;
    }

    public void SetTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new ArgumentException("Title is required and cannot be empty or whitespace.", nameof(title));
        }

        var trimmed = title.Trim();
        if (trimmed.Length > MaxTitleLength)
        {
            throw new ArgumentException($"Title cannot exceed {MaxTitleLength} characters.", nameof(title));
        }

        Title = trimmed;
        Touch();
    }

    public void SetDescription(string? description)
    {
        if (description != null && description.Length > MaxDescriptionLength)
        {
            throw new ArgumentException($"Description cannot exceed {MaxDescriptionLength} characters.", nameof(description));
        }

        Description = description;
        Touch();
    }

    public void SetPriority(WorkItemPriority priority)
    {
        if (!Enum.IsDefined(typeof(WorkItemPriority), priority))
        {
            throw new ArgumentException($"Invalid priority value: {priority}.", nameof(priority));
        }

        Priority = priority;
        Touch();
    }

    public void SetStatus(WorkItemStatus status)
    {
        if (!Enum.IsDefined(typeof(WorkItemStatus), status))
        {
            throw new ArgumentException($"Invalid status value: {status}.", nameof(status));
        }

        Status = status;
        Touch();
    }

    public void SetAssigneeName(string? assigneeName)
    {
        var trimmed = assigneeName?.Trim();
        if (trimmed != null && trimmed.Length > MaxAssigneeNameLength)
        {
            throw new ArgumentException($"Assignee name cannot exceed {MaxAssigneeNameLength} characters.", nameof(assigneeName));
        }

        AssigneeName = string.IsNullOrEmpty(trimmed) ? null : trimmed;
        Touch();
    }

    private void Touch()
    {
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static DateTime EnsureUtc(DateTime dateTime)
    {
        return dateTime.Kind == DateTimeKind.Utc
            ? dateTime
            : DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);
    }
}
