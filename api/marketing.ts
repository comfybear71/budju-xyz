import type { VercelRequest, VercelResponse } from "@vercel/node";
import { list } from "@vercel/blob";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const blobs: any[] = [];
    let cursor: string | undefined;

    // Paginate through all blobs in the Marketing/ prefix
    do {
      const result = await list({ prefix: "Marketing/", cursor, limit: 100 });
      blobs.push(...result.blobs);
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    // Categorize blobs
    const items = blobs.map((blob) => {
      const fullPath = blob.pathname;
      // Remove the "Marketing/" prefix for display
      const relativePath = fullPath.replace(/^Marketing\//, "");
      const name = relativePath.split("/").pop() || relativePath;
      const ext = name.split(".").pop()?.toLowerCase() || "";
      const isFolder = fullPath.endsWith("/");

      let category = "other";
      if (isFolder) category = "folder";
      else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) category = "image";
      else if (["mp4", "mov", "avi", "webm"].includes(ext)) category = "video";
      else if (["pdf", "doc", "docx", "txt", "rtf"].includes(ext)) category = "document";
      else if (["xls", "xlsx", "csv"].includes(ext)) category = "spreadsheet";
      else if (["ppt", "pptx"].includes(ext)) category = "presentation";
      else if (["zip", "rar", "7z"].includes(ext)) category = "archive";

      return {
        name,
        path: relativePath,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
        category,
      };
    }).filter((item) => !item.path.endsWith("/") && item.name);

    return res.status(200).json({ items, count: items.length });
  } catch (error: any) {
    console.error("Marketing blob list error:", error);
    return res.status(500).json({ error: error.message || "Failed to list marketing assets" });
  }
}
