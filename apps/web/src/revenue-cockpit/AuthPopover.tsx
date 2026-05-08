import { useEffect, useRef, useState } from 'react';
import { Icon } from './revenueCockpitShared';
import {
  CognitoAuthError,
  cognitoConfirmForgotPassword,
  cognitoConfirmSignUp,
  cognitoForgotPassword,
  cognitoResendSignUpCode,
  cognitoSignIn,
  cognitoSignUp,
  startCognitoLogin,
} from './revenueCockpitAuth';
import type { RcLang } from './revenueCockpitTypes';

type AuthMode = 'signIn' | 'signUp' | 'confirmSignUp' | 'forgotPassword' | 'confirmResetPassword';

interface AuthPopoverProps {
  lang: RcLang;
  onClose: () => void;
  onAuthenticated: () => void;
}

interface CopyMap {
  signInTitle: string;
  signInSubtitle: string;
  signUpTitle: string;
  signUpSubtitle: string;
  confirmSignUpTitle: string;
  confirmSignUpSubtitle: string;
  forgotPasswordTitle: string;
  forgotPasswordSubtitle: string;
  confirmResetPasswordTitle: string;
  confirmResetPasswordSubtitle: string;
  email: string;
  password: string;
  confirmPassword: string;
  code: string;
  newPassword: string;
  signInAction: string;
  signUpAction: string;
  confirmCodeAction: string;
  resendCodeAction: string;
  forgotPasswordAction: string;
  sendResetCodeAction: string;
  confirmResetAction: string;
  switchToSignIn: string;
  switchToSignUp: string;
  switchToForgot: string;
  switchToVerify: string;
  fallbackToHostedUi: string;
  passwordsMismatch: string;
  passwordTooShort: string;
  emailRequired: string;
  codeRequired: string;
  codeSent: string;
  signUpComplete: string;
  resetComplete: string;
  resentCode: string;
  loginIdHint: string;
  busy: string;
}

const COPY: Record<RcLang, CopyMap> = {
  ko: {
    signInTitle: '로그인',
    signInSubtitle: '등록한 이메일과 비밀번호로 로그인합니다.',
    signUpTitle: '계정 만들기',
    signUpSubtitle: '이메일과 비밀번호로 새 계정을 만듭니다. 이메일 인증이 필요합니다.',
    confirmSignUpTitle: '이메일 인증',
    confirmSignUpSubtitle: '이메일로 전송된 인증 코드를 입력해주세요.',
    forgotPasswordTitle: '비밀번호 찾기',
    forgotPasswordSubtitle: '계정 이메일을 입력하면 재설정 코드를 발송합니다.',
    confirmResetPasswordTitle: '새 비밀번호 설정',
    confirmResetPasswordSubtitle: '이메일로 받은 코드와 새 비밀번호를 입력해주세요.',
    email: '이메일',
    password: '비밀번호',
    confirmPassword: '비밀번호 확인',
    code: '인증 코드',
    newPassword: '새 비밀번호',
    signInAction: '로그인',
    signUpAction: '계정 만들기',
    confirmCodeAction: '인증 완료',
    resendCodeAction: '코드 다시 받기',
    forgotPasswordAction: '비밀번호 찾기',
    sendResetCodeAction: '재설정 코드 보내기',
    confirmResetAction: '비밀번호 변경',
    switchToSignIn: '이미 계정이 있어요',
    switchToSignUp: '계정 만들기',
    switchToForgot: '비밀번호를 잊으셨나요?',
    switchToVerify: '인증 코드 다시 입력',
    fallbackToHostedUi: 'Cognito Hosted UI로 로그인',
    passwordsMismatch: '비밀번호가 일치하지 않습니다.',
    passwordTooShort: '비밀번호는 12자 이상이며 대소문자/숫자/특수문자를 포함해야 합니다.',
    emailRequired: '이메일을 입력해주세요.',
    codeRequired: '인증 코드를 입력해주세요.',
    codeSent: '재설정 코드를 이메일로 발송했습니다.',
    signUpComplete: '이메일 인증이 완료되었습니다. 로그인해주세요.',
    resetComplete: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.',
    resentCode: '인증 코드를 다시 보냈습니다.',
    loginIdHint: '로그인 ID는 가입 시 등록한 이메일입니다.',
    busy: '처리 중...',
  },
  en: {
    signInTitle: 'Sign in',
    signInSubtitle: 'Sign in with your registered email and password.',
    signUpTitle: 'Create account',
    signUpSubtitle: 'Create a new account with email and password. Email verification is required.',
    confirmSignUpTitle: 'Verify email',
    confirmSignUpSubtitle: 'Enter the verification code that was sent to your email.',
    forgotPasswordTitle: 'Reset password',
    forgotPasswordSubtitle: 'Enter your account email and we will send a reset code.',
    confirmResetPasswordTitle: 'Set new password',
    confirmResetPasswordSubtitle: 'Enter the code from email and choose a new password.',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    code: 'Verification code',
    newPassword: 'New password',
    signInAction: 'Sign in',
    signUpAction: 'Create account',
    confirmCodeAction: 'Confirm',
    resendCodeAction: 'Resend code',
    forgotPasswordAction: 'Forgot password',
    sendResetCodeAction: 'Send reset code',
    confirmResetAction: 'Change password',
    switchToSignIn: 'I have an account',
    switchToSignUp: 'Create account',
    switchToForgot: 'Forgot password?',
    switchToVerify: 'Re-enter verification code',
    fallbackToHostedUi: 'Sign in via Cognito Hosted UI',
    passwordsMismatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be 12+ characters with upper, lower, digit, and symbol.',
    emailRequired: 'Email is required.',
    codeRequired: 'Verification code is required.',
    codeSent: 'A reset code was sent to your email.',
    signUpComplete: 'Email verified. You can sign in now.',
    resetComplete: 'Password updated. Sign in with the new password.',
    resentCode: 'Verification code resent.',
    loginIdHint: 'Your login ID is the email you registered with.',
    busy: 'Working...',
  },
};

