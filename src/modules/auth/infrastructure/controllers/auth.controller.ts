import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import * as bcrypt from 'bcrypt';

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
    const { email, password } = body;
    
    if (!email || !password) {
      throw new UnauthorizedException('Por favor envíe email y contraseña');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      email: user.email,
      sub: user.id,
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { name: user.name },
    };
    const token = this.jwtService.sign(payload);
    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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
    
    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(password || 'default', salt);

    const user = this.userRepository.create({
      name,
      email,
      passwordHash: hash,
      role: role || 'asesora',
      status: status || 'online',
    });
    return this.userRepository.save(user);
  }
}
