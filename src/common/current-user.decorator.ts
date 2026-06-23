import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Principal } from './principal';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as Principal;
});
