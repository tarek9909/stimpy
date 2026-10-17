import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Banner, Button, FormField, Input, Logo } from '@stimpy/ui';
import { api, unwrap } from '../api/client';
import { asApiError } from '../api/errors';
import { getEnv } from '../env';
import { postAuthEvent, subscribeAuthEvents } from './broadcast';
import { resetSessionExpiry } from './expiry';
import { validateReturnTo } from './returnTo';
import { sessionQueryOptions, setSession } from './session';
import { takePendingLoginState, type LoginLocationState } from './sessionFlow';
import { Splash } from './RequireAuth';
import { queryKeys } from '../api/queryKeys';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address.'),
  // The password is never trimmed or length-limited on the client.
  password: z.string().min(1, 'Enter your password.'),
});
type LoginValues = z.infer<typeof schema>;

/** `0:42` */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const FALLBACK_RETRY_SECONDS = 30;

type LoginError =
  | { kind: 'credentials' }
  | { kind: 'rate-limited' }
  | { kind: 'origin' }
  | { kind: 'network' }
  | { kind: 'server'; reference: string | null }
  | null;

/** Seconds left until `deadline` (epoch ms), recomputed from the clock every 250 ms so tab throttling cannot stretch it. */
function useSecondsUntil(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function bannerFor(state: LoginLocationState | null): string[] {
  switch (state?.reason) {
    case 'expired':
      return ['Your session ended. Please log in again.', ...(state.lastChangeLost ? ["Your last change wasn't saved. Please check and save again."] : [])];
    case 'logout':
      return ["You're logged out."];
    case 'other-tab':
      return ['You were logged out in another tab.'];
    default:
      return [];
  }
}

/** The address to open instead when the host is wrong (127.0.0.1, an IP not in ADMIN_URL). */
function suggestedAddress(): string {
  const { protocol, port } = window.location;
  return `${protocol}//localhost${port ? `:${port}` : ''}`;
}

/** Dev only: the cookie is host-only, so the dashboard must be opened on `localhost` (or the API's host). */
export function isWrongDevHost(hostname: string, apiOrigin: string): boolean {
  if (hostname === 'localhost') return false;
  try {
    return hostname !== new URL(apiOrigin).hostname;
  } catch {
    return true;
  }
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const returnTo = validateReturnTo(searchParams.get('returnTo'));
  const [pendingState] = useState(() => takePendingLoginState());
  const routeState = (location.state as LoginLocationState | null) ?? pendingState;

  const session = useQuery(sessionQueryOptions);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<LoginError>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const secondsLeft = useSecondsUntil(deadline);
  const submitting = useRef(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const { errors, isSubmitting } = form.formState;

  // The countdown ended: clear the message and re-enable the button.
  useEffect(() => {
    if (deadline !== null && secondsLeft === 0) {
      setDeadline(null);
      setError((e) => (e?.kind === 'rate-limited' ? null : e));
    }
  }, [deadline, secondsLeft]);

  // Another tab logged in: pick up the session and leave this page.
  useEffect(
    () =>
      subscribeAuthEvents((type) => {
        if (type === 'login') void queryClient.refetchQueries({ queryKey: queryKeys.session });
      }),
    [queryClient],
  );

  // A revealed password is never left on screen when the tab is hidden.
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') setShowPassword(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  if (import.meta.env.DEV && isWrongDevHost(window.location.hostname, getEnv().apiOrigin)) {
    const url = suggestedAddress();
    return (
      <main className="flex min-h-dvh items-center justify-center bg-cream px-4">
        <div className="max-w-md rounded-lg border border-base bg-surface-base p-6">
          <h1 className="text-h3">Open the dashboard on localhost</h1>
          <p className="mt-2 text-body">
            Open the dashboard at <a className="underline underline-offset-4" href={url}>{url}</a>. Other addresses can&apos;t keep you logged in.
          </p>
        </div>
      </main>
    );
  }

  if (session.isPending) return <Splash />;
  if (session.data) return <Navigate to={returnTo} replace />;

  const rateLimited = deadline !== null && secondsLeft > 0;

  const submit = form.handleSubmit(
    async (values) => {
      if (submitting.current || rateLimited) return;
      submitting.current = true;
      setError(null);
      setShowPassword(false);
      try {
        const data = await unwrap(api.POST('/api/v1/auth/login', { body: { email: values.email, password: values.password } }));
        resetSessionExpiry();
        // A different person may be logging in: nothing from the last session stays in memory.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
        setSession(queryClient, { user: data.user, expiresAt: null });
        postAuthEvent('login');
        navigate(returnTo, { replace: true });
        // Learn the real expiry in the background.
        void queryClient.refetchQueries({ queryKey: queryKeys.session });
      } catch (e) {
        const err = asApiError(e);
        // Clear the password, keep the e-mail, focus the password field (1.3).
        form.setValue('password', '');
        if (err?.code === 'UNAUTHENTICATED') {
          setError({ kind: 'credentials' });
          form.setFocus('password');
        } else if (err?.code === 'RATE_LIMITED') {
          setError({ kind: 'rate-limited' });
          setDeadline(Date.now() + (err.retryAfterSeconds ?? FALLBACK_RETRY_SECONDS) * 1000);
        } else if (err?.code === 'VALIDATION_ERROR' && err.fields) {
          for (const [field, message] of Object.entries(err.fields)) {
            if (field === 'email' || field === 'password') form.setError(field, { type: 'server', message });
          }
          form.setFocus(err.fields.email ? 'email' : 'password');
        } else if (err?.code === 'FORBIDDEN') {
          setError({ kind: 'origin' });
        } else if (err && (err.isTransport || err.status === 0)) {
          setError({ kind: 'network' });
        } else {
          setError({ kind: 'server', reference: err?.reference ?? null });
        }
      } finally {
        submitting.current = false;
      }
    },
    () => {
      // client validation failed: focus the first invalid field
      const first = (['email', 'password'] as const).find((k) => errors[k]) ?? 'email';
      form.setFocus(first);
    },
  );

  const messages = bannerFor(routeState);
  const pwdReg = form.register('password');

  return (
    <main className="admin-login flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="rounded-lg border border-base bg-surface-base p-6 md:p-8">
          <div className="mb-8 flex">
            <Logo variant="full" surface="white" width={112} clearSpace={false} />
          </div>
          <h1 className="mb-6 text-h3">Log in to Stimpy</h1>

          {messages.length > 0 ? (
            <Banner variant="info" live className="mb-4">
              {messages.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </Banner>
          ) : null}

          {error ? (
            <div role="alert" className="mb-4 rounded-lg border-2 border-danger p-3 text-body-sm" data-testid="login-error">
              {error.kind === 'credentials' ? <p className="font-medium">Email or password is incorrect.</p> : null}
              {error.kind === 'rate-limited' ? <p className="font-medium tabular-nums">Too many attempts. Try again in {formatCountdown(secondsLeft)}.</p> : null}
              {error.kind === 'origin' ? <p className="font-medium">This address isn&apos;t allowed. Open the dashboard at {suggestedAddress()}.</p> : null}
              {error.kind === 'network' ? <p className="font-medium">Can&apos;t reach the server. Check that the API is running.</p> : null}
              {error.kind === 'server' ? (
                <>
                  <p className="font-medium">Something went wrong on our side. Try again.</p>
                  {error.reference ? <p className="mt-1 text-caption text-fg-muted">Reference: {error.reference}</p> : null}
                </>
              ) : null}
            </div>
          ) : null}

          <form
            name="login"
            method="post"
            noValidate
            onSubmit={(e) => {
              void submit(e);
            }}
            className="flex flex-col gap-4"
          >
            <FormField label="Email" name="email" error={errors.email?.message ?? null}>
              {(a11y) => (
                <Input
                  {...a11y}
                  {...form.register('email')}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="you@example.com"
                  invalid={!!errors.email}
                />
              )}
            </FormField>

            <FormField label="Password" name="password" error={errors.password?.message ?? null}>
              {(a11y) => (
                <div className="relative">
                  <Input
                    {...a11y}
                    {...pwdReg}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    invalid={!!errors.password}
                    className="pr-12"
                  />
                  <button
                    type="button"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-md text-fg-muted hover:text-fg"
                  >
                    {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                  </button>
                </div>
              )}
            </FormField>

            <Button type="submit" variant="primary" fullWidth loading={isSubmitting} disabled={rateLimited}>
              {rateLimited ? `Try again in ${formatCountdown(secondsLeft)}` : isSubmitting ? 'Logging in...' : 'Log in'}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-body-sm text-fg-muted">Access is by invitation only.</p>
      </div>
    </main>
  );
}
