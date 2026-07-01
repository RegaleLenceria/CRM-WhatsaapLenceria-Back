import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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

  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getUsers() {
    return this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Post('users')
  @UseGuards(JwtAuthGuard)
  async createUser(@Body() body: any) {
    const { name, email, password, role, status } = body;
    const user = this.userRepository.create({
      name,
      email,
      passwordHash: password || 'default',
      role: role || 'asesora',
      status: status || 'online',
    });
    return this.userRepository.save(user);
  }
}
