import { router } from "expo-router";
import { PatientForm } from "@/PatientForm";

export default function NewPatient() {
  return (
    <PatientForm
      role="caregiver"
      onCreated={(id, code) =>
        router.replace({ pathname: "/caregiver/patients/[id]", params: { id, justCreated: code } })
      }
    />
  );
}
