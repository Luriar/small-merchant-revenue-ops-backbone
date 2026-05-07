import { handleCognitoRedirectIfPresent } from './revenueCockpitAuth';

async function bootRevenueCognitoAuth() {
  try {
    const session = await handleCognitoRedirectIfPresent();
    if (session) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch (error) {
    console.warn(
      '[Revenue OS] Auth redirect handling failed:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void bootRevenueCognitoAuth(); });
  } else {
    void bootRevenueCognitoAuth();
  }
}
