import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  changePasswordSchema,
  emailOtpLoginSchema,
  emailOtpRequestSchema,
  emailVerifySchema,
  localeSchema,
  loginSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  otpCodeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  type LoginResult,
  type MeResponse,
} from '@mzn/shared';
import { env } from '../../config/env';
import { Authenticated, CurrentActor, Public } from '../../common/decorators';
import type { Actor } from '../../common/request-context';
import { ApiZodBody, ZodBody } from '../../common/zod';
import { AuthService, type ClientInfo } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './cookies';
import { SessionService } from './session.service';

function client(req: Request): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

const disableMfaSchema = z.object({ password: z.string().min(1).max(128), code: otpCodeSchema });
const codeOnlySchema = z.object({ code: otpCodeSchema });
const localeBodySchema = z.object({ locale: localeSchema });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Get('policies')
  policies() {
    const e = env();
    return { privacyNoticeVersion: e.PRIVACY_NOTICE_VERSION, termsVersion: e.TERMS_VERSION };
  }

  @Public()
  @Post('register')
  @HttpCode(202)
  @ApiZodBody(registerSchema)
  async register(
    @ZodBody(registerSchema) body: z.infer<typeof registerSchema>,
    @Req() req: Request,
  ) {
    await this.auth.register(body, client(req));
    return { status: 'verification_sent' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @ApiZodBody(emailVerifySchema)
  async verifyEmail(@ZodBody(emailVerifySchema) body: z.infer<typeof emailVerifySchema>) {
    await this.auth.verifyEmail(body.token);
    return { status: 'verified' };
  }

  @Public()
  @Post('verify-email/resend')
  @HttpCode(202)
  @ApiZodBody(passwordResetRequestSchema)
  async resend(@ZodBody(passwordResetRequestSchema) body: { email: string }, @Req() req: Request) {
    await this.auth.resendVerification(body.email, client(req));
    return { status: 'accepted' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(
    @ZodBody(loginSchema) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const { result, session } = await this.auth.login(body.email, body.password, client(req));
    if (session) setSessionCookie(res, session);
    return result;
  }

  @Public()
  @Post('email-otp/request')
  @HttpCode(202)
  @ApiZodBody(emailOtpRequestSchema)
  async requestEmailOtp(
    @ZodBody(emailOtpRequestSchema) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.requestEmailOtp(body.email, client(req));
    return { status: 'accepted' };
  }

  @Public()
  @Post('email-otp/verify')
  @HttpCode(200)
  @ApiZodBody(emailOtpLoginSchema)
  async emailOtpLogin(
    @ZodBody(emailOtpLoginSchema) body: z.infer<typeof emailOtpLoginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const { result, session } = await this.auth.loginWithEmailOtp(
      body.email,
      body.code,
      client(req),
    );
    if (session) setSessionCookie(res, session);
    return result;
  }

  @Authenticated({ allowPendingMfa: true })
  @Get('me')
  me(@CurrentActor() actor: Actor): Promise<MeResponse> {
    return this.auth.me(actor.userId, actor);
  }

  @Authenticated({ allowPendingMfa: true })
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiZodBody(mfaVerifySchema)
  async verifyMfa(
    @CurrentActor() actor: Actor,
    @ZodBody(mfaVerifySchema) body: z.infer<typeof mfaVerifySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const { me, session } = await this.auth.verifyMfa(actor, body);
    setSessionCookie(res, session);
    return { status: 'ok', me };
  }

  @Authenticated({ allowPendingMfa: true })
  @Post('mfa/setup')
  @HttpCode(200)
  setupMfa(@CurrentActor() actor: Actor) {
    return this.auth.beginMfaSetup(actor);
  }

  @Authenticated({ allowPendingMfa: true })
  @Post('mfa/enable')
  @HttpCode(200)
  @ApiZodBody(mfaEnableSchema)
  async enableMfa(
    @CurrentActor() actor: Actor,
    @ZodBody(mfaEnableSchema) body: { code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { recoveryCodes, me, session } = await this.auth.enableMfa(actor, body.code);
    setSessionCookie(res, session);
    return { recoveryCodes, me };
  }

  @Authenticated()
  @Post('mfa/disable')
  @HttpCode(204)
  @ApiZodBody(disableMfaSchema)
  async disableMfa(
    @CurrentActor() actor: Actor,
    @ZodBody(disableMfaSchema) body: z.infer<typeof disableMfaSchema>,
  ) {
    await this.auth.disableMfa(actor, body.password, body.code);
  }

  @Authenticated()
  @Post('mfa/recovery-codes')
  @HttpCode(200)
  @ApiZodBody(codeOnlySchema)
  async recoveryCodes(
    @CurrentActor() actor: Actor,
    @ZodBody(codeOnlySchema) body: { code: string },
  ) {
    return { recoveryCodes: await this.auth.regenerateRecoveryCodes(actor, body.code) };
  }

  @Public()
  @Post('password/reset-request')
  @HttpCode(202)
  @ApiZodBody(passwordResetRequestSchema)
  async resetRequest(
    @ZodBody(passwordResetRequestSchema) body: { email: string },
    @Req() req: Request,
  ) {
    await this.auth.requestPasswordReset(body.email, client(req));
    return { status: 'accepted' };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  @ApiZodBody(passwordResetConfirmSchema)
  async reset(
    @ZodBody(passwordResetConfirmSchema) body: z.infer<typeof passwordResetConfirmSchema>,
  ) {
    await this.auth.confirmPasswordReset(body.token, body.password);
    return { status: 'password_reset' };
  }

  @Authenticated()
  @Post('password/change')
  @HttpCode(204)
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentActor() actor: Actor,
    @ZodBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>,
  ) {
    await this.auth.changePassword(actor, body.currentPassword, body.newPassword);
  }

  @Authenticated({ allowPendingMfa: true })
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor);
    clearSessionCookie(res);
  }

  @Authenticated()
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    const revoked = await this.auth.logoutEverywhere(actor);
    clearSessionCookie(res);
    return { revoked };
  }

  @Authenticated()
  @Get('sessions')
  async listSessions(@CurrentActor() actor: Actor) {
    const items = await this.sessions.list(actor.userId);
    return { items: items.map((s) => ({ ...s, current: s.id === actor.sessionId })) };
  }

  @Authenticated()
  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentActor() actor: Actor, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.auth.revokeSession(actor, id);
  }

  @Authenticated({ allowPendingMfa: true })
  @Post('locale')
  @HttpCode(204)
  @ApiZodBody(localeBodySchema)
  async setLocale(
    @CurrentActor() actor: Actor,
    @ZodBody(localeBodySchema) body: z.infer<typeof localeBodySchema>,
  ) {
    await this.auth.setLocale(actor, body.locale);
  }
}
