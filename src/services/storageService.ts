import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";

/** A stored file reference kept on a record (small; the bytes live in Storage). */
export type StoredFile = {
  path: string; // Storage path, for deletion
  name: string; // original filename
  size: number; // bytes
  url: string; // tokenized download URL, for viewing
  contentType?: string;
};

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

/**
 * Upload a file for a Teaching HQ record. `folder` groups files (e.g. "plans"),
 * `id` scopes them to a record. Returns the stored reference to save on the doc.
 */
export async function uploadTeachingFile(
  folder: string,
  id: string,
  file: File
): Promise<StoredFile> {
  const path = `teaching/${folder}/${id}/${Date.now()}-${sanitize(file.name)}`;
  const r = ref(storage, path);
  // Guard against a silent hang (Storage not enabled / rules not deployed /
  // network stall) so the UI surfaces a real error instead of spinning forever.
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s — check that Firebase Storage is enabled and its rules are deployed.`)),
        ms
      );
    });
    return Promise.race([p, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
  };

  await withTimeout(
    uploadBytes(r, file, { contentType: file.type || "application/octet-stream" }),
    60000,
    "Upload"
  );
  const url = await withTimeout(getDownloadURL(r), 20000, "Getting the file URL");
  return { path, name: file.name, size: file.size, url, contentType: file.type };
}

/** Best-effort delete; ignores "not found" so removing a record never blocks. */
export async function deleteTeachingFile(path: string): Promise<void> {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.warn("Could not delete storage file:", path, err);
  }
}
