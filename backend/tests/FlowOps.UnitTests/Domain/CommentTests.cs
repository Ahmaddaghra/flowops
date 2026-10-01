using FlowOps.Domain.Entities;
using Xunit;

namespace FlowOps.UnitTests.Domain;

public class CommentTests
{
    [Fact]
    public void ValidComment_HasOwnIdResourceAuthorAndUtcTimestamp()
    {
        var workItemId = Guid.NewGuid();
        var authorId = Guid.NewGuid();
        var before = DateTime.UtcNow;

        var comment = new Comment(workItemId, authorId, "Investigated the report.");

        Assert.NotEqual(Guid.Empty, comment.Id);
        Assert.Equal(workItemId, comment.WorkItemId);
        Assert.Equal(authorId, comment.AuthorUserId);
        Assert.Equal("Investigated the report.", comment.Body);
        Assert.Equal(DateTimeKind.Utc, comment.CreatedAtUtc.Kind);
        Assert.InRange(comment.CreatedAtUtc, before, DateTime.UtcNow);
    }

    [Fact]
    public void Body_IsTrimmedWhileInternalWhitespaceIsPreserved()
    {
        var comment = new Comment(Guid.NewGuid(), Guid.NewGuid(), " \n First line\nSecond  line \t");

        Assert.Equal("First line\nSecond  line", comment.Body);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" \r\n\t ")]
    public void MissingBody_IsRejected(string? body)
    {
        var error = Assert.Throws<ArgumentException>(() => new Comment(Guid.NewGuid(), Guid.NewGuid(), body!));

        Assert.Equal("body", error.ParamName);
    }

    [Fact]
    public void BodyBeyondLimit_IsRejected()
    {
        var error = Assert.Throws<ArgumentException>(() =>
            new Comment(Guid.NewGuid(), Guid.NewGuid(), new string('x', Comment.MaxBodyLength + 1)));

        Assert.Equal("body", error.ParamName);
    }

    [Fact]
    public void BodyAtLimit_IsAccepted()
    {
        var comment = new Comment(Guid.NewGuid(), Guid.NewGuid(), new string('x', Comment.MaxBodyLength));

        Assert.Equal(Comment.MaxBodyLength, comment.Body.Length);
    }

    [Theory]
    [InlineData(DateTimeKind.Utc)]
    [InlineData(DateTimeKind.Unspecified)]
    public void SuppliedTimestamp_HasUtcKind(DateTimeKind kind)
    {
        var timestamp = new DateTime(2026, 9, 30, 12, 0, 0, kind);

        var comment = new Comment(Guid.NewGuid(), Guid.NewGuid(), "Comment", timestamp);

        Assert.Equal(DateTimeKind.Utc, comment.CreatedAtUtc.Kind);
        Assert.Equal(DateTime.SpecifyKind(timestamp, DateTimeKind.Utc), comment.CreatedAtUtc);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void EmptyRelationshipId_IsRejected(bool emptyWorkItem)
    {
        var error = Assert.Throws<ArgumentException>(() => new Comment(
            emptyWorkItem ? Guid.Empty : Guid.NewGuid(),
            emptyWorkItem ? Guid.NewGuid() : Guid.Empty, "Comment"));

        Assert.Equal(emptyWorkItem ? "workItemId" : "authorUserId", error.ParamName);
    }
}
