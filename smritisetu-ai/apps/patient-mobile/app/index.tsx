import { Redirect } from "expo-router";

/** The app always begins at the splash screen, which prepares offline storage. */
export default function Index() {
  return <Redirect href="/splash" />;
}
