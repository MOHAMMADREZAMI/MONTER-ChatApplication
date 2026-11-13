using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Monter___Rebulid_Edition_Update__.Data;
using Monter___Rebulid_Edition_Update__.Hubs;
using Monter___Rebulid_Edition_Update__.Models;
using Monter___Rebulid_Edition_Update__.Services.Auth;
using Monter___Rebulid_Edition_Update__.Services.Message;
using Monter___Rebulid_Edition_Update__.Services.MyProfile;
using Monter___Rebulid_Edition_Update__.Services.Search;

var builder = WebApplication.CreateBuilder(args);

//add scope
builder.Services.AddScoped<SignUp>();
builder.Services.AddScoped<Login>();
builder.Services.AddScoped<Search>();
builder.Services.AddScoped<Messager>();
builder.Services.AddScoped<MyProfile>();
builder.Services.AddScoped<Group>();


// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();


//Database
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(
    builder.Configuration.GetConnectionString("DefaultConnection")));


//jwt

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme =
        JwtBearerDefaults.AuthenticationScheme;

    options.DefaultChallengeScheme =
        JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    // JWT Validation
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = false,
        ValidateIssuerSigningKey = true,

        ValidIssuer = "Monter",
        ValidAudience = "MonterClient",

        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes("SD123nsdpppaakdo1kd;1kso2kflapsdk")
        ),

        ClockSkew = TimeSpan.Zero
    };

    // SignalR JWT Support
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];

            var path = context.HttpContext.Request.Path;

            if (!string.IsNullOrEmpty(accessToken) &&
                path.StartsWithSegments("/chathub"))
                path.StartsWithSegments("/profilehub");
            path.StartsWithSegments("/grouphub");
                
            {
                context.Token = accessToken;
            }

            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// Swagger JWT Configuration
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter your JWT token"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});


//signalR
builder.Services.AddSignalR();

builder.Services.AddSignalR(hubOptions =>
{
    hubOptions.EnableDetailedErrors = true;
    hubOptions.MaximumReceiveMessageSize = 15 * 1024 * 1024;
});


var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapSwagger();
    app.UseSwaggerUI();
}

app.MapHub<ChatHub>("/chathub");
app.MapHub<ProfileHub>("/profilehub");
app.MapHub<GroupHub>("/grouphub");

app.UseHttpsRedirection();

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
