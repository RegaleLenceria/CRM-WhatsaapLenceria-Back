import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private readonly jwtService: JwtService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any) {
    const { email } = body;
    const prefix = email ? email.split('@')[0] : 'usuario';
    const name = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    const role = email && email.includes('admin') ? 'Administradora' : 'Agente de Ventas';

    const payload = {
      email,
      sub: '00000000-0000-0000-0000-000000000000',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { name },
    };
    const token = this.jwtService.sign(payload);
    return {
      access_token: token,
      user: {
        email,
        name,
        role,
      },
    };
  }
}
