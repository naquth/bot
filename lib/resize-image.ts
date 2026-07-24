export type ResizedImage = {
  blob: Blob;
  width: number;
  height: number;
};

function resizeImageTo(file: File, maxDim: number, quality: number): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas tidak didukung"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error("Gagal memproses gambar"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("Gagal memuat gambar"));
    img.src = url;
  });
}

export function resizePostImage(file: File, maxDim = 1600): Promise<ResizedImage> {
  return resizeImageTo(file, maxDim, 0.86);
}

export function resizeAvatarImage(file: File, maxDim = 512): Promise<ResizedImage> {
  return resizeImageTo(file, maxDim, 0.88);
}
