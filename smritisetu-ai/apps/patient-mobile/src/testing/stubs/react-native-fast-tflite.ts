export async function loadTensorflowModel(): Promise<never> {
  throw new Error("react-native-fast-tflite is not available in Node tests");
}

export type TensorflowModel = {
  runSync: (inputs: Float32Array[]) => ArrayLike<number>[];
};
