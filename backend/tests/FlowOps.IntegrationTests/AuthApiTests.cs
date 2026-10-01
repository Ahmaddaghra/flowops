using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Infrastructure.Identity;
using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace FlowOps.IntegrationTests;

// Each test class gets its own factory/schema, allowing the auth and work-item
// suites to run in parallel without sharing database resets or global settings.
public class AuthApiTests : IClassFixture<FlowOpsApiFactory>
{
    private readonly FlowOpsApiFactory _factory;

    public AuthApiTests(FlowOpsApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Register_CreatesMember_WithSafeResponseAndExpectedJwtClaims()
    {
        var email = UniqueEmail();
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = FlowOpsApiFactory.TestPassword,
            displayName = "Registered member"
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await ReadSafeAuthAsync(response);
        Assert.Equal(email, body.User.Email);
        Assert.Equal("Registered member", body.User.DisplayName);
        Assert.Equal(new[] { AppRoles.Member }, body.User.Roles);
        Assert.NotEqual(Guid.Empty, body.User.Id);
        Assert.InRange(body.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(59), DateTime.UtcNow.AddMinutes(61));

        var token = new JwtSecurityTokenHandler().ReadJwtToken(body.AccessToken);
        Assert.Equal(FlowOpsApiFactory.TestIssuer, token.Issuer);
        Assert.Equal(new[] { FlowOpsApiFactory.TestAudience }, token.Audiences);
        Assert.Equal(body.User.Id.ToString(), token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(email, token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal("Registered member", token.Claims.Single(claim => claim.Type == "name").Value);
        Assert.Equal(AppRoles.Member, token.Claims.Single(claim => claim.Type == "role").Value);
        Assert.True(Guid.TryParse(token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Jti).Value, out _));

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var persisted = await users.FindByIdAsync(body.User.Id.ToString());
        Assert.NotNull(persisted);
        Assert.True(await users.CheckPasswordAsync(persisted, FlowOpsApiFactory.TestPassword));
        Assert.NotEqual(FlowOpsApiFactory.TestPassword, persisted.PasswordHash);
        Assert.Equal(new[] { AppRoles.Member }, await users.GetRolesAsync(persisted));
    }

    [Fact]
    public async Task Register_RejectsRoleSpoof_WithoutCreatingAnAdmin()
    {
        var email = UniqueEmail();
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = FlowOpsApiFactory.TestPassword,
            displayName = "Spoofed admin",
            role = AppRoles.Admin
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertSafeProblemAsync(response);
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Null(await users.FindByEmailAsync(email));
    }

    [Fact]
    public async Task Register_RejectsDuplicateEmailCaseInsensitively()
    {
        var email = UniqueEmail();
        await _factory.SeedUserAsync(email: email);
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = email.ToUpperInvariant(),
            password = FlowOpsApiFactory.TestPassword,
            displayName = "Duplicate"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertSafeProblemAsync(response);
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Single(users.Users.Where(user => user.NormalizedEmail == email.ToUpperInvariant()));
    }

    [Theory]
    [InlineData("weak")]
    [InlineData("NoDigitsHere")]
    [InlineData("lowercase123")]
    [InlineData("UPPERCASE123")]
    public async Task Register_RejectsPasswordsOutsideIdentityPolicy(string password)
    {
        var email = UniqueEmail();
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password,
            displayName = "Invalid password"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertSafeProblemAsync(response);
        using var scope = _factory.Services.CreateScope();
        Assert.Null(await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().FindByEmailAsync(email));
    }

    [Fact]
    public async Task LoginAndMe_ReturnSafeIdentityAndRole()
    {
        var user = await _factory.SeedUserAsync(AppRoles.Admin, displayName: "Test administrator");
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = user.Email!.ToUpperInvariant(),
            password = FlowOpsApiFactory.TestPassword
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await ReadSafeAuthAsync(response);
        Assert.Equal(user.Id, auth.User.Id);
        Assert.Equal(new[] { AppRoles.Admin }, auth.User.Roles);

        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        using var meResponse = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, meResponse.StatusCode);
        using var json = await ReadJsonAsync(meResponse);
        AssertSafeUser(json.RootElement);
        var me = (await meResponse.Content.ReadFromJsonAsync<AuthUserResponse>())!;
        Assert.Equal(auth.User.Id, me.Id);
        Assert.Equal(auth.User.Email, me.Email);
        Assert.Equal(auth.User.DisplayName, me.DisplayName);
        Assert.Equal(auth.User.Roles, me.Roles);
    }

    [Fact]
    public async Task Login_WrongPasswordAndUnknownAccount_HaveIdenticalGenericFailures()
    {
        var user = await _factory.SeedUserAsync();
        using var wrongPassword = await _factory.Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = user.Email,
            password = "WrongPass456"
        });
        using var unknownAccount = await _factory.Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = UniqueEmail(),
            password = "WrongPass456"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownAccount.StatusCode);
        using var wrongJson = await ReadJsonAsync(wrongPassword);
        using var unknownJson = await ReadJsonAsync(unknownAccount);
        Assert.Equal("Invalid email or password.", wrongJson.RootElement.GetProperty("detail").GetString());
        Assert.Equal(wrongJson.RootElement.GetProperty("detail").GetString(), unknownJson.RootElement.GetProperty("detail").GetString());
        await AssertSafeProblemAsync(wrongPassword);
        await AssertSafeProblemAsync(unknownAccount);
    }

    [Fact]
    public async Task Login_RepeatedFailuresLockAccount_AndRemainGeneric()
    {
        var user = await _factory.SeedUserAsync();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            using var failure = await _factory.Client.PostAsJsonAsync("/api/v1/auth/login", new
            {
                email = user.Email,
                password = "WrongPass456"
            });
            Assert.Equal(HttpStatusCode.Unauthorized, failure.StatusCode);
        }

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var persisted = (await users.FindByIdAsync(user.Id.ToString()))!;
        Assert.True(await users.IsLockedOutAsync(persisted));
        using var correctPassword = await _factory.Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = user.Email,
            password = FlowOpsApiFactory.TestPassword
        });
        Assert.Equal(HttpStatusCode.Unauthorized, correctPassword.StatusCode);
        using var json = await ReadJsonAsync(correctPassword);
        Assert.Equal("Invalid email or password.", json.RootElement.GetProperty("detail").GetString());
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("malformed")]
    [InlineData("expired")]
    [InlineData("wrong-issuer")]
    [InlineData("wrong-audience")]
    [InlineData("wrong-signature")]
    public async Task MeAndDirectory_RejectInvalidAuthentication(string tokenKind)
    {
        var user = await _factory.SeedUserAsync();
        using var client = _factory.CreateClient();
        if (tokenKind != "missing")
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
                tokenKind == "malformed" ? "not-a-jwt" : CreateToken(user.Id, tokenKind));
        }

        using var me = await client.GetAsync("/api/v1/auth/me");
        using var directory = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, directory.StatusCode);
    }

    [Fact]
    public async Task Directory_ExposesOnlyActiveUsersAndSafeAssignmentFields()
    {
        var visible = await _factory.SeedUserAsync(displayName: "Visible member");
        var hidden = await _factory.SeedUserAsync(displayName: "Inactive member", isActive: false);
        using var client = await _factory.CreateAuthenticatedClientAsync(visible);
        using var response = await client.GetAsync("/api/v1/users");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await ReadJsonAsync(response);
        var rows = json.RootElement.EnumerateArray().ToArray();
        Assert.Contains(rows, row => row.GetProperty("id").GetGuid() == visible.Id);
        Assert.DoesNotContain(rows, row => row.GetProperty("id").GetGuid() == hidden.Id);
        foreach (var row in rows)
        {
            Assert.Equal(new[] { "displayName", "id" }, row.EnumerateObject().Select(property => property.Name).Order());
            Assert.False(string.IsNullOrWhiteSpace(row.GetProperty("displayName").GetString()));
        }
    }

    [Fact]
    public async Task Login_InactiveAccount_ReturnsGenericFailure()
    {
        var user = await _factory.SeedUserAsync(isActive: false);
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = user.Email,
            password = FlowOpsApiFactory.TestPassword
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var json = await ReadJsonAsync(response);
        Assert.Equal("Invalid email or password.", json.RootElement.GetProperty("detail").GetString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    public void Startup_RejectsMissingOrWeakJwtSigningKey(string signingKey)
    {
        using var invalidFactory = _factory.WithWebHostBuilder(builder => builder.UseSetting("Jwt:SigningKey", signingKey));
        var failure = Assert.ThrowsAny<Exception>(() => invalidFactory.CreateClient());
        Assert.Contains("signing", failure.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("Production", "complete")]
    [InlineData("Development", "email")]
    [InlineData("Development", "password")]
    [InlineData("Development", "displayName")]
    public async Task AdminBootstrap_ProductionOrIncompleteConfiguration_DoesNotCreateUser(string environment, string missing)
    {
        var email = UniqueEmail();
        var settings = BootstrapSettings(email);
        if (missing != "complete")
            settings[$"FLOWOPS_SEED_ADMIN_{(missing == "displayName" ? "DISPLAY_NAME" : missing.ToUpperInvariant())}"] = " ";

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await DevelopmentAdminBootstrap.SeedAsync(new TestHostEnvironment(environment),
            new ConfigurationBuilder().AddInMemoryCollection(settings).Build(), users,
            scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>(),
            scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>());

        Assert.Null(await users.FindByEmailAsync(email));
    }

    [Fact]
    public async Task AdminBootstrap_DevelopmentCredentials_CreateAdminIdempotently()
    {
        var email = UniqueEmail();
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var dbContext = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var settings = new ConfigurationBuilder().AddInMemoryCollection(BootstrapSettings(email)).Build();

        await DevelopmentAdminBootstrap.SeedAsync(new TestHostEnvironment("Development"), settings, users, roles, dbContext);
        var created = (await users.FindByEmailAsync(email))!;
        Assert.Equal("Bootstrap administrator", created.DisplayName);
        Assert.Equal(new[] { AppRoles.Admin }, await users.GetRolesAsync(created));
        Assert.True(await users.CheckPasswordAsync(created, FlowOpsApiFactory.TestPassword));

        await DevelopmentAdminBootstrap.SeedAsync(new TestHostEnvironment("Development"), settings, users, roles, dbContext);
        Assert.Equal(created.Id, (await users.FindByEmailAsync(email))!.Id);
        Assert.Single(users.Users.Where(user => user.NormalizedEmail == email.ToUpperInvariant()));
    }

    [Fact]
    public async Task AdminBootstrap_ExistingMember_IsNotPromoted()
    {
        var member = await _factory.SeedUserAsync();
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await Assert.ThrowsAsync<InvalidOperationException>(() => DevelopmentAdminBootstrap.SeedAsync(
            new TestHostEnvironment("Development"),
            new ConfigurationBuilder().AddInMemoryCollection(BootstrapSettings(member.Email!)).Build(), users,
            scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>(),
            scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>()));

        Assert.Equal(new[] { AppRoles.Member }, await users.GetRolesAsync((await users.FindByIdAsync(member.Id.ToString()))!));
    }

    private static async Task<AuthResponse> ReadSafeAuthAsync(HttpResponseMessage response)
    {
        using var json = await ReadJsonAsync(response);
        Assert.Equal(new[] { "accessToken", "expiresAtUtc", "user" },
            json.RootElement.EnumerateObject().Select(property => property.Name).Order());
        AssertSafeUser(json.RootElement.GetProperty("user"));
        var result = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.False(string.IsNullOrWhiteSpace(result.AccessToken));
        return result;
    }

    private static void AssertSafeUser(JsonElement user) =>
        Assert.Equal(new[] { "displayName", "email", "id", "roles" }, user.EnumerateObject().Select(property => property.Name).Order());

    private static async Task AssertSafeProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("passwordHash", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("stackTrace", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(FlowOpsApiFactory.TestPassword, text, StringComparison.Ordinal);
    }

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private static string UniqueEmail() => $"auth-{Guid.NewGuid():N}@example.test";

    private static Dictionary<string, string?> BootstrapSettings(string email) => new()
    {
        ["FLOWOPS_SEED_ADMIN_EMAIL"] = email,
        ["FLOWOPS_SEED_ADMIN_PASSWORD"] = FlowOpsApiFactory.TestPassword,
        ["FLOWOPS_SEED_ADMIN_DISPLAY_NAME"] = "Bootstrap administrator"
    };

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "FlowOps.IntegrationTests";
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static string CreateToken(Guid userId, string tokenKind)
    {
        var now = DateTime.UtcNow;
        var signingKey = tokenKind == "wrong-signature"
            ? "FAKE-OTHER-INTEGRATION-TEST-KEY-DO-NOT-USE-1234567890"
            : FlowOpsApiFactory.TestSigningKey;
        var token = new JwtSecurityToken(
            issuer: tokenKind == "wrong-issuer" ? "other-issuer" : FlowOpsApiFactory.TestIssuer,
            audience: tokenKind == "wrong-audience" ? "other-audience" : FlowOpsApiFactory.TestAudience,
            claims: new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new Claim("name", "Invalid token test"),
                new Claim("role", AppRoles.Member)
            },
            notBefore: now.AddMinutes(-10),
            expires: tokenKind == "expired" ? now.AddMinutes(-5) : now.AddMinutes(5),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
