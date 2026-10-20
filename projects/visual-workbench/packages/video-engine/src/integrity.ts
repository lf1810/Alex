import type {ProjectDocument} from "@ajiunotes/contracts";
import type {AssetIntegrity, AssetMap} from "./types.js";

export const diagnoseAssetMap = (
  project: ProjectDocument,
  assetMap: AssetMap,
  exists: (path: string) => boolean,
): AssetIntegrity[] =>
  project.assets.map((asset) => {
    const resolvedPath = assetMap[asset.id];
    if (asset.ingestStatus === "quarantined" || asset.ingestStatus === "rejected") {
      return {
        assetId: asset.id,
        sourcePath: asset.sourcePath,
        ...(resolvedPath ? {resolvedPath} : {}),
        status: "blocked" as const,
        reason: `素材状态为 ${asset.ingestStatus}`,
      };
    }
    if (!resolvedPath || !exists(resolvedPath)) {
      return {
        assetId: asset.id,
        sourcePath: asset.sourcePath,
        ...(resolvedPath ? {resolvedPath} : {}),
        status: "missing" as const,
        reason: "本地文件不存在或尚未映射",
      };
    }
    return {assetId: asset.id, sourcePath: asset.sourcePath, resolvedPath, status: "ready" as const};
  });
