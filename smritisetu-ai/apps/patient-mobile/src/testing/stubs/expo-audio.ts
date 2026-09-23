import { AudioStub } from "./index";
export const createAudioPlayer = AudioStub.createAudioPlayer;
export const setAudioModeAsync = AudioStub.setAudioModeAsync;
export type AudioPlayer = { play: () => void; remove: () => void };
