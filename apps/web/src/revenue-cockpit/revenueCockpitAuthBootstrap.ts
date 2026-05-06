import {
  buildCognitoLogoutUrl,
  clearStoredAuthSession,
  getStoredAuthSession,
  handleCognitoRedirectIfPresent,
  startCognitoLogin,
} from './revenueCockpitAuth';

const ROOT_ID = 'revenue-cognito-auth-overlay';

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

  root.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = message ?? (session?.email ? `Cognito: ${session.email}` : 'Cognito: not signed in');
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
    button.textContent = 'Logout';
    button.onclick = () => {
      clearStoredAuthSession();
      window.location.assign(buildCognitoLogoutUrl());
    };
  } else {
    button.textContent = 'Login';
    button.onclick = async () => {
      renderOverlay('Redirecting to Cognito...');
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
      renderOverlay(session.email ? `Cognito: ${session.email}` : 'Signed in with Cognito');

      window.setTimeout(() => {
        renderOverlay();
      }, 2400);

      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch (error) {
    renderOverlay(error instanceof Error ? error.message : 'Cognito login failed.');
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
