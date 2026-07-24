export type ProcessedVideo = {
  file: File;
  width: number;
  height: number;
  durationSec: number;
  thumbnailBlob: Blob;
};

const MAX_DURATION_SEC = 180; // 3 menit, cukup untuk konten pendek gaya Reels
const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80MB, selaras dengan limit bucket storage

export function validateVideoFile(file: File): string | null {
  if (!file.type.startsWith("video/")) return "File harus berupa video.";
  if (file.size > MAX_FILE_SIZE) return "Ukuran video maksimal 80MB.";
  return null;
}

export function processVideo(file: File): Promise<ProcessedVideo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      const { duration } = video;

      if (duration > MAX_DURATION_SEC) {
        URL.revokeObjectURL(url);
        reject(new Error(`Video maksimal ${Math.floor(MAX_DURATION_SEC / 60)} menit.`));
        return;
      }

      // Ambil frame di detik ke-0.1 (bukan persis 0, supaya tidak dapat frame
      // hitam/kosong yang kadang muncul di awal beberapa encoding video).
      video.currentTime = Math.min(0.1, duration);
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas tidak didukung"));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Gagal membuat thumbnail"));
            return;
          }
          resolve({
            file,
            width: video.videoWidth,
            height: video.videoHeight,
            durationSec: video.duration,
            thumbnailBlob: blob,
          });
        },
        "image/jpeg",
        0.8
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal memuat video. Pastikan formatnya didukung (MP4/WebM)."));
    };

    video.src = url;
  });
}
