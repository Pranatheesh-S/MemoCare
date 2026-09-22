import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Role, User } from "./types";

function nameFrom(fb: FirebaseUser, role: Role): string {
  return fb.displayName ?? fb.email?.split("@")[0] ?? (role === "caregiver" ? "Caregiver" : "Health worker");
}

/**
 * The role lives in `users/{uid}` (Firebase Auth custom claims need the Admin
 * SDK). Read it after auth; create the doc on first sight so an account made
 * before this screen still opens. If Firestore is unreachable, fall back to
 * caregiver so the app is never stuck on the splash.
 */
async function loadUser(fb: FirebaseUser, fallbackRole: Role = "caregiver"): Promise<User> {
  const ref = doc(db, "users", fb.uid);
  let role = fallbackRole;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const stored = snap.data().role as Role | undefined;
      if (stored === "caregiver" || stored === "healthcare_worker") role = stored;
    } else {
      await setDoc(ref, {
        uid: fb.uid,
        name: nameFrom(fb, fallbackRole),
        email: fb.email ?? "",
        role: fallbackRole,
        createdAt: new Date().toISOString(),
        createdAtTs: serverTimestamp(),
      });
    }
  } catch {
    // offline / rules not published yet — open as caregiver
  }
  return { id: fb.uid, role, name: nameFrom(fb, role), contact: fb.email ?? "" };
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string, role?: Role) => Promise<User>;
  logout: () => Promise<void>;
  /** Back-compat alias for existing screens. */
  login: (email: string, password: string) => Promise<User>;
};

const Context = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fb) => {
      setUser(fb ? await loadUser(fb) : null);
      setLoading(false);
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const u = await loadUser(cred.user);
    setUser(u);
    return u;
  };

  const signUp = async (name: string, email: string, password: string, role: Role = "caregiver") => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
    try {
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: name.trim(),
        email: email.trim(),
        role,
        createdAt: new Date().toISOString(),
        createdAtTs: serverTimestamp(),
      });
    } catch {
      // rules not published yet — the role doc can be created on next sign-in
    }
    const u: User = {
      id: cred.user.uid,
      role,
      name: name.trim() || email.trim().split("@")[0],
      contact: email.trim(),
    };
    setUser(u);
    return u;
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <Context.Provider value={{ user, loading, signIn, signUp, logout, login: signIn }}>
      {children}
    </Context.Provider>
  );
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