function passwordIsValid(value: string): boolean {
  if (value.length < 12) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function describeError(error: unknown, lang: RcLang): string {
  if (error instanceof CognitoAuthError) {
    const ko = lang === 'ko';
    switch (error.code) {
      case 'NotAuthorizedException':
        return ko ? '이메일 또는 비밀번호가 올바르지 않습니다.' : 'Email or password is incorrect.';
      case 'UserNotFoundException':
        return ko ? '등록되지 않은 이메일입니다.' : 'No account exists for this email.';
      case 'UserNotConfirmedException':
        return ko ? '이메일 인증이 완료되지 않았습니다. 인증 코드를 확인해주세요.' : 'Email is not verified yet. Please confirm the code.';
      case 'CodeMismatchException':
        return ko ? '인증 코드가 일치하지 않습니다.' : 'The verification code is incorrect.';
      case 'ExpiredCodeException':
        return ko ? '인증 코드가 만료되었습니다. 다시 받아주세요.' : 'The verification code has expired. Please resend.';
      case 'InvalidPasswordException':
        return COPY[lang].passwordTooShort;
      case 'UsernameExistsException':
        return ko ? '이미 등록된 이메일입니다. 로그인해주세요.' : 'An account with this email already exists.';
      case 'LimitExceededException':
      case 'TooManyRequestsException':
        return ko ? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' : 'Too many requests. Please try again shortly.';
      case 'InvalidParameterException':
        return error.message;
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function AuthPopover({ lang, onClose, onAuthenticated }: AuthPopoverProps) {
  const copy = COPY[lang];
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  function resetMessages() { setError(null); setInfo(null); }

  function switchMode(next: AuthMode) {
    resetMessages();
    setCode('');
    setMode(next);
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!email.trim()) { setError(copy.emailRequired); return; }
    setBusy(true);
    try {
      await cognitoSignIn(email.trim(), password);
      onAuthenticated();
      onClose();
    } catch (err) {
      const friendly = describeError(err, lang);
      if (err instanceof CognitoAuthError && err.code === 'UserNotConfirmedException') {
        setMode('confirmSignUp');
      }
      setError(friendly);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!email.trim()) { setError(copy.emailRequired); return; }
    if (!passwordIsValid(password)) { setError(copy.passwordTooShort); return; }
    if (password !== confirmPassword) { setError(copy.passwordsMismatch); return; }
    setBusy(true);
    try {
      await cognitoSignUp(email.trim(), password);
      setInfo(copy.confirmSignUpSubtitle);
      setMode('confirmSignUp');
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSignUp(event: React.FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!code.trim()) { setError(copy.codeRequired); return; }
    setBusy(true);
    try {
      await cognitoConfirmSignUp(email.trim(), code.trim());
      setInfo(copy.signUpComplete);
      setCode('');
      setMode('signIn');
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendCode() {
    if (!email.trim()) { setError(copy.emailRequired); return; }
    resetMessages();
    setBusy(true);
    try {
      await cognitoResendSignUpCode(email.trim());
      setInfo(copy.resentCode);
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!email.trim()) { setError(copy.emailRequired); return; }
    setBusy(true);
    try {
      await cognitoForgotPassword(email.trim());
      setInfo(copy.codeSent);
      setCode('');
      setMode('confirmResetPassword');
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmResetPassword(event: React.FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!code.trim()) { setError(copy.codeRequired); return; }
    if (!passwordIsValid(newPassword)) { setError(copy.passwordTooShort); return; }
    if (newPassword !== confirmNewPassword) { setError(copy.passwordsMismatch); return; }
    setBusy(true);
    try {
      await cognitoConfirmForgotPassword(email.trim(), code.trim(), newPassword);
      setInfo(copy.resetComplete);
      setNewPassword('');
      setConfirmNewPassword('');
      setCode('');
      setMode('signIn');
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  function renderHeader(title: string, subtitle: string) {
    return (
      <div className="rc-auth-popover-head">
        <h2 className="rc-auth-popover-title">{title}</h2>
        <button type="button" className="rc-auth-popover-link" onClick={onClose} aria-label="Close">
          <Icon name="plus" size={14}/>
        </button>
      </div>
    );
  }

  function renderTabs() {
    if (mode !== 'signIn' && mode !== 'signUp') return null;
    return (
      <div className="rc-auth-popover-tabs">
        <button
          type="button"
          className={`rc-auth-popover-tab${mode === 'signIn' ? ' is-active' : ''}`}
          onClick={() => switchMode('signIn')}
        >
          {copy.signInAction}
        </button>
        <button
          type="button"
          className={`rc-auth-popover-tab${mode === 'signUp' ? ' is-active' : ''}`}
          onClick={() => switchMode('signUp')}
        >
          {copy.signUpAction}
        </button>
      </div>
    );
  }

  function renderMessages() {
    return (
      <>
        {error && <div className="rc-auth-popover-error">{error}</div>}
        {info && !error && <div className="rc-auth-popover-info">{info}</div>}
      </>
    );
  }

  return (
    <div ref={containerRef} className="rc-auth-popover" role="dialog" aria-modal="true">
      {mode === 'signIn' && (
        <>
          {renderHeader(copy.signInTitle, copy.signInSubtitle)}
          {renderTabs()}
          <p className="rc-auth-popover-subtitle">{copy.loginIdHint}</p>
          <form onSubmit={handleSignIn} className="rc-auth-popover-fields">
            <input
              ref={firstFieldRef}
              type="email"
              autoComplete="email"
              className="rc-auth-popover-input"
              placeholder={copy.email}
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
            <input
              type="password"
              autoComplete="current-password"
              className="rc-auth-popover-input"
              placeholder={copy.password}
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
            {renderMessages()}
            <div className="rc-auth-popover-actions">
              <button type="button" className="rc-auth-popover-link" onClick={() => switchMode('forgotPassword')}>
                {copy.switchToForgot}
              </button>
              <button type="submit" className="rc-auth-popover-primary" disabled={busy}>
                {busy ? copy.busy : copy.signInAction}
              </button>
            </div>
          </form>
          <div className="rc-auth-popover-foot">
            <span>{copy.fallbackToHostedUi}</span>
            <button type="button" className="rc-auth-popover-link" onClick={() => { void startCognitoLogin(); }}>
              Hosted UI →
            </button>
          </div>
        </>
      )}

      {mode === 'signUp' && (
        <>
          {renderHeader(copy.signUpTitle, copy.signUpSubtitle)}
          {renderTabs()}
          <p className="rc-auth-popover-subtitle">{copy.signUpSubtitle}</p>
          <form onSubmit={handleSignUp} className="rc-auth-popover-fields">
            <input
              ref={firstFieldRef}
              type="email"
              autoComplete="email"
              className="rc-auth-popover-input"
              placeholder={copy.email}
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              className="rc-auth-popover-input"
              placeholder={copy.password}
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              className="rc-auth-popover-input"
              placeholder={copy.confirmPassword}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
            />
            {renderMessages()}
            <div className="rc-auth-popover-actions">
              <button type="button" className="rc-auth-popover-link" onClick={() => switchMode('signIn')}>
                {copy.switchToSignIn}
              </button>
              <button type="submit" className="rc-auth-popover-primary" disabled={busy}>
                {busy ? copy.busy : copy.signUpAction}
              </button>
            </div>
          </form>
        </>
      )}

      {mode === 'confirmSignUp' && (
        <>
          {renderHeader(copy.confirmSignUpTitle, copy.confirmSignUpSubtitle)}
          <p className="rc-auth-popover-subtitle">{copy.confirmSignUpSubtitle}</p>
          <form onSubmit={handleConfirmSignUp} className="rc-auth-popover-fields">
            <input
              ref={firstFieldRef}
              type="email"
              autoComplete="email"
              className="rc-auth-popover-input"
              placeholder={copy.email}
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="rc-auth-popover-input"
              placeholder={copy.code}
              value={code}
              onChange={event => setCode(event.target.value)}
            />
            {renderMessages()}
            <div className="rc-auth-popover-actions">
              <button type="button" className="rc-auth-popover-link" onClick={handleResendCode} disabled={busy}>
                {copy.resendCodeAction}
              </button>
              <button type="submit" className="rc-auth-popover-primary" disabled={busy}>
                {busy ? copy.busy : copy.confirmCodeAction}
              </button>
            </div>
          </form>
          <div className="rc-auth-popover-foot">
            <button type="button" className="rc-auth-popover-link" onClick={() => switchMode('signIn')}>
              {copy.switchToSignIn}
            </button>
          </div>
        </>
      )}

      {mode === 'forgotPassword' && (
        <>
          {renderHeader(copy.forgotPasswordTitle, copy.forgotPasswordSubtitle)}
          <p className="rc-auth-popover-subtitle">{copy.forgotPasswordSubtitle}</p>
          <form onSubmit={handleForgotPassword} className="rc-auth-popover-fields">
            <input
              ref={firstFieldRef}
              type="email"
              autoComplete="email"
              className="rc-auth-popover-input"
              placeholder={copy.email}
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
            {renderMessages()}
            <div className="rc-auth-popover-actions">
              <button type="button" className="rc-auth-popover-link" onClick={() => switchMode('signIn')}>
                {copy.switchToSignIn}
              </button>
              <button type="submit" className="rc-auth-popover-primary" disabled={busy}>
                {busy ? copy.busy : copy.sendResetCodeAction}
              </button>
            </div>
          </form>
        </>
      )}

      {mode === 'confirmResetPassword' && (
        <>
          {renderHeader(copy.confirmResetPasswordTitle, copy.confirmResetPasswordSubtitle)}
          <p className="rc-auth-popover-subtitle">{copy.confirmResetPasswordSubtitle}</p>
          <form onSubmit={handleConfirmResetPassword} className="rc-auth-popover-fields">
            <input
              ref={firstFieldRef}
              type="email"
              autoComplete="email"
              className="rc-auth-popover-input"
              placeholder={copy.email}
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="rc-auth-popover-input"
              placeholder={copy.code}
              value={code}
              onChange={event => setCode(event.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              className="rc-auth-popover-input"
              placeholder={copy.newPassword}
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              className="rc-auth-popover-input"
              placeholder={copy.confirmPassword}
              value={confirmNewPassword}
              onChange={event => setConfirmNewPassword(event.target.value)}
            />
            {renderMessages()}
            <div className="rc-auth-popover-actions">
              <button type="button" className="rc-auth-popover-link" onClick={() => switchMode('signIn')}>
                {copy.switchToSignIn}
              </button>
              <button type="submit" className="rc-auth-popover-primary" disabled={busy}>
                {busy ? copy.busy : copy.confirmResetAction}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
