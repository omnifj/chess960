import { create } from 'zustand';

export type DialogName = 'newGame' | 'settings' | 'pgn';

interface DialogState {
  newGame: boolean;
  settings: boolean;
  pgn: boolean;
  open: (dialog: DialogName) => void;
  close: (dialog: DialogName) => void;
  closeAll: () => void;
}

/** Tiny store for the app-level dialogs so any component can open them. */
export const useDialogStore = create<DialogState>()((set) => ({
  newGame: false,
  settings: false,
  pgn: false,
  open: (dialog) => set({ [dialog]: true } as Partial<DialogState>),
  close: (dialog) => set({ [dialog]: false } as Partial<DialogState>),
  closeAll: () => set({ newGame: false, settings: false, pgn: false }),
}));
