import { S3Handler, S3Event } from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import csvParser from "csv-parser";
import { Readable } from "stream";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler: S3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const getObjectCommand = new GetObjectCommand({
      Bucket: record.s3.bucket.name,
      Key: record.s3.object.key,
    });

    const response = await s3Client.send(getObjectCommand);

    if (!response.Body || !(response.Body instanceof Readable)) {
      console.error("Could not retrieve the object from S3.");
      return;
    }

    const s3Stream = response.Body;

    s3Stream
      .pipe(csvParser())
      .on("data", (data) => {
        console.log("data: ", data);
      })
      .on("end", async () => {
        try {
          console.log(
            `Copy from ${record.s3.bucket.name}/${record.s3.object.key}`
          );

          const copyObjectCommand = new CopyObjectCommand({
            Bucket: record.s3.bucket.name,
            CopySource: `${record.s3.bucket.name}/${record.s3.object.key}`,
            Key: record.s3.object.key.replace("uploaded", "parsed"),
          });

          await s3Client.send(copyObjectCommand);

          console.log(
            `Copied into ${
              record.s3.bucket.name
            }/${record.s3.object.key.replace("uploaded", "parsed")}`
          );
        } catch (error) {
          console.error("Error copying object:", error);
        }

        // Get the version ID of the object
        const listObjectVersionsCommand = new ListObjectVersionsCommand({
          Bucket: record.s3.bucket.name,
          Prefix: record.s3.object.key,
        });

        const versionsResponse = await s3Client.send(listObjectVersionsCommand);

        if (!versionsResponse.Versions) {
          console.log("No versions found");
        }

        let versionId: string | undefined;

        if (versionsResponse.Versions) {
          versionId = versionsResponse.Versions.find(
            (version) => version.IsLatest
          )?.VersionId;
        }

        if (!versionId) {
          console.error("Could not find the latest version of the object.");
          return;
        }

        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key,
          VersionId: versionId,
        });

        console.log("Deleting object:", record.s3.object.key);
        await s3Client.send(deleteObjectCommand);
        console.log("Object deleted:", record.s3.object.key);

        console.log(
          `Copied into ${record.s3.bucket.name}/${record.s3.object.key.replace(
            "uploaded",
            "parsed"
          )}`
        );
      });
  }
};
