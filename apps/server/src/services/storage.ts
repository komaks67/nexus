import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

/**
 * Cloudflare R2（S3互換ストレージ）との連携。
 * サーバーはファイル本体を受け取らず、「期限付きの許可URL（署名付きURL）」だけを発行する。
 * → ブラウザが R2 へ直接送るので、サーバーに負荷がかからず大容量でも速い。
 */
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

const UPLOAD_URL_TTL = 60 * 60 * 6; // パートのアップロードURLは6時間有効
const DOWNLOAD_URL_TTL = 60 * 10; // 閲覧用URLは10分

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
  );
  if (!res.UploadId) throw new Error("UploadId が取得できませんでした");
  return res.UploadId;
}

export async function presignPartUrls(
  key: string,
  uploadId: string,
  partCount: number,
): Promise<{ partNumber: number; url: string }[]> {
  const tasks = Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => ({
    partNumber,
    url: await getSignedUrl(
      s3,
      new UploadPartCommand({ Bucket: env.S3_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: UPLOAD_URL_TTL },
    ),
  }));
  return Promise.all(tasks);
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: env.S3_BUCKET, Key: key, UploadId: uploadId }));
}

/** プレビュー/ダウンロード用の短時間URL */
export async function presignDownloadUrl(
  key: string,
  filename: string,
  contentType: string,
  inline: boolean,
): Promise<string> {
  // ファイル名の特殊文字でヘッダーが壊れないよう RFC 5987 形式でエンコード
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentType: inline ? contentType : "application/octet-stream",
      ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL },
  );
}
