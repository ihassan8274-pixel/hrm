import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
      setIsLoading(false);
      return;
    }

    // No local session: if this deployment sits behind Cloudflare Access, the
    // browser already carries its assertion and can be signed in without a
    // password. Any refusal falls through to the ordinary password form.
    let cancelled = false;
    (async () => {
      try {
        const configResponse = await fetch('/api/auth/sso-config');
        if (configResponse.ok && (await configResponse.json()).enabled) {
          const response = await fetch('/api/auth/sso-login', { method: 'POST' });
          if (response.ok) {
            const data = await response.json();
            if (!cancelled) {
              setToken(data.token);
              setUser(data.user);
              localStorage.setItem('auth_token', data.token);
              localStorage.setItem('auth_user', JSON.stringify(data.user));
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

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    
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