import { create } from "zustand";

export interface SpotlightLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpotlightState {
  activeTargetId: string | null;
  targetLayout: SpotlightLayout | null;
  prompt: string | null;
  
  // Triggers the spotlight for a specific ID. The SpotlightTarget component
  // with this ID will detect this and report its layout.
  triggerSpotlight: (id: string, prompt?: string) => void;
  
  // Called by SpotlightTarget when it measures itself
  registerLayout: (id: string, layout: SpotlightLayout) => void;
  
  // Clears the overlay
  clearSpotlight: () => void;
}

export const useSpotlightStore = create<SpotlightState>((set) => ({
  activeTargetId: null,
  targetLayout: null,
  prompt: null,
  triggerSpotlight: (id, prompt) => 
    set({ activeTargetId: id, prompt: prompt ?? null, targetLayout: null }),
  registerLayout: (id, layout) => 
    set((state) => {
      // Only accept layout if this is still the active target
      if (state.activeTargetId === id) {
        return { targetLayout: layout };
      }
      return state;
    }),
  clearSpotlight: () => 
    set({ activeTargetId: null, targetLayout: null, prompt: null }),
}));
