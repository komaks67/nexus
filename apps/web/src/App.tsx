import { useEffect } from "react";
import { setUnauthorizedHandler } from "./lib/api";
import { useAuth } from "./stores/auth";
import { useChat } from "./stores/chat";
import { useLayout } from "./stores/layout";
import { useVoice } from "./stores/voice";
import { AuthScreen } from "./components/AuthScreen";
import { Spinner } from "./components/common/ui";
import { AppShell } from "./components/layout/AppShell";

export function App() {
  const status = useAuth((s) => s.status);

  useEffect(() => {
    // ログインが切れたら、画面の状態をすべて消してログイン画面へ戻す
    setUnauthorizedHandler(() => useAuth.getState().logout());
    void useAuth.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (status === "anonymous") {
      useVoice.getState().leave();
      useChat.getState().reset();
      useLayout.setState({ main: null, side: null, highlight: null });
    }
  }, [status]);

  if (status === "checking") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  return status === "authenticated" ? <AppShell /> : <AuthScreen />;
}
