import { PlatformStub } from "./index";
export const Platform = PlatformStub;
export const Linking = {
  canOpenURL: async () => true,
  openURL: async () => undefined,
};
export const AppState = {
  addEventListener: () => ({ remove: () => undefined }),
};
