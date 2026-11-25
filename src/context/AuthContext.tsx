import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { clearLastActivity } from '../lib/sessionIdle';
import { clearSession, getAuthToken, getAuthUser, setSession, updateAuthUser } from '../lib/nativeSession';

interface User {
  id: number;
  username: string;
  role: string;
  entity_id: number | null;
  /** True while the account still runs on its factory-default password. */
  must_change_password?: boolean;
  entity?: {
    id: number;
    name_ar: string;
    name_en: string;
    country_code: string;
    currency: string;
  } | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  hasRole: (roles: string | string[]) => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedToken, storedUser] = await Promise.all([getAuthToken(), getAuthUser()]);
      if (cancelled) return;

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(storedUser);
        setIsLoading(false);
        return;
      }
      if (storedToken && !storedUser) await clearSession();

      // No local session: if this deployment sits behind Cloudflare Access, the
      // browser already carries its assertion and can be signed in without a
      // password. Any refusal falls through to the ordinary password form.
      try {
        const configResponse = await fetch('/api/auth/sso-config');
        if (configResponse.ok && (await configResponse.json()).enabled) {
          const response = await fetch('/api/auth/sso-login', { method: 'POST' });
          if (response.ok) {
            const data = await response.json();
            if (!cancelled) {
              setToken(data.token);
              setUser(data.user);
              await setSession(data.token, data.user);
            }
          }
        }
      } catch {
        // Offline or no issuer configured — the password form remains the way in.
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // main.tsx inspects every /api response and emits these events when the token is
  // no longer usable. Clearing the cached user here makes App render the login
  // (or password-change) screen instead of a sidebar full of dead shortcuts.
  useEffect(() => {
    const onSessionExpired = () => {
      setToken(null);
      setUser(null);
      void clearSession();
      clearLastActivity();
    };
    const onPasswordChangeRequired = () => {
      setUser((current) => {
        if (!current) return current;
        const next = { ...current, must_change_password: true };
        void updateAuthUser({ must_change_password: true });
        return next;
      });
    };
    window.addEventListener('auth:session-expired', onSessionExpired);
    window.addEventListener('auth:password-change-required', onPasswordChangeRequired);
    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
      window.removeEventListener('auth:password-change-required', onPasswordChangeRequired);
    };
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    void setSession(newToken, newUser);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    void clearSession();
    // A fresh sign-in must always start a new 15-minute idle window.
    clearLastActivity();

    fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }).catch(console.error);
  };

  const hasRole = (roles: string | string[]) => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      isAuthenticated: !!user,
      hasRole,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};