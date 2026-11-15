"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createDemoState, isDemoState, type DemoState } from "@/lib/mockData";
const KEY = "calljarvis-demo-v1";
const Context = createContext<{
  state: DemoState;
  update: (fn: (s: DemoState) => DemoState) => void;
  reset: () => void;
  storageWarning: boolean;
  now: number;
} | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [now, setNow] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
      let initial = createDemoState();
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (isDemoState(saved)) initial = saved;
        }
      } catch {
        setStorageWarning(true);
      }
      setState(initial);
    }, 0);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state)
        try {
          localStorage.setItem(KEY, JSON.stringify(state));
        } catch {
          setStorageWarning(true);
        }
    }, 0);
    return () => clearTimeout(timer);
  }, [state]);
  if (!state)
    return (
      <div className="loading" role="status">
        Getting Jarvis ready…
      </div>
    );
  return (
    <Context.Provider
      value={{
        state,
        update: (fn) =>
          setState((previous) => (previous ? fn(previous) : previous)),
        reset: () => setState(createDemoState()),
        storageWarning,
        now,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing DemoProvider");
  return value;
}
