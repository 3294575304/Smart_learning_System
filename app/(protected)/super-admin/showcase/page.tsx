import { ApplicationShowcase } from "@/components/super-admin/showcase/application-showcase";
import { getApplicationShowcase } from "@/services/super-admin/showcase";

export default async function ShowcasePage() {
  const data = await getApplicationShowcase();
  return <ApplicationShowcase data={data} />;
}
