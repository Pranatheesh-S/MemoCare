const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = config.resolver;

config.resolver.assetExts = assetExts.includes("tflite") ? assetExts : [...assetExts, "tflite"];
config.resolver.sourceExts = sourceExts.filter((ext) => ext !== "tflite");

module.exports = config;
