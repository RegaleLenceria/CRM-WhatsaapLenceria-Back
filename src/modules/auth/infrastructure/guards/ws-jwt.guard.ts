// src/modules/auth/infrastructure/guards/ws-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient();
      const authHeader = client.handshake?.headers?.authorization;
      const queryToken = client.handshake?.query?.token;

      let token: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else if (authHeader) {
        token = authHeader;
      } else if (queryToken) {
        token = typeof queryToken === 'string' ? queryToken : queryToken[0];
      }

      if (!token) {
        return false;
      }

      const payload = await this.jwtService.verifyAsync(token);
      client.user = payload;
      return true;
    } catch (err) {
      return false;
    }
  }
}
