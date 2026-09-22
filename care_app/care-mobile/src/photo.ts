import * as ImagePicker from "expo-image-picker";

/**
 * Profile photos are stored as a small base64 JPEG on the patient's Firestore
 * doc (the free Spark plan has no Cloud Storage). A Firestore document must stay
 * under 1 MiB, so we crop to a square, compress hard, and reject anything still
 * too large.
 */
const MAX_BASE64_CHARS = 900_000; // ~670 KB of image; leaves room in the 1 MiB doc

export type PickedPhoto = { dataUri: string; bytes: number };

/**
 * Lets the caregiver pick and crop a square profile photo. Returns a
 * `data:image/jpeg;base64,…` string ready to store and to use as an <Image>
 * source, or null if they cancel / deny access. Throws with a friendly message
 * if the picked image is too big even after compression.
 */
export async function pickProfilePhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.3,
    base64: true,
  });
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset?.base64) return null;

  const dataUri = `data:image/jpeg;base64,${asset.base64}`;
  if (dataUri.length > MAX_BASE64_CHARS) {
    throw new Error("That photo is too large. Please choose a smaller or simpler one.");
  }
  return { dataUri, bytes: Math.round((asset.base64.length * 3) / 4) };
}

/**
 * Picks a picture for a memory. Same base64-on-Firestore approach as the profile
 * photo, but keeps the original framing (no forced square) and lets the caregiver
 * crop freely. Each memory is its own Firestore doc, so it has the full 1 MiB
 * budget to itself.
 */
export async function pickMemoryImage(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.3,
    base64: true,
  });
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset?.base64) return null;

  const dataUri = `data:image/jpeg;base64,${asset.base64}`;
  if (dataUri.length > MAX_BASE64_CHARS) {
    throw new Error("That picture is too large. Please choose a smaller or simpler one.");
  }
  return { dataUri, bytes: Math.round((asset.base64.length * 3) / 4) };
}
