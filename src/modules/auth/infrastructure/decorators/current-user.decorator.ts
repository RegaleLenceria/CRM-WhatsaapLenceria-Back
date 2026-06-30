// src/modules/auth/infrastructure/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const contextType = ctx.getType();

    if (contextType === 'http') {
      const request = ctx.switchToHttp().getRequest();
      return request.user;
    } else if (contextType === 'ws') {
      const client = ctx.switchToWs().getClient();
      return client.user;
    }

    return null;
  },
);
