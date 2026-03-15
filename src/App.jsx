import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Loader } from "rsuite";
import ChatMessage from "./components/ChatMessage";
import Login from "./Pages/Login";
import Register from "./Pages/Register";
import { auth } from "./firebase/firebase";
import { useChatStore } from "./store/useChatStore";

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Always reset the store first to avoid stale data during transition
      useChatStore.getState().resetStore();

      setUser(firebaseUser);
      if (firebaseUser) {
        await useChatStore.getState().loadChats(firebaseUser.uid);
      }
      setAuthLoading(false);
    });

    return () => {
      unsubscribe();
      useChatStore.getState().resetStore();
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#e3e3e3] flex items-center justify-center">
        <Loader size="lg" content="Loading your workspace..." vertical />
      </div>
    );
  }

  if (!user) {
    if (authView === "register") {
      return <Register onSwitchToLogin={() => setAuthView("login")} />;
    }
    return <Login onSwitchToRegister={() => setAuthView("register")} />;
  }

  return (
    <>
      <ChatMessage onLogout={handleLogout} userEmail={user.email || ""} />
    </>
  )
}

export default App
