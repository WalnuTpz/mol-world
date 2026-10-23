import { getAppConfig } from "@/lib/appConfig";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";
export default async function UploadPage() {
  const config = await getAppConfig();
  return <UploadForm maxSizeMb={config.uploadMaxSizeMb} />;
}
