import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  createStaffUserSchema,
  roleUpsertSchema,
  setUserRolesSchema,
  userListQuerySchema,
} from '@mzn/shared';
import { CurrentActor, RequirePermissions } from '../../common/decorators';
import type { Actor } from '../../common/request-context';
import { ApiZodBody, ApiZodQuery, ZodBody, ZodQuery } from '../../common/zod';
import { AdminService } from './admin.service';

const statusSchema = z.object({
  disabled: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});
const mfaResetSchema = z.object({ identityCheckReference: z.string().trim().min(3).max(100) });

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @RequirePermissions(PERMISSIONS.USER_READ)
  @Get('users')
  @ApiZodQuery(userListQuerySchema)
  listUsers(@ZodQuery(userListQuerySchema) q: z.infer<typeof userListQuerySchema>) {
    return this.admin.listUsers(q);
  }

  @RequirePermissions(PERMISSIONS.USER_READ)
  @Get('users/:id')
  getUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.getUser(id);
  }

  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @Post('users')
  @ApiZodBody(createStaffUserSchema)
  createUser(
    @CurrentActor() actor: Actor,
    @ZodBody(createStaffUserSchema) body: z.infer<typeof createStaffUserSchema>,
  ) {
    return this.admin.createStaffUser(actor, body);
  }

  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @Put('users/:id/roles')
  @ApiZodBody(setUserRolesSchema)
  setRoles(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(setUserRolesSchema) body: z.infer<typeof setUserRolesSchema>,
  ) {
    return this.admin.setUserRoles(actor, id, body.roleKeys);
  }

  @RequirePermissions(PERMISSIONS.USER_DISABLE)
  @Patch('users/:id/status')
  @ApiZodBody(statusSchema)
  setStatus(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(statusSchema) body: z.infer<typeof statusSchema>,
  ) {
    return this.admin.setUserStatus(actor, id, body.disabled, body.reason);
  }

  @RequirePermissions(PERMISSIONS.MFA_RESET)
  @Post('users/:id/mfa-reset')
  @HttpCode(204)
  @ApiZodBody(mfaResetSchema)
  async resetMfa(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(mfaResetSchema) body: z.infer<typeof mfaResetSchema>,
  ) {
    await this.admin.resetMfa(actor, id, body.identityCheckReference);
  }

  @RequirePermissions(PERMISSIONS.USER_WRITE)
  @Post('users/:id/unlock')
  @HttpCode(204)
  async unlock(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.admin.unlock(id);
  }

  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @Get('roles')
  listRoles() {
    return this.admin.listRoles();
  }

  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @Get('permissions')
  listPermissions() {
    return { items: [...ALL_PERMISSIONS].sort() };
  }

  @RequirePermissions(PERMISSIONS.ROLE_WRITE)
  @Post('roles')
  @ApiZodBody(roleUpsertSchema)
  createRole(
    @CurrentActor() actor: Actor,
    @ZodBody(roleUpsertSchema) body: z.infer<typeof roleUpsertSchema>,
  ) {
    return this.admin.upsertRole(actor, body);
  }

  @RequirePermissions(PERMISSIONS.ROLE_WRITE)
  @Put('roles/:key')
  @ApiZodBody(roleUpsertSchema)
  updateRole(
    @CurrentActor() actor: Actor,
    @Param('key') key: string,
    @ZodBody(roleUpsertSchema) body: z.infer<typeof roleUpsertSchema>,
  ) {
    return this.admin.upsertRole(actor, body, key);
  }

  @RequirePermissions(PERMISSIONS.ROLE_WRITE)
  @Delete('roles/:key')
  @HttpCode(204)
  async deleteRole(@CurrentActor() actor: Actor, @Param('key') key: string) {
    await this.admin.deleteRole(actor, key);
  }
}
