import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  authLogin,
  authSignup,
  authMe,
  authForgotPassword,
  authResetPassword,
  setApiToken,
} from "@/lib/api";

const STORAGE_KEY = "myworld_session_v1";

const AuthContext = createContext({
  user: null,
  address: null,
  isAuthenticated: false,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  requestPasswordReset: async () => {},
  resetPassword: async () => {},
});

async function storeSession(user, token) {
  const data = JSON.stringify({ user, token });
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(STORAGE_KEY, data);
  } else {
    localStorage.setItem(STORAGE_KEY, data);
  }
  setApiToken(token);
}

async function clearSession() {
  if (Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  setApiToken(null);
}

async function loadSession() {
  try {
    let raw = null;
    if (Platform.OS !== "web") {
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session = await loadSession();
        if (session?.token) {
          setApiToken(session.token);
          const { user: fresh } = await authMe();
          if (fresh) {
            setUser(fresh);
            await storeSession(fresh, session.token);
          } else {
            await clearSession();
          }
        }
      } catch {
        await clearSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (username, password) => {
    const { user: u, token } = await authLogin({ username, password });
    await storeSession(u, token);
    setUser(u);
  }, []);

  const signUp = useCallback(async (username, email, password) => {
    const { user: u, token } = await authSignup({ username, email, password });
    await storeSession(u, token);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    await authForgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (email, code, newPassword) => {
    const { user: u, token } = await authResetPassword({
      email,
      code,
      newPassword,
    });
    await storeSession(u, token);
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        address: user?.address || null,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
