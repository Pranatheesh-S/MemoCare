import { router, type Href } from "expo-router";
import { PatientForm } from "@/PatientForm";

export default function NewWorkerPatient() {
  return (
    <PatientForm
      role="healthcare_worker"
      eyebrow="Add to your care list"
      onCreated={(id) =>
        router.replace({ pathname: "/worker/patients/[id]", params: { id } } as unknown as Href)
      }
    />
  );
}
