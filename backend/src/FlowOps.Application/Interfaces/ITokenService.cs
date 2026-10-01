using FlowOps.Application.DTOs;

namespace FlowOps.Application.Interfaces;

public interface ITokenService
{
    AuthResponse CreateToken(AuthUserResponse user);
}
