import type { AuthResponse, LoginInput, RegisterInput, UserDTO } from "@nexus/shared";
import { create } from "zustand";
import { api, errorMessage, getToken, setToken } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";

type Status = "checking" | "anonymous" | "authenticated";

interface AuthState {
  status: Status;
  user: UserDTO | null;
  token: string | null;
  error: string | null;
  submitting: boolean;
  bootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: "checking",
  user: null,
  token: null,
  error: null,
  submitting: false,

  /** 起動時: 保存済みトークンが有効か確認 */
  bootstrap: async () => {
    const token = getToken();
    if (!token) {
      set({ status: "anonymous" });
      return;
    }
    try {
      const { user } = await api<{ user: UserDTO }>("/api/auth/me");
      connectSocket(token);
      set({ status: "authenticated", user, token });
    } catch {
      setToken(null);
      set({ status: "anonymous", user: null, token: null });
    }
  },

  login: async (input) => {
    set({ submitting: true, error: null });
    try {
      const res = await api<AuthResponse>("/api/auth/login", { method: "POST", body: input });
      setToken(res.token);
      connectSocket(res.token);
      set({ status: "authenticated", user: res.user, token: res.token, submitting: false });
    } catch (err) {
      set({ error: errorMessage(err), submitting: false });
    }
  },

  register: async (input) => {
    set({ submitting: true, error: null });
    try {
      const res = await api<AuthResponse>("/api/auth/register", { method: "POST", body: input });
      setToken(res.token);
      connectSocket(res.token);
      set({ status: "authenticated", user: res.user, token: res.token, submitting: false });
    } catch (err) {
      set({ error: errorMessage(err), submitting: false });
    }
  },

  logout: () => {
    disconnectSocket();
    setToken(null);
    set({ status: "anonymous", user: null, token: null, error: null });
  },
}));
