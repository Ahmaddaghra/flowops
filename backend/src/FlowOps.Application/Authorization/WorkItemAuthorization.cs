using FlowOps.Application.DTOs;
using FlowOps.Application.Exceptions;
using FlowOps.Application.Interfaces;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.Authorization;

public sealed class WorkItemAuthorization(ICurrentUser currentUser)
{
    public Guid RequireUser()
    {
        if (!currentUser.IsAuthenticated || currentUser.UserId is not Guid userId || userId == Guid.Empty)
            throw new AuthenticationRequiredException();
        if (!currentUser.Roles.Contains(AppRoles.Member) && !IsAdmin)
            throw new ForbiddenOperationException();
        return userId;
    }

    private bool IsAdmin => currentUser.Roles.Contains(AppRoles.Admin);

    public WorkItemPermissions GetPermissions(WorkItem item)
    {
        var userId = RequireUser();
        var canEdit = IsAdmin || item.CreatedByUserId == userId || item.AssigneeUserId == userId;
        var canSelfAssign = item.AssigneeUserId is null && (IsAdmin || item.CreatedByUserId is not null);
        var canUnassign = IsAdmin || item.AssigneeUserId == userId;
        return new(canEdit, canEdit, IsAdmin || canSelfAssign || canUnassign,
            canSelfAssign, canUnassign, IsAdmin);
    }

    public void RequireEdit(WorkItem item)
    {
        if (!GetPermissions(item).CanEdit) throw new ForbiddenOperationException();
    }

    public void RequireAssignment(WorkItem item, Guid? assigneeUserId)
    {
        var userId = RequireUser();
        if (IsAdmin) return;
        if (item.CreatedByUserId is null && item.AssigneeUserId is null)
            throw new ForbiddenOperationException();
        if (assigneeUserId == userId && item.AssigneeUserId is null) return;
        if (assigneeUserId is null && item.AssigneeUserId == userId) return;
        throw new ForbiddenOperationException();
    }

    public void RequireInitialAssignment(Guid? assigneeUserId)
    {
        var userId = RequireUser();
        if (assigneeUserId is not null && assigneeUserId != userId && !IsAdmin)
            throw new ForbiddenOperationException();
    }
}
