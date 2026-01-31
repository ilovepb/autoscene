export interface ImageStoreEntry {
  id: string;
  image: HTMLImageElement;
  imageData: ImageData;
  filename: string;
}

const store = new Map<string, ImageStoreEntry>();

export function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function storeImage(file: File): Promise<string> {
  const id = crypto.randomUUID();
  const img = new Image();
  img.crossOrigin = "anonymous";
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });

  const imageData = getImageData(img);

  store.set(id, { id, image: img, imageData, filename: file.name });
  return id;
}

export function getImage(id: string): ImageStoreEntry | undefined {
  return store.get(id);
}

export function getAllImages(): ImageStoreEntry[] {
  return Array.from(store.values());
}

export function removeImage(id: string): void {
  store.delete(id);
}
