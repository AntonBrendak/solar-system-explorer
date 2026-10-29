import { redirect } from "next/navigation";

export default function PlanetLabPage() {
  redirect("/?planet=earth");
}
