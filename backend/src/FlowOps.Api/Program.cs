using FlowOps.Application.Interfaces;
using FlowOps.Application.Services;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("Connection string 'DefaultConnection' was not found or is empty.");
}

builder.Services.AddDbContext<FlowOpsDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<IFlowOpsDbContext>(provider =>
    provider.GetRequiredService<FlowOpsDbContext>());

builder.Services.AddScoped<IWorkItemService, WorkItemService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "FlowOps API",
        Version = "v1",
        Description = "Portfolio-grade full-stack workflow management platform REST API."
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "FlowOps API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
