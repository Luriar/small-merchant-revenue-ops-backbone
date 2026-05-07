import {
  buildCognitoLogoutUrl,
  clearStoredAuthSession,
  getStoredAuthSession,
  handleCognitoRedirectIfPresent,
  markRevenueLogoutRedirect,
  startCognitoLogin,
} from './revenueCockpitAuth';

const ROOT_ID = 'revenue-cognito-auth-overlay';

function currentLang(): 'ko' | 'en' {
  try {
    return localStorage.getItem('rc-lang') === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}

function ensureOverlayRoot(): HTMLDivElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.position = 'fixed';
  root.style.top = '12px';
  root.style.right = '12px';
  root.style.zIndex = '9999';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.gap = '8px';
  root.style.padding = '8px 10px';
  root.style.borderRadius = '999px';
  root.style.background = 'rgba(15, 23, 42, 0.86)';
  root.style.color = 'white';
  root.style.fontSize = '12px';
  root.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  root.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

  document.body.appendChild(root);
  return root;
}

function renderOverlay(message?: string) {
  const root = ensureOverlayRoot();
  const session = getStoredAuthSession();
  const lang = currentLang();

  root.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = message ?? (session?.email
    ? `${lang === 'ko' ? '계정' : 'Account'}: ${session.email}`
    : (lang === 'ko' ? '로그인이 필요합니다' : 'Sign in required'));
  root.appendChild(label);

  const button = document.createElement('button');
  button.type = 'button';
  button.style.border = '1px solid rgba(255,255,255,0.35)';
  button.style.borderRadius = '999px';
  button.style.padding = '4px 8px';
  button.style.background = 'rgba(255,255,255,0.12)';
  button.style.color = 'white';
  button.style.cursor = 'pointer';

  if (session) {
    button.textContent = lang === 'ko' ? '로그아웃' : 'Logout';
    button.onclick = () => {
      markRevenueLogoutRedirect();
      clearStoredAuthSession();
      window.location.assign(buildCognitoLogoutUrl());
    };
  } else {
    button.textContent = lang === 'ko' ? '로그인' : 'Login';
    button.onclick = async () => {
      renderOverlay(lang === 'ko' ? '로그인 페이지로 이동 중입니다.' : 'Redirecting to sign in...');
      await startCognitoLogin();
    };
  }

  root.appendChild(button);
}

async function bootRevenueCognitoAuth() {
  renderOverlay();

  try {
    const session = await handleCognitoRedirectIfPresent();
    if (session) {
      const lang = currentLang();
      renderOverlay(session.email
        ? `${lang === 'ko' ? '계정' : 'Account'}: ${session.email}`
        : (lang === 'ko' ? '로그인되었습니다' : 'Signed in'));

      window.setTimeout(() => {
        renderOverlay();
      }, 2400);

      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch (error) {
    renderOverlay(error instanceof Error ? error.message : (currentLang() === 'ko' ? '로그인에 실패했습니다.' : 'Login failed.'));
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootRevenueCognitoAuth();
    });
  } else {
    void bootRevenueCognitoAuth();
  }
}
