namespace FlowOps.Application.DTOs;

public sealed record WorkItemPermissions(
    bool CanEdit, bool CanChangeStatus, bool CanAssign,
    bool CanSelfAssign, bool CanUnassign, bool CanAssignOthers);
